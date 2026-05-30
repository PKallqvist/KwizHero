import { describe, expect, it } from "vitest";
import { generateAutoAccessCodePreview, isCustomAccessCodeFormatValid, normalizeAccessCode } from "./quizRepository";

describe("access code helpers", () => {
  it("normalizes access codes case-insensitively and trims whitespace", () => {
    expect(normalizeAccessCode("  SpA-101  ")).toBe("spa-101");
  });

  it("accepts valid custom code formats", () => {
    expect(isCustomAccessCodeFormatValid("abc-123")).toBe(true);
    expect(isCustomAccessCodeFormatValid("ABCD")).toBe(true);
  });

  it("rejects invalid custom code formats", () => {
    expect(isCustomAccessCodeFormatValid("ab")).toBe(false);
    expect(isCustomAccessCodeFormatValid("space code")).toBe(false);
    expect(isCustomAccessCodeFormatValid("symbols!")).toBe(false);
  });

  it("generates auto codes with the expected length and character set", () => {
    const code = generateAutoAccessCodePreview();
    expect(code).toHaveLength(20);
    expect(/^[A-Za-z0-9]+$/.test(code)).toBe(true);
  });
});