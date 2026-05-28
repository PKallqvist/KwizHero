import { describe, expect, it } from "vitest";
import { shouldShowFirstDiscoveryLabel } from "./playerProfileLogic";

describe("shouldShowFirstDiscoveryLabel", () => {
  it("returns true when at least one discovery exists and label has not been seen", () => {
    expect(
      shouldShowFirstDiscoveryLabel({
        discoveryBadgeCount: 1,
        firstDiscoveryProfileLabelSeen: false,
      })
    ).toBe(true);
  });

  it("returns false when no discovery badges are earned", () => {
    expect(
      shouldShowFirstDiscoveryLabel({
        discoveryBadgeCount: 0,
        firstDiscoveryProfileLabelSeen: false,
      })
    ).toBe(false);
  });

  it("returns false after label has already been seen", () => {
    expect(
      shouldShowFirstDiscoveryLabel({
        discoveryBadgeCount: 3,
        firstDiscoveryProfileLabelSeen: true,
      })
    ).toBe(false);
  });
});