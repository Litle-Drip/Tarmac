import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

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

export function timeAgo(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

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

export function getFreshnessInfo(dateString: string | null): { label: string; color: string; dotColor: string; level: "fresh" | "recent" | "aging" | "stale" | "none" } {
  if (!dateString) return { label: "No reports", color: "text-muted-foreground", dotColor: "bg-muted-foreground/40", level: "none" };
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 30) return { label: timeAgo(dateString), color: "text-emerald-600 dark:text-emerald-400", dotColor: "bg-emerald-500", level: "fresh" };
  if (diffMinutes < 120) return { label: timeAgo(dateString), color: "text-emerald-600/80 dark:text-emerald-400/80", dotColor: "bg-emerald-400", level: "recent" };
  if (diffMinutes < 360) return { label: timeAgo(dateString), color: "text-amber-600 dark:text-amber-400", dotColor: "bg-amber-500", level: "aging" };
  return { label: timeAgo(dateString), color: "text-muted-foreground", dotColor: "bg-muted-foreground/50", level: "stale" };
}

export function getDataSourceLabel(source: "community" | "estimated" | "blended"): string {
  switch (source) {
    case "community": return "Community";
    case "estimated": return "Estimated";
    case "blended": return "Blended";
  }
}

export function getDataSourceStyle(source: "community" | "estimated" | "blended"): string {
  switch (source) {
    case "community": return "text-emerald-600 dark:text-emerald-400";
    case "estimated": return "text-muted-foreground";
    case "blended": return "text-primary";
  }
}
