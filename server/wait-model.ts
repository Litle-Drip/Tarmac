import type {
  Confidence,
  WaitDataSource,
  WaitEstimate,
} from "../shared/schema.js";

/**
 * The wait-time model.
 *
 * Everything here is a pure function of its arguments and an explicit `now`.
 * No clock reads, no randomness — the numbers travellers plan around have to
 * be reproducible, and reproducible is also what makes them testable.
 */

/** A report's influence halves every 30 minutes. */
export const HALF_LIFE_MINUTES = 30;

/**
 * Windows we'll consider, narrowest first. We use the tightest window that
 * holds enough signal, so a busy checkpoint answers from the last 90 minutes
 * while a quiet one can still say something useful from the last 6 hours.
 */
export const WINDOWS_MINUTES = [90, 180, 360] as const;

/** Weight at which community data alone carries the headline number. */
export const FULL_CONFIDENCE_WEIGHT = 3;

/** Below this, we blend toward the baseline rather than pretend. */
export const MIN_COMMUNITY_WEIGHT = 0.15;

/** We never quote a range tighter than this. */
const MIN_RANGE_HALF_WIDTH = 3;

export type Observation = {
  waitMinutes: number;
  at: Date;
  /**
   * Relative trust before time decay. A typed report is 1; a one-tap
   * confirmation of somebody else's report is worth a little less, because
   * agreeing is easier than measuring.
   */
  trust?: number;
};

function minutesBetween(later: Date, earlier: Date): number {
  return (later.getTime() - earlier.getTime()) / 60_000;
}

/** Exponential decay by age. Future-dated rows are treated as "now". */
export function decayWeight(ageMinutes: number): number {
  const age = Math.max(0, ageMinutes);
  return Math.pow(0.5, age / HALF_LIFE_MINUTES);
}

type Weighted = { value: number; weight: number };

/**
 * Weighted quantile over pre-sorted pairs.
 *
 * A median rather than a mean is the single most important choice in this
 * file: one mistaken 150-minute entry shifts a three-report mean by 40+
 * minutes, and shifts the median not at all.
 *
 * Each observation is placed at the midpoint of the weight it occupies, and
 * the answer is interpolated between those positions. Interpolating across an
 * observation's weight span instead would drag a heavily-weighted value toward
 * whatever sat next to it — so a single fresh report competing with a nearly
 * decayed one would land between the two rather than on the fresh one.
 */
export function weightedQuantile(sorted: Weighted[], q: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0].value;

  const total = sorted.reduce((sum, item) => sum + item.weight, 0);
  if (total <= 0) return sorted[Math.floor(sorted.length / 2)].value;

  // Position of each observation, as a fraction of total weight.
  const positions: number[] = [];
  let cumulative = 0;
  for (const item of sorted) {
    positions.push((cumulative + item.weight / 2) / total);
    cumulative += item.weight;
  }

  // Outside the outermost midpoints the answer is that end's value.
  if (q <= positions[0]) return sorted[0].value;
  if (q >= positions[positions.length - 1]) return sorted[sorted.length - 1].value;

  for (let i = 1; i < positions.length; i++) {
    if (q > positions[i]) continue;

    const span = positions[i] - positions[i - 1];
    if (span <= 0) return sorted[i].value;

    const within = (q - positions[i - 1]) / span;
    return sorted[i - 1].value + (sorted[i].value - sorted[i - 1].value) * within;
  }

  return sorted[sorted.length - 1].value;
}

function pickWindow(
  observations: Observation[],
  now: Date,
): { kept: Observation[]; windowMinutes: number } {
  for (const windowMinutes of WINDOWS_MINUTES) {
    const kept = observations.filter(
      (o) => minutesBetween(now, o.at) <= windowMinutes,
    );
    // Two independent reports inside the tight window is enough to answer
    // from it; otherwise widen rather than answer from a single voice.
    if (kept.length >= 2) return { kept, windowMinutes };
  }

  const widest = WINDOWS_MINUTES[WINDOWS_MINUTES.length - 1];
  return {
    kept: observations.filter((o) => minutesBetween(now, o.at) <= widest),
    windowMinutes: widest,
  };
}

function gradeConfidence(
  effectiveWeight: number,
  newestAgeMinutes: number,
  spread: number,
  median: number,
): Confidence {
  // Disagreement matters relative to the wait: ±8 minutes on a 10-minute wait
  // is noise we should admit to; on a 60-minute wait it is agreement.
  const relativeSpread = median > 0 ? spread / median : spread > 0 ? 1 : 0;

  if (
    effectiveWeight >= FULL_CONFIDENCE_WEIGHT &&
    newestAgeMinutes <= 20 &&
    relativeSpread <= 0.5
  ) {
    return "high";
  }

  if (effectiveWeight >= 1 && newestAgeMinutes <= 60 && relativeSpread <= 1.1) {
    return "medium";
  }

  return "low";
}

const CONFIDENCE_PADDING: Record<Confidence, number> = {
  high: 1,
  medium: 1.35,
  low: 1.8,
};

/**
 * Combine community observations with the modelled baseline into the one
 * number (and range) the traveller sees.
 *
 * `baselineMinutes` is what we'd expect at this airport, on this line, at this
 * local hour with no reports at all. It anchors the answer when the crowd is
 * quiet and disappears entirely once the crowd is loud.
 */
export function estimateWait(
  observations: Observation[],
  baselineMinutes: number | null,
  now: Date,
): WaitEstimate {
  const baseline =
    baselineMinutes !== null && Number.isFinite(baselineMinutes)
      ? Math.max(0, baselineMinutes)
      : null;

  const { kept } = pickWindow(observations, now);

  const weighted: Weighted[] = kept
    .map((o) => ({
      value: o.waitMinutes,
      weight: decayWeight(minutesBetween(now, o.at)) * (o.trust ?? 1),
    }))
    .filter((w) => w.weight > 0 && Number.isFinite(w.value))
    .sort((a, b) => a.value - b.value);

  const effectiveWeight = weighted.reduce((sum, w) => sum + w.weight, 0);

  if (weighted.length === 0 || effectiveWeight < MIN_COMMUNITY_WEIGHT) {
    return baselineOnly(baseline);
  }

  const median = weightedQuantile(weighted, 0.5);
  const p25 = weightedQuantile(weighted, 0.25);
  const p75 = weightedQuantile(weighted, 0.75);
  const spread = Math.max(0, p75 - p25);

  const newestAgeMinutes = Math.min(
    ...kept.map((o) => Math.max(0, minutesBetween(now, o.at))),
  );

  const confidence = gradeConfidence(
    effectiveWeight,
    newestAgeMinutes,
    spread,
    median,
  );

  // Below full confidence the baseline still has something to say, in
  // proportion to how little the crowd has said.
  const communityShare = Math.min(1, effectiveWeight / FULL_CONFIDENCE_WEIGHT);
  let headline = median;
  let dataSource: WaitDataSource = "community";

  if (baseline !== null && communityShare < 1) {
    headline = median * communityShare + baseline * (1 - communityShare);
    dataSource = "blended";
  }

  const halfWidth = Math.max(
    MIN_RANGE_HALF_WIDTH,
    (spread / 2) * CONFIDENCE_PADDING[confidence],
  );

  const newest = kept.reduce<Date | null>(
    (latest, o) => (latest === null || o.at > latest ? o.at : latest),
    null,
  );

  return {
    waitMinutes: Math.max(0, Math.round(headline)),
    low: Math.max(0, Math.round(headline - halfWidth)),
    high: Math.max(0, Math.round(headline + halfWidth)),
    confidence,
    dataSource,
    sampleCount: kept.length,
    newestObservationAt: newest ? newest.toISOString() : null,
  };
}

function baselineOnly(baseline: number | null): WaitEstimate {
  if (baseline === null) {
    return {
      waitMinutes: 0,
      low: 0,
      high: 0,
      confidence: "low",
      dataSource: "estimated",
      sampleCount: 0,
      newestObservationAt: null,
    };
  }

  // A modelled number is a typical value, not a measurement. The range says so.
  const halfWidth = Math.max(MIN_RANGE_HALF_WIDTH, Math.round(baseline * 0.45));

  return {
    waitMinutes: Math.round(baseline),
    low: Math.max(0, Math.round(baseline - halfWidth)),
    high: Math.round(baseline + halfWidth),
    confidence: "low",
    dataSource: "estimated",
    sampleCount: 0,
    newestObservationAt: null,
  };
}

/**
 * Is this report plausible enough to count?
 *
 * Deliberately wide. The job is to catch a stuck thumb or a script pushing
 * 150s, not to argue with a traveller who genuinely waited an hour. Anything
 * rejected here is retained in the table as `flagged` so it can be reviewed —
 * a filter that silently deletes data is a filter nobody can debug.
 */
export function isPlausible(
  waitMinutes: number,
  baselineMinutes: number | null,
): boolean {
  if (!Number.isFinite(waitMinutes) || waitMinutes < 0) return false;

  // With no baseline to compare against, accept anything in the valid range.
  if (baselineMinutes === null || baselineMinutes <= 0) return true;

  const ceiling = Math.max(45, baselineMinutes * 5);
  return waitMinutes <= ceiling;
}
