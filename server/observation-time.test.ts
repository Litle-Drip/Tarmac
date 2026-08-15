import { describe, it, expect } from "vitest";
import { estimateWait, decayWeight, type Observation } from "./wait-model.js";

/**
 * Reports are filed after the fact.
 *
 * Somebody who waited 30 minutes types it in at the gate, not in the queue, so
 * stamping the report "now" claims the conditions it describes are current
 * when they are half an hour old. That error always points the same way, so it
 * cannot average out — it makes every airport look fresher and more certain
 * than it is.
 *
 * These tests pin down that backdating a report actually changes the answer,
 * which is the only reason to ask travellers for it.
 */

const NOW = new Date("2026-08-15T17:00:00.000Z");

function at(minutesAgo: number, waitMinutes: number): Observation {
  return { waitMinutes, at: new Date(NOW.getTime() - minutesAgo * 60_000) };
}

describe("observation time versus submission time", () => {
  it("weights a backdated report less than one just observed", () => {
    // Same report, same submission moment, different observation times.
    const justNow = decayWeight(0);
    const halfHourAgo = decayWeight(30);
    expect(halfHourAgo).toBeCloseTo(justNow * 0.5, 10);
  });

  it("pulls the headline toward the baseline when reports are backdated", () => {
    const baseline = 12;

    const asIfCurrent = estimateWait(
      [at(0, 40), at(1, 42), at(2, 38)],
      baseline,
      NOW,
    );
    const backdated = estimateWait(
      [at(30, 40), at(31, 42), at(32, 38)],
      baseline,
      NOW,
    );

    // Both describe a 40-minute line, but the older observations carry less
    // weight, so the second leans further on the baseline.
    expect(backdated.waitMinutes).toBeLessThan(asIfCurrent.waitMinutes);
  });

  it("stops a backdated report claiming high confidence", () => {
    const fresh = estimateWait(
      [at(1, 20), at(2, 21), at(3, 19), at(4, 20)],
      20,
      NOW,
    );
    const backdated = estimateWait(
      [at(31, 20), at(32, 21), at(33, 19), at(34, 20)],
      20,
      NOW,
    );

    expect(fresh.confidence).toBe("high");
    // Freshest observation is over 20 minutes old, so it cannot be "high".
    expect(backdated.confidence).not.toBe("high");
  });

  it("reports the observation time, not the submission time, as newest", () => {
    const estimate = estimateWait([at(45, 25), at(50, 27)], 20, NOW);
    expect(estimate.newestObservationAt).toBe(
      new Date(NOW.getTime() - 45 * 60_000).toISOString(),
    );
  });

  it("ignores reports backdated to the very edge of what we accept", () => {
    // Three hours is the furthest a traveller may backdate. By then decay has
    // taken the weight below the floor, so the answer is the baseline and we
    // say so — rather than showing a stale number dressed up as a measurement.
    const estimate = estimateWait([at(180, 60), at(179, 58)], 15, NOW);
    expect(estimate.dataSource).toBe("estimated");
    expect(estimate.sampleCount).toBe(0);
    expect(estimate.waitMinutes).toBe(15);
  });

  /**
   * The model is deliberately slow to be talked round by one voice.
   *
   * A weighted median is what stops a single mistaken or malicious entry
   * moving the number, and that same property means one dissenting report
   * doesn't overturn three agreeing ones — even when it's the freshest. The
   * escape valve is a second voice, or a thumbs-down on the reports that have
   * gone stale, both of which move it decisively.
   */
  describe("resistance to a single voice", () => {
    const stale = [at(35, 45), at(40, 47), at(45, 44)];

    it("barely moves on one fresh dissenting report", () => {
      const agreeing = estimateWait([at(10, 45), ...stale], 15, NOW);
      const dissenting = estimateWait([at(10, 8), ...stale], 15, NOW);

      expect(dissenting.waitMinutes).toBeLessThan(agreeing.waitMinutes);
      // ...but only just. One voice is not enough to overturn three.
      expect(agreeing.waitMinutes - dissenting.waitMinutes).toBeLessThan(5);
    });

    it("moves decisively once a second person agrees", () => {
      const twoFresh = estimateWait([at(5, 8), at(10, 9), ...stale], 15, NOW);
      expect(twoFresh.waitMinutes).toBeLessThan(25);
    });

    it("moves when the stale reports are thumbed down", () => {
      // A disagreement halves what the report it landed on counts for, which
      // is how somebody standing there now corrects a number that has aged
      // badly without waiting for a second reporter.
      const doubted = stale.map((observation) => ({ ...observation, trust: 0.25 }));
      const corrected = estimateWait([at(10, 8), ...doubted], 15, NOW);

      expect(corrected.waitMinutes).toBeLessThan(25);
    });
  });
});
