import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Plane, Luggage, Globe, AlertTriangle, Home, Clock, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  RISK_TOLERANCES,
  type AirportWithStats,
  type DeparturePlan,
  type LineType,
  type RiskTolerance,
} from "@shared/schema";
import { getWaitTimeColor, getConfidenceLabel, getConfidenceStyle } from "@/lib/utils";
import {
  zonedWallTimeToInstant,
  instantToZonedWallTime,
  formatTimeInZone,
  formatDayTimeInZone,
  crossesDayBoundary,
  zoneAbbreviation,
  roundUpToFiveMinutes,
} from "@/lib/timezone";

const RISK_LABELS: Record<RiskTolerance, { label: string; detail: string }> = {
  tight: { label: "Cutting it fine", detail: "No spare margin" },
  comfortable: { label: "Comfortable", detail: "15 minutes spare" },
  early: { label: "Very early", detail: "30 minutes spare" },
};

const TRAVEL_TIME_KEY = "tarmac.travel-minutes";

function readStoredTravelMinutes(): string {
  try {
    return localStorage.getItem(TRAVEL_TIME_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * The question the whole app exists to answer.
 *
 * Everything else here tells you what the line is like. This tells you what to
 * do about it — and it forecasts the wait for the hour you'll actually arrive,
 * not the hour you happen to be reading in.
 */
export function DeparturePlanner({
  airport,
  lineType,
}: {
  airport: AirportWithStats;
  lineType: LineType;
}) {
  const zone = airport.timezone;

  // Default to three hours out, on the airport's clock.
  const [departureLocal, setDepartureLocal] = useState(() =>
    instantToZonedWallTime(
      roundUpToFiveMinutes(new Date(Date.now() + 3 * 60 * 60 * 1000)),
      zone,
    ),
  );
  const [checkedBag, setCheckedBag] = useState(false);
  const [international, setInternational] = useState(false);
  const [risk, setRisk] = useState<RiskTolerance>("comfortable");
  const [travelMinutes, setTravelMinutes] = useState(readStoredTravelMinutes);

  useEffect(() => {
    try {
      if (travelMinutes) localStorage.setItem(TRAVEL_TIME_KEY, travelMinutes);
      else localStorage.removeItem(TRAVEL_TIME_KEY);
    } catch {
      // Non-critical.
    }
  }, [travelMinutes]);

  const departureInstant = useMemo(
    () => zonedWallTimeToInstant(departureLocal, zone),
    [departureLocal, zone],
  );

  const { data: plan, isFetching, error } = useQuery<DeparturePlan & { timezone: string }>({
    queryKey: [
      "/api/airports",
      airport.code,
      "plan",
      {
        departureAt: departureInstant?.toISOString() ?? "",
        line: lineType,
        checkedBag: String(checkedBag),
        international: String(international),
        risk,
      },
    ],
    enabled: Boolean(departureInstant),
    refetchInterval: 60_000,
  });

  const leaveHomeBy = useMemo(() => {
    const minutes = Number(travelMinutes);
    if (!plan || !Number.isFinite(minutes) || minutes <= 0) return null;
    return new Date(
      new Date(plan.arriveAtAirportBy).getTime() - minutes * 60_000,
    ).toISOString();
  }, [plan, travelMinutes]);

  const arrivalOnAnotherDay =
    plan && crossesDayBoundary(plan.arriveAtAirportBy, plan.departureAt, zone);

  return (
    <Card className="p-5 sm:p-6 space-y-5" data-testid="card-departure-planner">
      <div className="flex items-center gap-2">
        <Plane className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="text-base font-bold">When should I leave?</h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="departure-time" className="text-sm font-medium">
            Flight departs
          </Label>
          <Input
            id="departure-time"
            type="datetime-local"
            className="h-11"
            value={departureLocal}
            onChange={(e) => setDepartureLocal(e.target.value)}
            data-testid="input-departure-time"
          />
          <p className="text-xs text-muted-foreground">
            Local time at {airport.code}
            {zoneAbbreviation(zone) && ` (${zoneAbbreviation(zone)})`} — as printed
            on your boarding pass.
          </p>
        </div>

        <div className="space-y-3">
          <span className="text-sm font-medium">How much margin?</span>
          <div role="radiogroup" aria-label="Margin" className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-muted">
            {RISK_TOLERANCES.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={risk === option}
                onClick={() => setRisk(option)}
                data-testid={`radio-risk-${option}`}
                className={`rounded-md px-1.5 py-1.5 text-[11px] font-medium leading-tight transition-colors ${
                  risk === option
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {RISK_LABELS[option].label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{RISK_LABELS[risk].detail}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <div className="flex items-center gap-2.5">
          <Switch
            id="checked-bag"
            checked={checkedBag}
            onCheckedChange={setCheckedBag}
            data-testid="switch-checked-bag"
          />
          <Label htmlFor="checked-bag" className="flex items-center gap-1.5 text-sm cursor-pointer">
            <Luggage className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            Checking a bag
          </Label>
        </div>
        <div className="flex items-center gap-2.5">
          <Switch
            id="international"
            checked={international}
            onCheckedChange={setInternational}
            data-testid="switch-international"
          />
          <Label htmlFor="international" className="flex items-center gap-1.5 text-sm cursor-pointer">
            <Globe className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            International
          </Label>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          Couldn't work that out: {(error as Error).message}
        </p>
      )}

      {plan && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-4"
        >
          <div className="rounded-lg bg-muted/60 p-4 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Be at {airport.code} by
            </p>
            <p className="text-3xl font-bold tabular-nums" data-testid="text-arrive-by">
              {arrivalOnAnotherDay
                ? formatDayTimeInZone(plan.arriveAtAirportBy, zone)
                : formatTimeInZone(plan.arriveAtAirportBy, zone)}
              {isFetching && (
                <Loader2 className="inline h-4 w-4 ml-2 animate-spin text-muted-foreground" aria-label="Updating" />
              )}
            </p>
            <p className="text-sm text-muted-foreground">
              {plan.totalMinutes} minutes before a{" "}
              {formatTimeInZone(plan.departureAt, zone)} departure
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="travel-minutes" className="flex items-center gap-1.5 text-sm font-medium">
              <Home className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              How long to get to the airport?
            </Label>
            <div className="flex items-center gap-3 flex-wrap">
              <Input
                id="travel-minutes"
                type="number"
                inputMode="numeric"
                min={0}
                max={600}
                placeholder="45"
                className="h-11 w-28"
                value={travelMinutes}
                onChange={(e) => setTravelMinutes(e.target.value)}
                data-testid="input-travel-minutes"
              />
              <span className="text-sm text-muted-foreground">minutes</span>
              {leaveHomeBy && (
                <p className="text-sm font-semibold" data-testid="text-leave-home-by">
                  Leave by{" "}
                  <span className="text-primary">
                    {crossesDayBoundary(leaveHomeBy, plan.departureAt, zone)
                      ? formatDayTimeInZone(leaveHomeBy, zone)
                      : formatTimeInZone(leaveHomeBy, zone)}
                  </span>
                </p>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
              How that adds up
            </p>
            <ul className="space-y-1.5">
              {plan.steps.map((step) => (
                <li key={step.label} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex-1 min-w-0">
                    <span className="font-medium">{step.label}</span>
                    <span className="text-muted-foreground"> — {step.detail}</span>
                  </span>
                  <span className="tabular-nums font-semibold flex-shrink-0">
                    {step.minutes} min
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center gap-2 flex-wrap text-xs">
            <Badge
              variant="outline"
              className={getConfidenceStyle(plan.securityForecast.confidence)}
            >
              {getConfidenceLabel(plan.securityForecast.confidence)} in the security forecast
            </Badge>
            <span className={`font-medium ${getWaitTimeColor(plan.securityForecast.waitMinutes)}`}>
              Expecting {plan.securityForecast.low}–{plan.securityForecast.high} min at
              security
            </span>
          </div>

          {plan.bagDropClosesAt && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
              Bag drop closes at {formatTimeInZone(plan.bagDropClosesAt, zone)}.
            </p>
          )}

          {plan.warnings.map((warning) => (
            <p
              key={warning}
              className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400"
              role="note"
            >
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-px" aria-hidden="true" />
              {warning}
            </p>
          ))}
        </motion.div>
      )}
    </Card>
  );
}
