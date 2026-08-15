import { useQuery } from "@tanstack/react-query";
import { TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AirportForecast, LineType } from "@shared/schema";
import { getWaitTimeHex, getWaitTimeColor, LINE_TYPE_SHORT_LABELS } from "@/lib/utils";

function hourLabel(hour: number): string {
  if (hour === 0) return "12a";
  if (hour === 12) return "12p";
  return hour < 12 ? `${hour}a` : `${hour - 12}p`;
}

/**
 * The next twelve hours, on the airport's clock.
 *
 * A single current number can't tell someone whether to leave now or wait —
 * "23 minutes" means something very different at the start of a peak than at
 * the end of one. This is what turns the app from a lookup into a planning
 * tool.
 */
export function ForecastStrip({
  code,
  lineType,
}: {
  code: string;
  lineType: LineType;
}) {
  const { data, isLoading } = useQuery<AirportForecast>({
    queryKey: ["/api/airports", code, "forecast", { line: lineType, hours: "12" }],
    refetchInterval: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <Card className="p-4 sm:p-5">
        <Skeleton className="h-4 w-40 mb-4" />
        <Skeleton className="h-28 w-full" />
      </Card>
    );
  }

  if (!data || data.points.length === 0) return null;

  const peak = Math.max(...data.points.map((p) => p.waitMinutes), 1);
  const busiest = data.points.reduce((worst, point) =>
    point.waitMinutes > worst.waitMinutes ? point : worst,
  );
  const quietest = data.points.reduce((best, point) =>
    point.waitMinutes < best.waitMinutes ? point : best,
  );

  return (
    <Card className="p-4 sm:p-5" data-testid="card-forecast-strip">
      <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Next 12 hours
          </h2>
        </div>
        <span className="text-xs text-muted-foreground">
          {LINE_TYPE_SHORT_LABELS[lineType]}
        </span>
      </div>

      <p className="text-xs text-muted-foreground mb-4">
        Quietest around{" "}
        <span className={`font-semibold ${getWaitTimeColor(quietest.waitMinutes)}`}>
          {hourLabel(quietest.localHour)}
        </span>{" "}
        ({quietest.waitMinutes} min), busiest around{" "}
        <span className={`font-semibold ${getWaitTimeColor(busiest.waitMinutes)}`}>
          {hourLabel(busiest.localHour)}
        </span>{" "}
        ({busiest.waitMinutes} min).
      </p>

      {/* Horizontal scroll on narrow screens rather than squeezing the bars
          until the shape is unreadable. */}
      <div className="overflow-x-auto -mx-1 px-1">
        <div
          className="flex items-end gap-1.5 min-w-[26rem] h-28"
          role="img"
          aria-label={data.points
            .map((p) => `${hourLabel(p.localHour)}: ${p.waitMinutes} minutes`)
            .join(", ")}
        >
          {data.points.map((point, index) => {
            const height = Math.max(4, (point.waitMinutes / peak) * 100);
            return (
              <div key={point.at} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
                  {point.waitMinutes}
                </span>
                <div
                  className="w-full rounded-t transition-all"
                  style={{
                    height: `${height}%`,
                    backgroundColor: getWaitTimeHex(point.waitMinutes),
                    // The further out, the less certain — say so visually
                    // rather than drawing every bar with equal authority.
                    opacity: point.confidence === "low" ? 0.5 : point.confidence === "medium" ? 0.75 : 1,
                  }}
                  title={`${hourLabel(point.localHour)}: ${point.low}–${point.high} min`}
                />
                <span className={`text-[10px] tabular-nums ${index === 0 ? "font-bold" : "text-muted-foreground"}`}>
                  {index === 0 ? "now" : hourLabel(point.localHour)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground mt-3">
        Faded bars are further out and less certain. Times are local to {data.code}.
      </p>
    </Card>
  );
}
