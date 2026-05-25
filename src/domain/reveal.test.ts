import { describe, expect, it, vi, afterEach } from "vitest";
import { resolveRevealPhase } from "./reveal";

afterEach(() => {
  vi.useRealTimers();
});

describe("resolveRevealPhase — instant", () => {
  it("always returns full regardless of completion or revealAt", () => {
    expect(resolveRevealPhase("instant", false, null)).toBe("full");
    expect(resolveRevealPhase("instant", true, null)).toBe("full");
    expect(resolveRevealPhase("instant", false, new Date(Date.now() + 99999).toISOString())).toBe("full");
  });
});

describe("resolveRevealPhase — on_completion", () => {
  it("returns score_only while session is incomplete", () => {
    expect(resolveRevealPhase("on_completion", false, null)).toBe("score_only");
  });

  it("returns full once session is complete", () => {
    expect(resolveRevealPhase("on_completion", true, null)).toBe("full");
  });
});

describe("resolveRevealPhase — scheduled", () => {
  it("returns hidden when revealAt is null", () => {
    expect(resolveRevealPhase("scheduled", true, null)).toBe("hidden");
  });

  it("returns hidden when revealAt is in the future", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(resolveRevealPhase("scheduled", true, future)).toBe("hidden");
  });

  it("returns full when revealAt is in the past", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(resolveRevealPhase("scheduled", true, past)).toBe("full");
  });

  it("returns full exactly at revealAt boundary", () => {
    vi.useFakeTimers();
    const revealAt = new Date("2025-06-01T12:00:00Z").toISOString();
    vi.setSystemTime(new Date("2025-06-01T12:00:00Z"));
    expect(resolveRevealPhase("scheduled", true, revealAt)).toBe("full");
  });

  it("ignores sessionComplete — scheduled reveal is time-gated only", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(resolveRevealPhase("scheduled", false, future)).toBe("hidden");
    expect(resolveRevealPhase("scheduled", true, future)).toBe("hidden");
  });
});
