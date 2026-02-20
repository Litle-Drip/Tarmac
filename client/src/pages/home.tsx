import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Search, Plane, Clock, Users, TrendingUp, ChevronRight, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { AirportWithStats } from "@shared/schema";
import { getWaitTimeColor, getWaitTimeBg, getWaitTimeLabel, formatMinutes, timeAgo } from "@/lib/utils";

function HeroSection({ searchQuery, onSearchChange }: { searchQuery: string; onSearchChange: (v: string) => void }) {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-primary/90 via-primary to-blue-700 dark:from-primary/80 dark:via-blue-800 dark:to-blue-950">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-10 left-10 w-64 h-64 rounded-full bg-white/20 blur-3xl" />
        <div className="absolute bottom-10 right-10 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
      </div>
      <div className="relative max-w-4xl mx-auto px-4 pt-12 pb-16 sm:px-6 lg:px-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="p-2 rounded-md bg-white/15">
            <Plane className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">GateCheck</h1>
        </div>
        <p className="text-lg text-white/90 mb-2 font-medium">
          Real-time airport security wait times
        </p>
        <p className="text-sm text-white/70 mb-8 max-w-md mx-auto">
          Crowdsourced by travelers like you. Report wait times and help others plan ahead.
        </p>
        <div className="max-w-lg mx-auto relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            data-testid="input-search"
            type="search"
            placeholder="Search by airport name or code (e.g., LAX, JFK)"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-11 h-12 text-base bg-background border-0 shadow-lg"
          />
        </div>
      </div>
    </div>
  );
}

function StatsBar({ airports }: { airports: AirportWithStats[] }) {
  const totalReports = airports.reduce((sum, a) => sum + a.reportCount, 0);
  const activeAirports = airports.filter((a) => a.reportCount > 0).length;
  const avgWait = airports.filter((a) => a.avgWaitMinutes !== null);
  const overallAvg = avgWait.length > 0
    ? Math.round(avgWait.reduce((sum, a) => sum + (a.avgWaitMinutes || 0), 0) / avgWait.length)
    : null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 -mt-6 relative z-10">
      <Card className="p-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-primary/10">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Reports</p>
              <p className="text-lg font-semibold" data-testid="text-total-reports">{totalReports}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-primary/10">
              <MapPin className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Airports</p>
              <p className="text-lg font-semibold">{activeAirports}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-primary/10">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg Wait</p>
              <p className={`text-lg font-semibold ${getWaitTimeColor(overallAvg)}`}>
                {overallAvg !== null ? `${overallAvg} min` : "--"}
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function AirportCard({ airport }: { airport: AirportWithStats }) {
  const [, setLocation] = useLocation();

  return (
    <Card
      className="p-4 cursor-pointer hover-elevate active-elevate-2 transition-all"
      onClick={() => setLocation(`/airport/${airport.code}`)}
      data-testid={`card-airport-${airport.code}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={`flex-shrink-0 flex items-center justify-center w-14 h-14 rounded-md ${getWaitTimeBg(airport.avgWaitMinutes)}`}>
            <span className={`text-xl font-bold ${getWaitTimeColor(airport.avgWaitMinutes)}`}>
              {formatMinutes(airport.avgWaitMinutes).replace(" min", "")}
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm">{airport.code}</h3>
              <Badge variant="secondary" className="text-xs">
                {getWaitTimeLabel(airport.avgWaitMinutes)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground truncate">{airport.name}</p>
            <p className="text-xs text-muted-foreground">{airport.city}, {airport.state}</p>
          </div>
        </div>
        <div className="flex-shrink-0 flex items-center gap-2">
          <div className="text-right">
            {airport.reportCount > 0 && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{airport.latestReport ? timeAgo(airport.latestReport) : ""}</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">
              {airport.reportCount} {airport.reportCount === 1 ? "report" : "reports"}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    </Card>
  );
}

function AirportListSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <Card key={i} className="p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="w-14 h-14 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-3 w-48" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: airports, isLoading } = useQuery<AirportWithStats[]>({
    queryKey: ["/api/airports"],
    refetchInterval: 30000,
  });

  const filtered = airports?.filter((a) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      a.code.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      a.city.toLowerCase().includes(q) ||
      a.state.toLowerCase().includes(q)
    );
  });

  const sorted = filtered?.sort((a, b) => {
    if (a.reportCount > 0 && b.reportCount === 0) return -1;
    if (a.reportCount === 0 && b.reportCount > 0) return 1;
    if (a.latestReport && b.latestReport) {
      return new Date(b.latestReport).getTime() - new Date(a.latestReport).getTime();
    }
    return a.code.localeCompare(b.code);
  });

  return (
    <div className="min-h-screen bg-background">
      <HeroSection searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      <StatsBar airports={airports || []} />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-lg font-semibold">Airports</h2>
          {searchQuery && (
            <p className="text-sm text-muted-foreground">
              {sorted?.length || 0} result{sorted?.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>

        {isLoading ? (
          <AirportListSkeleton />
        ) : sorted && sorted.length > 0 ? (
          <div className="space-y-3">
            {sorted.map((airport) => (
              <AirportCard key={airport.id} airport={airport} />
            ))}
          </div>
        ) : searchQuery ? (
          <Card className="p-8 text-center">
            <Search className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium mb-1">No airports found</p>
            <p className="text-sm text-muted-foreground">
              Try searching by airport code (e.g., LAX) or city name
            </p>
          </Card>
        ) : (
          <Card className="p-8 text-center">
            <Plane className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium mb-1">No airports yet</p>
            <p className="text-sm text-muted-foreground">
              Check back soon for airport data
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
