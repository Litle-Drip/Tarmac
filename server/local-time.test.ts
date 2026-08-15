import { describe, it, expect } from "vitest";
import { localClock, localClockAt } from "./local-time.js";

/**
 * These tests exist because the estimator used to read the server's clock and
 * apply it to every airport. On a UTC host that put Honolulu's morning rush at
 * 8pm local.
 */
describe("localClock", () => {
  // 17:00 UTC on a Saturday.
  const instant = new Date("2026-08-15T17:00:00.000Z");

  it("resolves the same instant differently per airport", () => {
    expect(localClock(instant, "UTC").hour).toBe(17);
    expect(localClock(instant, "America/New_York").hour).toBe(13); // EDT, UTC-4
    expect(localClock(instant, "America/Chicago").hour).toBe(12);
    expect(localClock(instant, "America/Denver").hour).toBe(11);
    expect(localClock(instant, "America/Los_Angeles").hour).toBe(10);
    expect(localClock(instant, "Pacific/Honolulu").hour).toBe(7);
  });

  it("handles zones that do not observe daylight saving", () => {
    // Phoenix stays at UTC-7 year round, unlike Denver.
    const winter = new Date("2026-01-15T17:00:00.000Z");
    expect(localClock(winter, "America/Phoenix").hour).toBe(10);
    expect(localClock(winter, "America/Denver").hour).toBe(10);

    const summer = new Date("2026-07-15T17:00:00.000Z");
    expect(localClock(summer, "America/Phoenix").hour).toBe(10);
    expect(localClock(summer, "America/Denver").hour).toBe(11);
  });

  it("rolls the weekday back when the local date is behind UTC", () => {
    // 02:00 UTC Sunday is still Saturday evening in Los Angeles.
    const lateSaturday = new Date("2026-08-16T02:00:00.000Z");
    expect(localClock(lateSaturday, "UTC").dayOfWeek).toBe(0); // Sunday
    expect(localClock(lateSaturday, "America/Los_Angeles").dayOfWeek).toBe(6); // Saturday
    expect(localClock(lateSaturday, "America/Los_Angeles").hour).toBe(19);
  });

  it("reports minutes for hour interpolation", () => {
    const halfPast = new Date("2026-08-15T17:30:00.000Z");
    expect(localClock(halfPast, "UTC").minute).toBe(30);
  });

  it("falls back to UTC for an unknown zone instead of throwing", () => {
    expect(localClock(instant, "Not/AZone").hour).toBe(17);
  });

  it("handles midnight as hour 0, not 24", () => {
    const midnight = new Date("2026-08-15T00:00:00.000Z");
    expect(localClock(midnight, "UTC").hour).toBe(0);
  });
});

describe("localClockAt", () => {
  it("advances the local clock by the offset", () => {
    const instant = new Date("2026-08-15T17:00:00.000Z");
    expect(localClockAt(instant, "America/Los_Angeles", 0).hour).toBe(10);
    expect(localClockAt(instant, "America/Los_Angeles", 120).hour).toBe(12);
  });

  it("wraps past midnight", () => {
    // 06:00 UTC Saturday is 23:00 Friday in Los Angeles; two hours later is
    // 01:00 on Saturday.
    const instant = new Date("2026-08-15T06:00:00.000Z");
    expect(localClock(instant, "America/Los_Angeles").dayOfWeek).toBe(5); // Friday

    const later = localClockAt(instant, "America/Los_Angeles", 120);
    expect(later.hour).toBe(1);
    expect(later.dayOfWeek).toBe(6); // Saturday
  });
});
