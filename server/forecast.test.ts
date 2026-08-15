import { describe, it, expect } from "vitest";
import {
  forecastWait,
  currentDelta,
  planDeparture,
  BOARDING_LEAD_MINUTES,
  BAG_CUTOFF_MINUTES,
  RISK_BUFFER_MINUTES,
  type WaitForecast,
} from "./forecast.js";
import type { WaitEstimate } from "../shared/schema.js";

const NOW = new Date("2026-08-15T17:00:00.000Z");

function inMinutes(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * 60_000);
}

function estimate(partial: Partial<WaitEstimate>): WaitEstimate {
  return {
    waitMinutes: 20,
    low: 15,
    high: 25,
    confidence: "high",
    dataSource: "community",
    sampleCount: 5,
    newestObservationAt: NOW.toISOString(),
    ...partial,
  };
}

describe("currentDelta", () => {
  it("measures how far today is running from typical", () => {
    expect(currentDelta(estimate({ waitMinutes: 30 }), 15)).toBeCloseTo(2, 5);
    expect(currentDelta(estimate({ waitMinutes: 10 }), 20)).toBeCloseTo(0.5, 5);
  });

  it("is neutral when there is nothing but the baseline to go on", () => {
    // Dividing an estimate by the baseline it came from tells us nothing, and
    // treating it as signal would let the model amplify its own guess.
    expect(currentDelta(estimate({ dataSource: "estimated" }), 20)).toBe(1);
    expect(currentDelta(null, 20)).toBe(1);
  });

  it("is neutral rather than infinite when the baseline is zero", () => {
    expect(currentDelta(estimate({ waitMinutes: 30 }), 0)).toBe(1);
  });

  it("clamps extremes so one bad hour cannot dominate a forecast", () => {
    expect(currentDelta(estimate({ waitMinutes: 300 }), 5)).toBeLessThanOrEqual(2.5);
    expect(currentDelta(estimate({ waitMinutes: 0 }), 40)).toBeGreaterThanOrEqual(0.4);
  });
});

describe("forecastWait", () => {
  it("applies today's deviation in full at the current moment", () => {
    const f = forecastWait(20, 2, "high", NOW, NOW, 13);
    expect(f.waitMinutes).toBe(40);
  });

  it("decays that deviation toward typical as the horizon grows", () => {
    const soon = forecastWait(20, 2, "high", NOW, inMinutes(30), 13);
    const later = forecastWait(20, 2, "high", NOW, inMinutes(240), 13);
    const veryLate = forecastWait(20, 2, "high", NOW, inMinutes(720), 13);

    expect(soon.waitMinutes).toBeGreaterThan(later.waitMinutes);
    expect(later.waitMinutes).toBeGreaterThan(veryLate.waitMinutes);
    // Twelve hours out we should be back at the baseline.
    expect(veryLate.waitMinutes).toBeCloseTo(20, 0);
  });

  it("follows the baseline curve, so a peak hour forecasts higher", () => {
    const midday = forecastWait(12, 1, "high", NOW, inMinutes(120), 12);
    const peak = forecastWait(31, 1, "high", NOW, inMinutes(120), 18);
    expect(peak.waitMinutes).toBeGreaterThan(midday.waitMinutes);
  });

  it("widens the range the further ahead it looks", () => {
    const soon = forecastWait(20, 1, "high", NOW, inMinutes(15), 13);
    const later = forecastWait(20, 1, "high", NOW, inMinutes(480), 13);
    expect(later.high - later.low).toBeGreaterThan(soon.high - soon.low);
  });

  it("caps confidence by horizon, never above what we have now", () => {
    expect(forecastWait(20, 1, "high", NOW, inMinutes(20), 13).confidence).toBe("high");
    expect(forecastWait(20, 1, "high", NOW, inMinutes(120), 13).confidence).toBe("medium");
    expect(forecastWait(20, 1, "high", NOW, inMinutes(400), 13).confidence).toBe("low");
    // A poor current picture cannot become a confident forecast.
    expect(forecastWait(20, 1, "low", NOW, inMinutes(10), 13).confidence).toBe("low");
  });

  it("never predicts a negative wait", () => {
    const f = forecastWait(0, 0.4, "low", NOW, inMinutes(60), 3);
    expect(f.waitMinutes).toBeGreaterThanOrEqual(0);
    expect(f.low).toBeGreaterThanOrEqual(0);
  });

  it("emits ISO-8601 UTC instants", () => {
    expect(forecastWait(20, 1, "high", NOW, inMinutes(60), 14).at).toBe(
      inMinutes(60).toISOString(),
    );
  });
});

describe("planDeparture", () => {
  const flatForecast = (minutes: number) => (target: Date): WaitForecast => ({
    at: target.toISOString(),
    localHour: 13,
    waitMinutes: minutes,
    low: Math.max(0, minutes - 5),
    high: minutes + 5,
    confidence: "high",
  });

  it("works backwards from the flight through every step", () => {
    const departure = inMinutes(300);
    const plan = planDeparture({
      departureAt: departure,
      now: NOW,
      gateTransitMinutes: 15,
      forecastAt: flatForecast(20),
      options: { checkedBag: false, international: false, risk: "comfortable" },
    });

    // security high (25) + gate transit (15) + boarding (35) + buffer (15)
    const expected = 25 + 15 + BOARDING_LEAD_MINUTES.domestic + RISK_BUFFER_MINUTES.comfortable;
    expect(plan.totalMinutes).toBe(expected);
    expect(new Date(plan.arriveAtAirportBy).getTime()).toBe(
      departure.getTime() - expected * 60_000,
    );
  });

  it("plans against the top of the range, not the midpoint", () => {
    // Ten minutes early costs nothing; ten minutes late costs the flight.
    const plan = planDeparture({
      departureAt: inMinutes(300),
      now: NOW,
      gateTransitMinutes: 10,
      forecastAt: flatForecast(20),
      options: { checkedBag: false, international: false, risk: "tight" },
    });
    const security = plan.steps.find((s) => s.label === "Security");
    expect(security?.minutes).toBe(25);
  });

  it("gives a later leave-by time at an airport with a long walk to the gate", () => {
    const base = {
      departureAt: inMinutes(300),
      now: NOW,
      forecastAt: flatForecast(20),
      options: { checkedBag: false, international: false, risk: "comfortable" as const },
    };
    const compact = planDeparture({ ...base, gateTransitMinutes: 10 });
    const sprawling = planDeparture({ ...base, gateTransitMinutes: 20 });

    expect(sprawling.totalMinutes - compact.totalMinutes).toBe(10);
  });

  it("adds bag drop and reports it as its own step", () => {
    const withBag = planDeparture({
      departureAt: inMinutes(300),
      now: NOW,
      gateTransitMinutes: 15,
      forecastAt: flatForecast(20),
      options: { checkedBag: true, international: false, risk: "comfortable" },
    });
    expect(withBag.steps.some((s) => s.label === "Bag drop")).toBe(true);
  });

  it("surfaces the bag cutoff as a deadline the traveller can see", () => {
    const departure = inMinutes(300);
    const plan = planDeparture({
      departureAt: departure,
      now: NOW,
      gateTransitMinutes: 15,
      forecastAt: flatForecast(20),
      options: { checkedBag: true, international: false, risk: "comfortable" },
    });

    expect(plan.bagDropClosesAt).toBe(
      new Date(departure.getTime() - BAG_CUTOFF_MINUTES.domestic * 60_000).toISOString(),
    );
  });

  it("has no bag deadline when nothing is being checked", () => {
    const plan = planDeparture({
      departureAt: inMinutes(300),
      now: NOW,
      gateTransitMinutes: 15,
      forecastAt: flatForecast(20),
      options: { checkedBag: false, international: false, risk: "comfortable" },
    });
    expect(plan.bagDropClosesAt).toBeNull();
  });

  it("always gets a bag-checking traveller there before the cutoff", () => {
    // An invariant, not a coincidence: boarding lead plus bag-drop time
    // already exceeds every cutoff we model. If those figures are ever tuned
    // down, this is what catches it.
    for (const international of [false, true]) {
      for (const risk of ["tight", "comfortable", "early"] as const) {
        for (const wait of [0, 20, 60]) {
          const departure = inMinutes(400);
          const plan = planDeparture({
            departureAt: departure,
            now: NOW,
            gateTransitMinutes: 5,
            forecastAt: flatForecast(wait),
            options: { checkedBag: true, international, risk },
          });

          expect(new Date(plan.arriveAtAirportBy).getTime()).toBeLessThanOrEqual(
            new Date(plan.bagDropClosesAt!).getTime(),
          );
        }
      }
    }
  });

  it("allows more time for an international departure", () => {
    const base = {
      departureAt: inMinutes(400),
      now: NOW,
      gateTransitMinutes: 15,
      forecastAt: flatForecast(20),
    };
    const domestic = planDeparture({
      ...base,
      options: { checkedBag: false, international: false, risk: "comfortable" },
    });
    const international = planDeparture({
      ...base,
      options: { checkedBag: false, international: true, risk: "comfortable" },
    });

    expect(international.totalMinutes).toBeGreaterThan(domestic.totalMinutes);
  });

  it("scales the buffer with the traveller's risk tolerance", () => {
    const base = {
      departureAt: inMinutes(300),
      now: NOW,
      gateTransitMinutes: 15,
      forecastAt: flatForecast(20),
    };
    const tight = planDeparture({
      ...base,
      options: { checkedBag: false, international: false, risk: "tight" },
    });
    const early = planDeparture({
      ...base,
      options: { checkedBag: false, international: false, risk: "early" },
    });

    expect(early.totalMinutes - tight.totalMinutes).toBe(
      RISK_BUFFER_MINUTES.early - RISK_BUFFER_MINUTES.tight,
    );
    expect(tight.steps.some((s) => s.label === "Buffer")).toBe(false);
  });

  it("warns rather than silently returning a time in the past", () => {
    const plan = planDeparture({
      departureAt: inMinutes(30),
      now: NOW,
      gateTransitMinutes: 15,
      forecastAt: flatForecast(30),
      options: { checkedBag: false, international: false, risk: "comfortable" },
    });

    expect(new Date(plan.arriveAtAirportBy).getTime()).toBeLessThan(NOW.getTime());
    expect(plan.warnings.some((w) => w.includes("already passed"))).toBe(true);
  });

  it("says so when the forecast is weak, instead of quietly guessing", () => {
    const plan = planDeparture({
      departureAt: inMinutes(600),
      now: NOW,
      gateTransitMinutes: 15,
      forecastAt: (target) => ({
        at: target.toISOString(),
        localHour: 20,
        waitMinutes: 15,
        low: 8,
        high: 25,
        confidence: "low",
      }),
      options: { checkedBag: false, international: false, risk: "comfortable" },
    });

    expect(plan.warnings.some((w) => w.includes("Few recent reports"))).toBe(true);
  });

  it("forecasts for the arrival time, not for now", () => {
    // The whole point: a 2pm check for a 6pm flight must be told about the
    // evening peak, not the midday lull.
    const probed: Date[] = [];
    planDeparture({
      departureAt: inMinutes(240),
      now: NOW,
      gateTransitMinutes: 15,
      forecastAt: (target) => {
        probed.push(target);
        return flatForecast(20)(target);
      },
      options: { checkedBag: false, international: false, risk: "comfortable" },
    });

    const final = probed[probed.length - 1];
    expect(final.getTime()).toBeGreaterThan(NOW.getTime() + 60 * 60_000);
  });

  it("settles on a consistent answer when the forecast varies with time", () => {
    // A forecast that grows the later you arrive must not oscillate.
    const rising = (target: Date): WaitForecast => {
      const minutesOut = (target.getTime() - NOW.getTime()) / 60_000;
      const wait = Math.round(10 + minutesOut / 20);
      return {
        at: target.toISOString(),
        localHour: 13,
        waitMinutes: wait,
        low: wait - 3,
        high: wait + 3,
        confidence: "medium",
      };
    };

    const plan = planDeparture({
      departureAt: inMinutes(360),
      now: NOW,
      gateTransitMinutes: 15,
      forecastAt: rising,
      options: { checkedBag: false, international: false, risk: "comfortable" },
    });

    // The reported security step must match the forecast actually used.
    const security = plan.steps.find((s) => s.label === "Security");
    expect(security?.minutes).toBe(plan.securityForecast.high);
    expect(plan.totalMinutes).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    const inputs = {
      departureAt: inMinutes(300),
      now: NOW,
      gateTransitMinutes: 15,
      forecastAt: flatForecast(20),
      options: { checkedBag: true, international: false, risk: "comfortable" as const },
    };
    expect(planDeparture(inputs)).toEqual(planDeparture(inputs));
  });
});
