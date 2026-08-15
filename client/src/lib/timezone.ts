/**
 * Converting between an airport's wall clock and real instants.
 *
 * A departure time is whatever is printed on the boarding pass — 6:30pm at
 * LAX means 6:30pm Pacific, regardless of where the person planning the trip
 * happens to be sitting. Treating a `datetime-local` value as the browser's
 * local time would put a Denver traveller's LAX flight an hour out, and
 * silently — which is exactly the class of bug this app exists to avoid.
 */

function offsetMs(utcMs: number, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(new Date(utcMs))) {
    parts[part.type] = part.value;
  }

  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );

  return asIfUtc - utcMs;
}

/**
 * Interpret `YYYY-MM-DDTHH:mm` as wall-clock time in `timeZone`.
 *
 * Applied twice because the offset itself depends on the instant: a naive
 * single pass lands in the wrong hour on the two days a year the clocks move.
 */
export function zonedWallTimeToInstant(localValue: string, timeZone: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(localValue)) return null;

  const pretendUtc = Date.parse(`${localValue.slice(0, 16)}:00Z`);
  if (Number.isNaN(pretendUtc)) return null;

  let instant = pretendUtc - offsetMs(pretendUtc, timeZone);
  instant = pretendUtc - offsetMs(instant, timeZone);

  return new Date(instant);
}

/** The `datetime-local` value showing this instant on the airport's clock. */
export function instantToZonedWallTime(instant: Date, timeZone: string): string {
  const shifted = new Date(instant.getTime() + offsetMs(instant.getTime(), timeZone));
  return shifted.toISOString().slice(0, 16);
}

/** e.g. "4:42 PM" */
export function formatTimeInZone(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** e.g. "Sat 4:42 PM" — used when the answer lands on another day. */
export function formatDayTimeInZone(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** True when the two instants fall on different days in the airport's zone. */
export function crossesDayBoundary(a: string, b: string, timeZone: string): boolean {
  const day = (iso: string) =>
    new Intl.DateTimeFormat("en-US", { timeZone, dateStyle: "short" }).format(
      new Date(iso),
    );
  return day(a) !== day(b);
}

/** The airport's current UTC offset in hours, for a short label like "PDT". */
export function zoneAbbreviation(timeZone: string, at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "short",
  }).formatToParts(at);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
}

/** Rounds forward to the next 5-minute mark, for a sensible default. */
export function roundUpToFiveMinutes(date: Date): Date {
  const rounded = new Date(date);
  rounded.setSeconds(0, 0);
  rounded.setMinutes(Math.ceil(rounded.getMinutes() / 5) * 5);
  return rounded;
}
