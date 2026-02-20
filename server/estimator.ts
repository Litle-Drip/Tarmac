import type { Airport } from "@shared/schema";

const BUSY_AIRPORTS = new Set([
  "ATL", "LAX", "ORD", "DFW", "DEN", "JFK", "SFO", "SEA", "LAS", "MCO",
  "EWR", "MIA", "PHX", "IAH", "BOS", "MSP", "FLL", "DTW", "PHL", "LGA",
]);

const MEDIUM_AIRPORTS = new Set([
  "CLT", "BWI", "SLC", "SAN", "DCA", "IAD", "TPA", "PDX", "HNL", "STL",
]);

function getAirportTier(code: string): "busy" | "medium" | "small" {
  if (BUSY_AIRPORTS.has(code)) return "busy";
  if (MEDIUM_AIRPORTS.has(code)) return "medium";
  return "small";
}

const BASE_WAIT: Record<string, number> = {
  busy: 18,
  medium: 12,
  small: 7,
};

function getTimeOfDayMultiplier(hour: number): number {
  if (hour >= 4 && hour < 6) return 0.6;
  if (hour >= 6 && hour < 9) return 1.4;
  if (hour >= 9 && hour < 11) return 1.1;
  if (hour >= 11 && hour < 14) return 0.85;
  if (hour >= 14 && hour < 17) return 1.15;
  if (hour >= 17 && hour < 20) return 1.3;
  if (hour >= 20 && hour < 23) return 0.7;
  return 0.5;
}

function getDayOfWeekMultiplier(day: number): number {
  switch (day) {
    case 0: return 1.25;
    case 1: return 1.15;
    case 2: return 0.9;
    case 3: return 0.9;
    case 4: return 1.0;
    case 5: return 1.3;
    case 6: return 0.85;
    default: return 1.0;
  }
}

function addJitter(value: number, range: number): number {
  return value + (Math.random() - 0.5) * range;
}

export function estimateWaitTime(airport: Airport): number {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  const tier = getAirportTier(airport.code);

  const base = BASE_WAIT[tier];
  const timeMultiplier = getTimeOfDayMultiplier(hour);
  const dayMultiplier = getDayOfWeekMultiplier(day);

  let estimate = base * timeMultiplier * dayMultiplier;
  estimate = addJitter(estimate, 4);
  return Math.max(2, Math.round(estimate));
}
