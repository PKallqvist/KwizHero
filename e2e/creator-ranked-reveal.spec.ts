import { test, expect, type Page } from "@playwright/test";

function uniqueEmail(): string {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@kwizhero.test`;
}

async function signUpNewCreator(page: Page): Promise<void> {
  await page.goto("/login");
  // First click switches the form from sign-in to sign-up mode.
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Email").fill(uniqueEmail());
  await page.getByLabel("Password").fill("e2e-test-password-1");
  // Second click submits the now-visible sign-up form.
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/my-quizzes");
}

test.describe("Creator wizard — ranked reveal (rules step)", () => {
  test("ranked results toggle and tiebreaker editor, gated to scheduled reveal mode", async ({ page }) => {
    await signUpNewCreator(page);

    await page.goto("/create");
    await page.getByLabel("Title").fill("E2E test quiz");
    await page.getByLabel("Description").fill("Created by an automated test");
    await page.getByRole("button", { name: "Next" }).click();

    // Mantine Switch/Checkbox renders the real <input> visually hidden (clipped to a 0-size
    // box) behind a styled track, so Playwright can't click or assert visibility on it
    // directly. Click the associated visible <label> text instead; assert state via the
    // input itself (toBeChecked/toHaveCount don't require visibility).
    const rankedSwitch = page.getByLabel("Ranked results");
    const rankedSwitchLabel = page.getByText("Ranked results", { exact: true });
    const includeTiebreaker = page.getByLabel("Include a tiebreaker question");
    const includeTiebreakerLabel = page.getByText("Include a tiebreaker question", { exact: true });

    // Reveal mode defaults to "Scheduled", so Ranked results should already be present.
    await expect(rankedSwitch).toHaveCount(1);
    await expect(rankedSwitch).not.toBeChecked();
    await expect(includeTiebreaker).toHaveCount(0);

    await rankedSwitchLabel.click();
    await expect(rankedSwitch).toBeChecked();
    await expect(includeTiebreaker).toHaveCount(1);
    await expect(includeTiebreaker).not.toBeChecked();
    const tiebreakerPrompt = page.getByLabel("Tiebreaker question", { exact: true });
    await expect(tiebreakerPrompt).toHaveCount(0);

    await includeTiebreakerLabel.click();
    await expect(tiebreakerPrompt).toBeVisible();
    await tiebreakerPrompt.fill("How many beans are in the jar?");
    await page.getByLabel("Correct value").fill("250");
    await expect(page.getByRole("textbox", { name: "Tiebreaker rule" })).toBeVisible();

    // Switching reveal mode away from Scheduled hides and clears ranked reveal entirely.
    const revealModeSelect = page.getByRole("textbox", { name: "Reveal mode" });
    await revealModeSelect.click();
    await page.getByRole("option", { name: "Instant" }).click();
    await expect(page.getByLabel("Ranked results")).toHaveCount(0);

    // Switching back to Scheduled comes back unchecked — the prior choice isn't restored.
    await revealModeSelect.click();
    await page.getByRole("option", { name: "Scheduled" }).click();
    await expect(page.getByLabel("Ranked results")).not.toBeChecked();
    await expect(page.getByLabel("Include a tiebreaker question")).toHaveCount(0);
  });
});
