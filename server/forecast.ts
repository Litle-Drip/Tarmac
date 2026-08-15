import type { Confidence, WaitEstimate } from "../shared/schema.js";

/**
 * Predicting the wait at a *future* moment, and working backwards from a
 * flight to a leave-by time.
 *
 * The app's whole purpose is "when do I need to leave", and answering that
 * needs the wait at the hour someone will actually arrive — not the wait right
 * now. Somebody checking at 2pm for a 6pm flight is asking about the evening
 * peak, and the current number is close to useless to them.
 *
 * Everything here is pure: same inputs, same answer, explicit `now`.
 */

/** How fast today's deviation from typical fades as we look further ahead. */
const DELTA_HALF_LIFE_MINUTES = 120;

/**
 * Bounds on how far today can deviate from the baseline. A checkpoint running
 * at three times typical is real; projecting that four hours out is not.
 */
const MIN_DELTA = 0.4;
const MAX_DELTA = 2.5;

export type WaitForecast = {
  /** ISO-8601 UTC instant this forecast is for. */
  at: string;
  /** Hour of day at the airport, for labelling. */
  localHour: number;
  waitMinutes: number;
  low: number;
  high: number;
  confidence: Confidence;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * How much worse (or better) than typical this checkpoint is running right now.
 *
 * Returns 1 when we have nothing but the baseline to go on — an estimate
 * divided by itself tells us nothing, and treating it as signal would let the
 * model amplify its own guess.
 */
export function currentDelta(
  currentEstimate: WaitEstimate | null,
  baselineNow: number,
): number {
  if (!currentEstimate) return 1;
  if (currentEstimate.dataSource === "estimated") return 1;
  if (!Number.isFinite(baselineNow) || baselineNow <= 0) return 1;

  return clamp(currentEstimate.waitMinutes / baselineNow, MIN_DELTA, MAX_DELTA);
}

function horizonConfidence(
  horizonMinutes: number,
  currentConfidence: Confidence,
): Confidence {
  const order: Confidence[] = ["low", "medium", "high"];
  const cap: Confidence =
    horizonMinutes <= 45 ? "high" : horizonMinutes <= 180 ? "medium" : "low";

  return order.indexOf(currentConfidence) <= order.indexOf(cap)
    ? currentConfidence
    : cap;
}

/**
 * The predicted wait at `target`.
 *
 * Today's deviation from typical decays toward 1 as the horizon grows: a line
 * running double an hour from now says a lot about the next 30 minutes and
 * very little about tonight.
 */
export function forecastWait(
  baselineAtTarget: number,
  delta: number,
  currentConfidence: Confidence,
  now: Date,
  target: Date,
  localHour: number,
): WaitForecast {
  const horizonMinutes = Math.max(0, (target.getTime() - now.getTime()) / 60_000);
  const decay = Math.pow(0.5, horizonMinutes / DELTA_HALF_LIFE_MINUTES);
  const effectiveDelta = 1 + (delta - 1) * decay;

  const predicted = Math.max(0, baselineAtTarget * effectiveDelta);

  // Uncertainty grows with how far ahead we're looking.
  const horizonHours = horizonMinutes / 60;
  const relativeWidth = Math.min(0.6, 0.2 + horizonHours * 0.08);
  const halfWidth = Math.max(3, predicted * relativeWidth);

  return {
    at: target.toISOString(),
    localHour,
    waitMinutes: Math.round(predicted),
    low: Math.max(0, Math.round(predicted - halfWidth)),
    high: Math.round(predicted + halfWidth),
    confidence: horizonConfidence(horizonMinutes, currentConfidence),
  };
}

/**
 * Minutes before departure that a traveller should be at the gate.
 *
 * Anchored on when boarding starts rather than when the door closes — arriving
 * as the door shuts is not a plan, and telling someone it is would be the
 * fastest way to lose their trust in every other number we show.
 */
export const BOARDING_LEAD_MINUTES = { domestic: 35, international: 50 } as const;

/** Airline bag-drop cutoffs. Missing these means not flying. */
export const BAG_CUTOFF_MINUTES = { domestic: 45, international: 60 } as const;

/** Time at the bag drop counter itself. */
const BAG_DROP_MINUTES = 15;

export type RiskTolerance = "tight" | "comfortable" | "early";

/** Extra padding on top of the forecast's own upper bound. */
export const RISK_BUFFER_MINUTES: Record<RiskTolerance, number> = {
  tight: 0,
  comfortable: 15,
  early: 30,
};

export type PlanStep = {
  label: string;
  minutes: number;
  detail: string;
};

export type DeparturePlan = {
  /** ISO-8601 UTC. */
  departureAt: string;
  arriveAtAirportBy: string;
  /**
   * When the airline stops accepting checked bags, if one is being checked.
   * Shown because it's a hard deadline a traveller should see, even though the
   * recommended arrival is always comfortably before it.
   */
  bagDropClosesAt: string | null;
  /** Total minutes budgeted between arriving and the flight leaving. */
  totalMinutes: number;
  securityForecast: WaitForecast;
  steps: PlanStep[];
  warnings: string[];
};

export type PlanOptions = {
  checkedBag: boolean;
  international: boolean;
  risk: RiskTolerance;
};

export type PlanInputs = {
  departureAt: Date;
  now: Date;
  gateTransitMinutes: number;
  /** Forecast for a given security-entry time. */
  forecastAt: (target: Date) => WaitForecast;
  options: PlanOptions;
};

/**
 * Work backwards from the flight to the moment the traveller should be at the
 * airport.
 *
 * We plan against the *top* of the forecast range rather than its midpoint.
 * Being 10 minutes early costs nothing; being 10 minutes late costs the
 * flight. That asymmetry is the whole reason the model carries a range around.
 */
export function planDeparture(inputs: PlanInputs): DeparturePlan {
  const { departureAt, now, gateTransitMinutes, forecastAt, options } = inputs;
  const kind = options.international ? "international" : "domestic";

  const boarding = BOARDING_LEAD_MINUTES[kind];
  const bagDrop = options.checkedBag ? BAG_DROP_MINUTES : 0;
  const buffer = RISK_BUFFER_MINUTES[options.risk];

  // The security forecast depends on when they reach security, which depends
  // on the forecast. Two passes is enough to settle: the first uses a rough
  // guess, the second uses the answer the first produced.
  let securityEntry = new Date(
    departureAt.getTime() - (boarding + gateTransitMinutes + bagDrop + 30) * 60_000,
  );
  let forecast = forecastAt(securityEntry);

  for (let pass = 0; pass < 2; pass++) {
    const totalAfterSecurity = boarding + gateTransitMinutes;
    const arriveBy = new Date(
      departureAt.getTime() -
        (totalAfterSecurity + forecast.high + bagDrop + buffer) * 60_000,
    );
    securityEntry = new Date(arriveBy.getTime() + bagDrop * 60_000);
    forecast = forecastAt(securityEntry);
  }

  let arriveAtAirportBy = new Date(
    departureAt.getTime() -
      (boarding + gateTransitMinutes + forecast.high + bagDrop + buffer) * 60_000,
  );

  const warnings: string[] = [];

  // A checked bag turns a recommendation into a hard deadline. Boarding lead
  // plus bag-drop time already exceeds every airline cutoff we model, so this
  // should never bind — it is here to keep that an invariant rather than a
  // coincidence, in case those figures are ever tuned down.
  const bagDropClosesAt = options.checkedBag
    ? new Date(departureAt.getTime() - BAG_CUTOFF_MINUTES[kind] * 60_000)
    : null;

  if (bagDropClosesAt && arriveAtAirportBy > bagDropClosesAt) {
    arriveAtAirportBy = bagDropClosesAt;
    warnings.push(
      `Bag drop closes ${BAG_CUTOFF_MINUTES[kind]} minutes before departure, so that deadline applies rather than the security estimate.`,
    );
  }

  if (arriveAtAirportBy.getTime() <= now.getTime()) {
    warnings.push("That's already passed — leave now and expect it to be tight.");
  } else if (arriveAtAirportBy.getTime() - now.getTime() < 30 * 60_000) {
    warnings.push("That's less than half an hour away.");
  }

  if (forecast.confidence === "low") {
    warnings.push(
      "Few recent reports for this line, so this leans on typical waits rather than today's. Add padding if you can.",
    );
  }

  const steps: PlanStep[] = [
    ...(options.checkedBag
      ? [{
          label: "Bag drop",
          minutes: bagDrop,
          detail: "Counter queue and check-in",
        }]
      : []),
    {
      label: "Security",
      minutes: forecast.high,
      detail: `Forecast for the time you'll arrive (likely ${forecast.low}–${forecast.high} min)`,
    },
    {
      label: "Walk to gate",
      minutes: gateTransitMinutes,
      detail: "Concourse walk, trains and trams",
    },
    {
      label: "Boarding",
      minutes: boarding,
      detail: options.international
        ? "International boarding starts earlier"
        : "Be at the gate as boarding starts",
    },
    ...(buffer > 0
      ? [{ label: "Buffer", minutes: buffer, detail: "Your margin for the unexpected" }]
      : []),
  ];

  return {
    departureAt: departureAt.toISOString(),
    arriveAtAirportBy: arriveAtAirportBy.toISOString(),
    bagDropClosesAt: bagDropClosesAt ? bagDropClosesAt.toISOString() : null,
    totalMinutes: Math.round(
      (departureAt.getTime() - arriveAtAirportBy.getTime()) / 60_000,
    ),
    securityForecast: forecast,
    steps,
    warnings,
  };
}
