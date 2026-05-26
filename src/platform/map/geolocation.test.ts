import { describe, expect, it } from "vitest";
import { distanceMeters } from "./geolocation";

describe("distanceMeters", () => {
  it("returns 0 for identical coordinates", () => {
    const coord = { lat: 57.7089, lng: 11.9746 };
    expect(distanceMeters(coord, coord)).toBe(0);
  });

  it("returns approx 111km per degree latitude", () => {
    const a = { lat: 0, lng: 0 };
    const b = { lat: 1, lng: 0 };
    const d = distanceMeters(a, b);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it("correctly measures ~157m between two Stockholm points", () => {
    // Two points ~157m apart near Gothenburg city center
    const a = { lat: 57.7089, lng: 11.9746 };
    const b = { lat: 57.7100, lng: 11.9746 };
    const d = distanceMeters(a, b);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(200);
  });

  it("is symmetric", () => {
    const a = { lat: 57.7089, lng: 11.9746 };
    const b = { lat: 57.7200, lng: 12.0000 };
    expect(distanceMeters(a, b)).toBeCloseTo(distanceMeters(b, a), 6);
  });
});
