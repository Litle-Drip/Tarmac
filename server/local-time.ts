/**
 * Resolving an instant into an airport's *local* wall clock.
 *
 * Wait times are driven by the local hour more than by anything else, and the
 * server has no meaningful timezone of its own (it is UTC on Vercel). Reading
 * `new Date().getHours()` and applying it to every airport shifts the morning
 * rush by four hours at JFK and ten at HNL.
 */

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    // An unknown zone must not take down the request. Fall back to UTC and
    // make the misconfiguration visible in the logs.
    console.warn(`Unknown timezone "${timeZone}", falling back to UTC`);
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timeZone, formatter);
    return formatter;
  }

  formatterCache.set(timeZone, formatter);
  return formatter;
}

export type LocalClock = {
  /** 0–23 in the airport's local time. */
  hour: number;
  /** 0–59. */
  minute: number;
  /** 0 = Sunday, matching JS getDay(). */
  dayOfWeek: number;
};

export function localClock(instant: Date, timeZone: string): LocalClock {
  const parts = formatterFor(timeZone).formatToParts(instant);

  let hour = 0;
  let minute = 0;
  let dayOfWeek = 0;

  for (const part of parts) {
    if (part.type === "hour") hour = Number(part.value) % 24;
    else if (part.type === "minute") minute = Number(part.value);
    else if (part.type === "weekday") dayOfWeek = WEEKDAY_INDEX[part.value] ?? 0;
  }

  return { hour, minute, dayOfWeek };
}

/** The local clock `minutesAhead` from now — used by the departure planner. */
export function localClockAt(
  instant: Date,
  timeZone: string,
  minutesAhead: number,
): LocalClock {
  return localClock(new Date(instant.getTime() + minutesAhead * 60_000), timeZone);
}
