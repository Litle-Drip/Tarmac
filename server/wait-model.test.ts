import { describe, it, expect } from "vitest";
import {
  estimateWait,
  decayWeight,
  weightedQuantile,
  isPlausible,
  HALF_LIFE_MINUTES,
  type Observation,
} from "./wait-model.js";

const NOW = new Date("2026-08-15T17:00:00.000Z");

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60_000);
}

function obs(waitMinutes: number, ageMinutes: number, trust?: number): Observation {
  return { waitMinutes, at: minutesAgo(ageMinutes), trust };
}

describe("decayWeight", () => {
  it("halves at exactly one half-life", () => {
    expect(decayWeight(0)).toBe(1);
    expect(decayWeight(HALF_LIFE_MINUTES)).toBeCloseTo(0.5, 10);
    expect(decayWeight(HALF_LIFE_MINUTES * 2)).toBeCloseTo(0.25, 10);
  });

  it("treats future timestamps as current rather than amplifying them", () => {
    expect(decayWeight(-30)).toBe(1);
  });
});

describe("weightedQuantile", () => {
  it("returns the only value when there is one", () => {
    expect(weightedQuantile([{ value: 12, weight: 1 }], 0.5)).toBe(12);
  });

  it("ignores an extreme value's magnitude, unlike a mean", () => {
    const sorted = [
      { value: 10, weight: 1 },
      { value: 12, weight: 1 },
      { value: 14, weight: 1 },
      { value: 150, weight: 1 },
    ];
    // The mean here is 46.5. The median stays with the cluster.
    expect(weightedQuantile(sorted, 0.5)).toBeLessThan(20);
  });

  it("follows the weight, not the count", () => {
    const sorted = [
      { value: 5, weight: 0.01 },
      { value: 40, weight: 10 },
    ];
    expect(weightedQuantile(sorted, 0.5)).toBeGreaterThan(30);
  });
});

describe("estimateWait", () => {
  it("is deterministic — the same inputs always produce the same number", () => {
    const observations = [obs(20, 5), obs(25, 10), obs(22, 15)];
    const first = estimateWait(observations, 15, NOW);
    const second = estimateWait(observations, 15, NOW);
    expect(first).toEqual(second);
  });

  it("falls back to the baseline when nobody has reported", () => {
    const estimate = estimateWait([], 18, NOW);
    expect(estimate.dataSource).toBe("estimated");
    expect(estimate.waitMinutes).toBe(18);
    expect(estimate.sampleCount).toBe(0);
    expect(estimate.confidence).toBe("low");
    // A modelled number must never be presented as a measurement.
    expect(estimate.newestObservationAt).toBeNull();
  });

  it("uses community data alone once there is enough of it", () => {
    const estimate = estimateWait(
      [obs(30, 2), obs(32, 4), obs(31, 6), obs(29, 8)],
      10,
      NOW,
    );
    expect(estimate.dataSource).toBe("community");
    // The baseline of 10 must not drag the answer down.
    expect(estimate.waitMinutes).toBeGreaterThanOrEqual(29);
    expect(estimate.waitMinutes).toBeLessThanOrEqual(32);
  });

  it("blends toward the baseline when there is only a single voice", () => {
    const estimate = estimateWait([obs(60, 5)], 10, NOW);
    expect(estimate.dataSource).toBe("blended");
    // Pulled well below the lone report, but above the baseline.
    expect(estimate.waitMinutes).toBeGreaterThan(10);
    expect(estimate.waitMinutes).toBeLessThan(60);
  });

  it("is not moved far by one implausible entry among several", () => {
    const withOutlier = estimateWait(
      [obs(20, 2), obs(22, 4), obs(21, 6), obs(150, 3)],
      20,
      NOW,
    );
    expect(withOutlier.waitMinutes).toBeLessThan(35);
  });

  it("weights a fresh report far above a stale one", () => {
    // Same two values, opposite ages.
    const freshIsLow = estimateWait([obs(10, 2), obs(50, 120)], 20, NOW);
    const freshIsHigh = estimateWait([obs(50, 2), obs(10, 120)], 20, NOW);
    expect(freshIsLow.waitMinutes).toBeLessThan(freshIsHigh.waitMinutes);
  });

  it("does not treat six-hour-old reports as a current condition", () => {
    const estimate = estimateWait([obs(45, 350), obs(47, 340)], 12, NOW);
    // Decayed almost to nothing, so the baseline should dominate.
    expect(estimate.waitMinutes).toBeLessThan(20);
    expect(estimate.dataSource).not.toBe("community");
  });

  it("reports high confidence only when reports are many, fresh and agreeing", () => {
    const confident = estimateWait(
      [obs(20, 1), obs(21, 3), obs(19, 5), obs(20, 7)],
      20,
      NOW,
    );
    expect(confident.confidence).toBe("high");
  });

  it("drops confidence when reports disagree with each other", () => {
    const scattered = estimateWait(
      [obs(5, 1), obs(45, 3), obs(10, 5), obs(50, 7)],
      20,
      NOW,
    );
    expect(scattered.confidence).not.toBe("high");
  });

  it("drops confidence when the freshest report is old", () => {
    const stale = estimateWait(
      [obs(20, 45), obs(21, 50), obs(19, 55), obs(20, 60)],
      20,
      NOW,
    );
    expect(stale.confidence).not.toBe("high");
  });

  it("always returns a usable range around the headline", () => {
    const estimate = estimateWait([obs(20, 2), obs(20, 4), obs(20, 6)], 20, NOW);
    expect(estimate.low).toBeLessThanOrEqual(estimate.waitMinutes);
    expect(estimate.high).toBeGreaterThanOrEqual(estimate.waitMinutes);
    // Identical reports must not imply zero uncertainty.
    expect(estimate.high).toBeGreaterThan(estimate.low);
  });

  it("never returns a negative wait", () => {
    const estimate = estimateWait([obs(0, 1), obs(0, 2), obs(0, 3)], 1, NOW);
    expect(estimate.waitMinutes).toBeGreaterThanOrEqual(0);
    expect(estimate.low).toBeGreaterThanOrEqual(0);
  });

  it("respects a lower trust factor on confirmations", () => {
    const typed = estimateWait([obs(40, 5), obs(10, 5)], 10, NOW);
    const confirmationIsWeaker = estimateWait([obs(40, 5, 0.1), obs(10, 5)], 10, NOW);
    expect(confirmationIsWeaker.waitMinutes).toBeLessThan(typed.waitMinutes);
  });

  it("reports newestObservationAt in ISO-8601 UTC", () => {
    const estimate = estimateWait([obs(20, 5), obs(22, 30)], 20, NOW);
    expect(estimate.newestObservationAt).toBe(minutesAgo(5).toISOString());
    expect(estimate.newestObservationAt).toMatch(/Z$/);
  });

  it("handles a missing baseline without inventing a number", () => {
    const estimate = estimateWait([], null, NOW);
    expect(estimate.dataSource).toBe("estimated");
    expect(estimate.sampleCount).toBe(0);
  });
});

describe("isPlausible", () => {
  it("accepts ordinary waits", () => {
    expect(isPlausible(25, 15)).toBe(true);
    expect(isPlausible(0, 15)).toBe(true);
  });

  it("accepts a genuinely bad day at a quiet airport", () => {
    // Five times a 6-minute baseline is 30, but the floor keeps 45 valid.
    expect(isPlausible(44, 6)).toBe(true);
  });

  it("rejects a value far outside anything the airport sees", () => {
    expect(isPlausible(150, 8)).toBe(false);
  });

  it("rejects nonsense", () => {
    expect(isPlausible(-5, 15)).toBe(false);
    expect(isPlausible(Number.NaN, 15)).toBe(false);
  });

  it("accepts anything valid when there is no baseline to compare against", () => {
    expect(isPlausible(120, null)).toBe(true);
  });
});
