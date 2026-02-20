import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plane, Clock, Users, TrendingUp, ChevronRight, MapPin, ShieldCheck, Activity, BarChart3, Signal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { AirportWithStats } from "@shared/schema";
import { getWaitTimeColor, getWaitTimeBg, getWaitTimeLabel, formatMinutes, timeAgo, getWaitTimeDot, getDataSourceLabel, getDataSourceStyle, getFreshnessInfo } from "@/lib/utils";

function AnimatedCounter({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const prevValue = useRef(0);

  useEffect(() => {
    const start = prevValue.current;
    const diff = value - start;
    if (diff === 0) return;
    const duration = 600;
    const startTime = performance.now();

    function animate(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + diff * eased));
      if (progress < 1) requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
    prevValue.current = value;
  }, [value]);

  return <>{display}{suffix}</>;
}

function HeroSection({ searchQuery, onSearchChange }: { searchQuery: string; onSearchChange: (v: string) => void }) {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-slate-500 via-primary to-slate-600 dark:from-slate-700 dark:via-primary dark:to-slate-800">
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full bg-white/5 blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 rounded-full bg-slate-300/10 blur-3xl animate-pulse" style={{ animationDuration: '6s', animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-slate-400/5 blur-3xl" />
      </div>
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />

      <div className="relative max-w-4xl mx-auto px-4 pt-14 pb-20 sm:px-6 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-center gap-2.5 mb-5"
        >
          <div className="p-2.5 rounded-md bg-white/15 backdrop-blur-sm">
            <ShieldCheck className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Tarmac</h1>
        </motion.div>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-xl text-white/95 mb-2 font-semibold"
        >
          Real-time airport security wait times
        </motion.p>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-sm text-white/70 mb-10 max-w-md mx-auto leading-relaxed"
        >
          Crowdsourced by travelers like you. Report wait times and help others plan ahead.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="max-w-lg mx-auto relative"
        >
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            data-testid="input-search"
            type="search"
            placeholder="Search by airport name or code (e.g., LAX, JFK)"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-12 text-base bg-background border-0 shadow-xl rounded-md"
          />
        </motion.div>
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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.4 }}
      className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 -mt-7 relative z-10"
    >
      <Card className="p-4 sm:p-5">
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <div className="flex flex-col sm:flex-row items-center sm:items-center gap-1.5 sm:gap-3 text-center sm:text-left">
            <div className="p-2 sm:p-2.5 rounded-md bg-slate-100 dark:bg-slate-800/50">
              <Activity className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs text-muted-foreground font-medium">Reports</p>
              <p className="text-lg sm:text-xl font-bold" data-testid="text-total-reports" role="status">
                <AnimatedCounter value={totalReports} />
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center sm:items-center gap-1.5 sm:gap-3 text-center sm:text-left">
            <div className="p-2 sm:p-2.5 rounded-md bg-slate-100 dark:bg-slate-800/50">
              <MapPin className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs text-muted-foreground font-medium">Active</p>
              <p className="text-lg sm:text-xl font-bold" data-testid="text-active-airports">
                <AnimatedCounter value={activeAirports} />
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center sm:items-center gap-1.5 sm:gap-3 text-center sm:text-left">
            <div className="p-2 sm:p-2.5 rounded-md bg-slate-100 dark:bg-slate-800/50">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs text-muted-foreground font-medium">Avg Wait</p>
              <p className={`text-lg sm:text-xl font-bold ${getWaitTimeColor(overallAvg)}`} data-testid="text-avg-wait">
                {overallAvg !== null ? <><AnimatedCounter value={overallAvg} /> min</> : "--"}
              </p>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function DataSourceBadge({ source }: { source: "community" | "estimated" | "blended" }) {
  const Icon = source === "community" ? Users : source === "estimated" ? BarChart3 : Signal;
  return (
    <Badge variant="outline" className={`text-[10px] font-medium ${getDataSourceStyle(source)}`} data-testid={`badge-source-${source}`}>
      <Icon className="h-2.5 w-2.5 mr-1" />
      {getDataSourceLabel(source)}
    </Badge>
  );
}

function AirportCard({ airport, index }: { airport: AirportWithStats; index: number }) {
  const [, setLocation] = useLocation();
  const freshness = getFreshnessInfo(airport.latestReport);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.4) }}
    >
      <Card
        className="p-3 sm:p-4 cursor-pointer hover-elevate active-elevate-2 transition-all"
        onClick={() => setLocation(`/airport/${airport.code}`)}
        data-testid={`card-airport-${airport.code}`}
      >
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1">
            <div className={`relative flex-shrink-0 flex flex-col items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-md ${getWaitTimeBg(airport.avgWaitMinutes)}`}>
              <span className={`text-lg sm:text-xl font-bold leading-none ${getWaitTimeColor(airport.avgWaitMinutes)}`}>
                {formatMinutes(airport.avgWaitMinutes).replace(" min", "")}
              </span>
              <span className={`text-[9px] sm:text-[10px] font-medium mt-0.5 ${getWaitTimeColor(airport.avgWaitMinutes)}`}>min</span>
              {freshness.level === "fresh" && (
                <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${freshness.dotColor} ring-2 ring-card animate-pulse`} />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h3 className="font-bold text-sm sm:text-base">{airport.code}</h3>
                <Badge variant="secondary" className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider">
                  {getWaitTimeLabel(airport.avgWaitMinutes)}
                </Badge>
                <span className="hidden sm:inline-flex"><DataSourceBadge source={airport.dataSource} /></span>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground truncate mt-0.5">{airport.name}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <p className="text-[11px] sm:text-xs text-muted-foreground">{airport.city}, {airport.state}</p>
                <div className={`flex items-center gap-1 text-[10px] sm:text-xs font-medium sm:hidden ${freshness.color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${freshness.dotColor}`} />
                  <span>{freshness.label}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex-shrink-0 flex items-center gap-1.5 sm:gap-2.5">
            <div className="text-right hidden sm:block">
              <div className={`flex items-center justify-end gap-1.5 text-xs font-medium ${freshness.color}`} data-testid={`text-freshness-${airport.code}`}>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${freshness.dotColor}`} />
                <span>{freshness.label}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {airport.reportCount} {airport.reportCount === 1 ? "report" : "reports"}
              </p>
            </div>
            <div className={`sm:hidden text-right`} data-testid={`text-freshness-${airport.code}`}>
              <p className="text-[10px] text-muted-foreground">
                {airport.reportCount} {airport.reportCount === 1 ? "report" : "reports"}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function AirportListSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <Card key={i} className="p-4">
          <div className="flex items-center gap-3.5">
            <Skeleton className="w-14 h-14 rounded-md" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-12" />
                <Skeleton className="h-4 w-16 rounded-full" />
              </div>
              <Skeleton className="h-3.5 w-48" />
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
    <div className="min-h-screen bg-background flex flex-col">
      <HeroSection searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      <StatsBar airports={airports || []} />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-1">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
          <h2 className="text-xl font-bold">
            {searchQuery ? "Search Results" : "All Airports"}
          </h2>
          {searchQuery && (
            <p className="text-sm text-muted-foreground">
              {sorted?.length || 0} result{sorted?.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>

        {isLoading ? (
          <AirportListSkeleton />
        ) : sorted && sorted.length > 0 ? (
          <div className="space-y-2.5">
            {sorted.map((airport, i) => (
              <AirportCard key={airport.id} airport={airport} index={i} />
            ))}
          </div>
        ) : searchQuery ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card className="p-10 text-center">
              <Search className="h-10 w-10 text-muted-foreground/40 mx-auto mb-4" />
              <p className="font-semibold mb-1">No airports found</p>
              <p className="text-sm text-muted-foreground">
                Try searching by airport code (e.g., LAX) or city name
              </p>
            </Card>
          </motion.div>
        ) : (
          <Card className="p-10 text-center">
            <Plane className="h-10 w-10 text-muted-foreground/40 mx-auto mb-4" />
            <p className="font-semibold mb-1">No airports yet</p>
            <p className="text-sm text-muted-foreground">
              Check back soon for airport data
            </p>
          </Card>
        )}
      </div>

      <footer className="border-t py-6 mt-auto" data-testid="footer">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground/50" />
            <span className="text-xs text-muted-foreground" data-testid="text-footer-brand">Tarmac</span>
          </div>
          <p className="text-xs text-muted-foreground" data-testid="text-footer-disclaimer">
            Wait times are crowdsourced and may not reflect actual conditions.
          </p>
        </div>
      </footer>
    </div>
  );
}
