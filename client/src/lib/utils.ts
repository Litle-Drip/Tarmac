import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Confidence, LineType, WaitDataSource, WaitEstimate } from "@shared/schema"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getWaitTimeColor(minutes: number | null): string {
  if (minutes === null) return "text-muted-foreground";
  if (minutes <= 10) return "text-emerald-600 dark:text-emerald-400";
  if (minutes <= 20) return "text-amber-600 dark:text-amber-400";
  if (minutes <= 35) return "text-orange-600 dark:text-orange-400";
  return "text-red-600 dark:text-red-400";
}

export function getWaitTimeBg(minutes: number | null): string {
  if (minutes === null) return "bg-muted";
  if (minutes <= 10) return "bg-emerald-100 dark:bg-emerald-900/30";
  if (minutes <= 20) return "bg-amber-100 dark:bg-amber-900/30";
  if (minutes <= 35) return "bg-orange-100 dark:bg-orange-900/30";
  return "bg-red-100 dark:bg-red-900/30";
}

export function getWaitTimeLabel(minutes: number | null): string {
  if (minutes === null) return "No data";
  if (minutes <= 10) return "Short";
  if (minutes <= 20) return "Moderate";
  if (minutes <= 35) return "Long";
  return "Very Long";
}

export function getWaitTimeDot(minutes: number | null): string {
  if (minutes === null) return "bg-muted-foreground";
  if (minutes <= 10) return "bg-emerald-500";
  if (minutes <= 20) return "bg-amber-500";
  if (minutes <= 35) return "bg-orange-500";
  return "bg-red-500";
}

export function getWaitTimeHex(minutes: number | null): string {
  if (minutes === null) return "#9ca3af";
  if (minutes <= 10) return "#22c55e";
  if (minutes <= 20) return "#f59e0b";
  if (minutes <= 35) return "#f97316";
  return "#ef4444";
}

/**
 * Every timestamp from the API is ISO-8601 with an explicit UTC offset, so the
 * browser resolves it to the reader's own clock. Small negative ages are clock
 * skew between the two machines, not the future.
 */
export function timeAgo(isoString: string | null): string {
  if (!isoString) return "No reports";

  const then = new Date(isoString).getTime();
  if (Number.isNaN(then)) return "Unknown";

  const diffMinutes = Math.floor((Date.now() - then) / 60000);

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return "--";
  return `${Math.round(minutes)} min`;
}

/**
 * The range we'd actually stand behind. Collapses to a single number when the
 * bounds round to the same value — "20–20 min" reads as a bug.
 */
export function formatRange(estimate: Pick<WaitEstimate, "low" | "high">): string {
  if (estimate.low >= estimate.high) return `${estimate.high} min`;
  return `${estimate.low}–${estimate.high} min`;
}

export type FreshnessLevel = "fresh" | "recent" | "aging" | "stale" | "none";

export function getFreshnessInfo(isoString: string | null): {
  label: string;
  color: string;
  dotColor: string;
  level: FreshnessLevel;
} {
  if (!isoString) {
    return {
      label: "No reports",
      color: "text-muted-foreground",
      dotColor: "bg-muted-foreground/40",
      level: "none",
    };
  }

  const then = new Date(isoString).getTime();
  if (Number.isNaN(then)) {
    return {
      label: "Unknown",
      color: "text-muted-foreground",
      dotColor: "bg-muted-foreground/40",
      level: "none",
    };
  }

  const diffMinutes = Math.floor((Date.now() - then) / 60000);
  const label = timeAgo(isoString);

  if (diffMinutes < 30) {
    return { label, color: "text-emerald-600 dark:text-emerald-400", dotColor: "bg-emerald-500", level: "fresh" };
  }
  if (diffMinutes < 120) {
    return { label, color: "text-emerald-600/80 dark:text-emerald-400/80", dotColor: "bg-emerald-400", level: "recent" };
  }
  if (diffMinutes < 360) {
    return { label, color: "text-amber-600 dark:text-amber-400", dotColor: "bg-amber-500", level: "aging" };
  }
  return { label, color: "text-muted-foreground", dotColor: "bg-muted-foreground/50", level: "stale" };
}

export function getDataSourceLabel(source: WaitDataSource): string {
  switch (source) {
    case "community": return "Traveler reports";
    case "blended": return "Reports + estimate";
    case "estimated": return "Estimated";
  }
}

/**
 * What the badge actually means, in the reader's terms. Shown as a tooltip and
 * as help text — "Blended" told nobody anything.
 */
export function getDataSourceExplanation(source: WaitDataSource, sampleCount: number): string {
  switch (source) {
    case "community":
      return `Based on ${sampleCount} recent traveler ${sampleCount === 1 ? "report" : "reports"}.`;
    case "blended":
      return `Based on ${sampleCount} recent traveler ${sampleCount === 1 ? "report" : "reports"}, adjusted toward the typical wait for this time of day.`;
    case "estimated":
      return "No recent reports. This is the typical wait for this airport at this time of day — not a measurement.";
  }
}

export function getDataSourceStyle(source: WaitDataSource): string {
  switch (source) {
    case "community": return "text-emerald-600 dark:text-emerald-400";
    case "blended": return "text-primary";
    case "estimated": return "text-muted-foreground";
  }
}

export function getConfidenceLabel(confidence: Confidence): string {
  switch (confidence) {
    case "high": return "High confidence";
    case "medium": return "Fair confidence";
    case "low": return "Low confidence";
  }
}

export function getConfidenceStyle(confidence: Confidence): string {
  switch (confidence) {
    case "high": return "text-emerald-600 dark:text-emerald-400";
    case "medium": return "text-amber-600 dark:text-amber-400";
    case "low": return "text-muted-foreground";
  }
}

export const LINE_TYPE_LABELS: Record<LineType, string> = {
  standard: "Standard",
  tsa_precheck: "TSA PreCheck",
  clear: "CLEAR",
};

export const LINE_TYPE_SHORT_LABELS: Record<LineType, string> = {
  standard: "Standard",
  tsa_precheck: "PreCheck",
  clear: "CLEAR",
};

export const LINE_TYPE_DESCRIPTIONS: Record<LineType, string> = {
  standard: "Regular screening",
  tsa_precheck: "Expedited screening",
  clear: "Identity verification",
};
