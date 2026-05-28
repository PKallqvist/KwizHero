import { describe, expect, it } from "vitest";
import { BADGE_CATALOG, evaluateBadgeUnlocks, getBadgeDefinition, localizeBadgeText } from "./badges";

describe("badge catalog", () => {
  it("includes configurable tiered and discovery badge definitions", () => {
    expect(BADGE_CATALOG.some((badge) => badge.type === "tiered")).toBe(true);
    expect(BADGE_CATALOG.some((badge) => badge.type === "discovery")).toBe(true);
  });

  it("keeps locale-specific copy inside the badge config", () => {
    const badge = getBadgeDefinition("nighthawk");
    expect(badge?.type).toBe("discovery");
    expect(localizeBadgeText(badge?.name ?? { en: "", sv: "" }, "sv")).toBe("Nattuggla");
  });
});

describe("evaluateBadgeUnlocks", () => {
  it("queues every newly earned tier in order", () => {
    const events = evaluateBadgeUnlocks(
      {
        quizzesCompleted: 10,
        triggeredEventKeys: [],
        earnedTierByBadgeId: {},
        earnedDiscoveryBadgeIds: [],
      },
      "en"
    );

    const tierEvents = events.filter((event) => event.badgeId === "quiz_veteran");
    expect(tierEvents.map((event) => event.tier)).toEqual([1, 2, 3]);
    expect(tierEvents[0]?.displayName).toContain("Iron");
  });

  it("returns discovery unlocks from configured trigger keys", () => {
    const events = evaluateBadgeUnlocks(
      {
        quizzesCompleted: 0,
        triggeredEventKeys: ["dead_of_night"],
        earnedTierByBadgeId: {},
        earnedDiscoveryBadgeIds: [],
      },
      "sv"
    );

    const discovery = events.find((event) => event.badgeId === "nighthawk");
    expect(discovery?.tier).toBeNull();
    expect(discovery?.flavourText).toBe("Du slutförde ett quiz mitt i natten. De flesta sover just nu.");
  });
});