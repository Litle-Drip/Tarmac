import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Plane, Users, TrendingUp, ChevronRight, MapPin, ShieldCheck,
  Activity, BarChart3, Signal, Sun, Moon, RefreshCw, Loader2, Navigation, Shield, Zap,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTheme } from "@/components/theme-provider";
import { queryClient } from "@/lib/queryClient";
import { LINE_TYPES, type AirportWithStats, type LineType } from "@shared/schema";
import { getPreferredLineType, setPreferredLineType } from "@/lib/device";
import {
  getWaitTimeColor, getWaitTimeBg, getWaitTimeLabel, getDataSourceLabel,
  getDataSourceStyle, getFreshnessInfo, LINE_TYPE_SHORT_LABELS,
} from "@/lib/utils";

const LINE_ICONS: Record<LineType, typeof Shield> = {
  standard: Users,
  tsa_precheck: Shield,
  clear: Zap,
};

type SortMode = "active" | "nearest" | "shortest";

function AnimatedCounter({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const prevValue = useRef(0);

  useEffect(() => {
    const start = prevValue.current;
    const diff = value - start;
    prevValue.current = value;
    if (diff === 0) {
      setDisplay(value);
      return;
    }

    const duration = 600;
    const startTime = performance.now();
    let frame = 0;

    function animate(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + diff * eased));
      if (progress < 1) frame = requestAnimationFrame(animate);
    }

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{display}{suffix}</>;
}

function PullToRefreshIndicator({ pullDistance, refreshing }: { pullDistance: number; refreshing: boolean }) {
  if (pullDistance === 0 && !refreshing) return null;
  const opacity = Math.min(pullDistance / 80, 1);
  const rotate = refreshing ? undefined : pullDistance * 3;

  return (
    <div
      className="flex items-center justify-center py-2 overflow-hidden transition-all"
      style={{ height: pullDistance > 0 || refreshing ? `${Math.max(pullDistance, refreshing ? 48 : 0)}px` : 0 }}
    >
      <div style={{ opacity }} className="text-muted-foreground">
        {refreshing ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <RefreshCw className="h-5 w-5" style={{ transform: `rotate(${rotate}deg)` }} />
        )}
      </div>
    </div>
  );
}

function StickySearchBar({ searchQuery, onSearchChange, visible }: { searchQuery: string; onSearchChange: (v: string) => void; visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-b shadow-sm"
        >
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-3">
            <div className="flex items-center gap-2 flex-shrink-0">
              <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
              <span className="font-bold text-sm hidden sm:inline">Tarmac</span>
            </div>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                data-testid="input-search-sticky"
                type="search"
                aria-label="Search airports"
                placeholder="Search airports…"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function HeroSection({ searchQuery, onSearchChange, searchRef }: { searchQuery: string; onSearchChange: (v: string) => void; searchRef: React.Ref<HTMLDivElement> }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-slate-500 via-primary to-slate-600 dark:from-slate-700 dark:via-primary dark:to-slate-800">
      <div className="absolute inset-0" aria-hidden="true">
        <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full bg-white/5 blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 rounded-full bg-slate-300/10 blur-3xl animate-pulse" style={{ animationDuration: '6s', animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-slate-400/5 blur-3xl" />
      </div>
      <div className="absolute inset-0 opacity-[0.03]" aria-hidden="true" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />

      <div className="relative max-w-4xl mx-auto px-4 pt-10 pb-16 sm:pt-14 sm:pb-20 sm:px-6 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-center gap-2.5 mb-4 sm:mb-5"
        >
          <div className="p-2 sm:p-2.5 rounded-md bg-white/15 backdrop-blur-sm">
            <ShieldCheck className="h-6 w-6 sm:h-7 sm:w-7 text-white" aria-hidden="true" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Tarmac</h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="text-white/80 hover:text-white hover:bg-white/15 h-9 w-9 rounded-md"
            aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            data-testid="button-theme-toggle"
          >
            {theme === "light" ? <Moon className="h-4.5 w-4.5" /> : <Sun className="h-4.5 w-4.5" />}
          </Button>
        </motion.div>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-lg sm:text-xl text-white/95 mb-1.5 sm:mb-2 font-semibold"
        >
          Know the security line before you leave
        </motion.p>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-xs sm:text-sm text-white/70 mb-8 sm:mb-10 max-w-md mx-auto leading-relaxed"
        >
          Reported by travelers standing in the line right now. Add yours and help the next person.
        </motion.p>
        <motion.div
          ref={searchRef}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="max-w-lg mx-auto relative"
        >
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <Input
            data-testid="input-search"
            type="search"
            aria-label="Search by airport name or code"
            placeholder="Search by airport name or code (e.g., LAX, JFK)"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-12 h-12 sm:h-11 text-base bg-background border-0 shadow-xl rounded-md"
          />
        </motion.div>
      </div>
    </div>
  );
}

/**
 * Only counts things that are actually true.
 *
 * The previous "average wait" averaged one number per airport across every
 * airport in the list — weighting a one-terminal regional field equally with
 * ATL, and mostly averaging estimates rather than reports. It described
 * nothing. These three describe the state of the network right now.
 */
function StatsBar({ airports }: { airports: AirportWithStats[] }) {
  const reported = airports.filter((a) => a.reportCount > 0);
  const totalReports = airports.reduce((sum, a) => sum + a.reportCount, 0);

  const longest = reported.reduce<AirportWithStats | null>(
    (worst, airport) =>
      worst === null || airport.wait.waitMinutes > worst.wait.waitMinutes ? airport : worst,
    null,
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.4 }}
      className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 -mt-7 relative z-10"
    >
      <Card className="p-4 sm:p-5">
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-3 text-center sm:text-left">
            <div className="p-2 sm:p-2.5 rounded-md bg-slate-100 dark:bg-slate-800/50">
              <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs text-muted-foreground font-medium">Reports (6h)</p>
              <p className="text-lg sm:text-xl font-bold" data-testid="text-total-reports">
                <AnimatedCounter value={totalReports} />
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-3 text-center sm:text-left">
            <div className="p-2 sm:p-2.5 rounded-md bg-slate-100 dark:bg-slate-800/50">
              <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs text-muted-foreground font-medium">Airports live</p>
              <p className="text-lg sm:text-xl font-bold" data-testid="text-active-airports">
                <AnimatedCounter value={reported.length} />
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-3 text-center sm:text-left">
            <div className="p-2 sm:p-2.5 rounded-md bg-slate-100 dark:bg-slate-800/50">
              <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
            </div>
            <div>
              <p className="text-[10px] sm:text-xs text-muted-foreground font-medium">Longest now</p>
              <p
                className={`text-lg sm:text-xl font-bold ${getWaitTimeColor(longest?.wait.waitMinutes ?? null)}`}
                data-testid="text-longest-wait"
              >
                {longest ? `${longest.code} ${longest.wait.waitMinutes}m` : "--"}
              </p>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function AirportCard({ airport, index, distanceMiles }: { airport: AirportWithStats; index: number; distanceMiles?: number }) {
  const [, setLocation] = useLocation();
  const freshness = getFreshnessInfo(airport.latestReport);
  const SourceIcon =
    airport.wait.dataSource === "community" ? Users : airport.wait.dataSource === "estimated" ? BarChart3 : Signal;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.4) }}
    >
      <Card
        className="p-3 sm:p-4 cursor-pointer hover-elevate active-elevate-2 transition-all active:scale-[0.98]"
        onClick={() => setLocation(`/airport/${airport.code}`)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setLocation(`/airport/${airport.code}`);
          }
        }}
        role="link"
        tabIndex={0}
        aria-label={`${airport.code}, ${airport.name}. About ${airport.wait.waitMinutes} minutes.`}
        data-testid={`card-airport-${airport.code}`}
      >
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1">
            <div className={`relative flex-shrink-0 flex flex-col items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-md ${getWaitTimeBg(airport.wait.waitMinutes)}`}>
              <span className={`text-lg sm:text-xl font-bold leading-none ${getWaitTimeColor(airport.wait.waitMinutes)}`}>
                {airport.wait.waitMinutes}
              </span>
              <span className={`text-[9px] sm:text-[10px] font-medium mt-0.5 ${getWaitTimeColor(airport.wait.waitMinutes)}`}>min</span>
              {freshness.level === "fresh" && (
                <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${freshness.dotColor} ring-2 ring-card animate-pulse`} aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h3 className="font-bold text-sm sm:text-base">{airport.code}</h3>
                <Badge variant="secondary" className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider">
                  {getWaitTimeLabel(airport.wait.waitMinutes)}
                </Badge>
                <span className="hidden sm:inline-flex">
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-medium ${getDataSourceStyle(airport.wait.dataSource)}`}
                    data-testid={`badge-source-${airport.wait.dataSource}`}
                  >
                    <SourceIcon className="h-2.5 w-2.5 mr-1" aria-hidden="true" />
                    {getDataSourceLabel(airport.wait.dataSource)}
                  </Badge>
                </span>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground truncate mt-0.5">{airport.name}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <p className="text-[11px] sm:text-xs text-muted-foreground">
                  {airport.city}, {airport.state}
                  {distanceMiles !== undefined && ` · ${Math.round(distanceMiles)} mi`}
                </p>
                <div className={`flex items-center gap-1 text-[10px] sm:text-xs font-medium sm:hidden ${freshness.color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${freshness.dotColor}`} aria-hidden="true" />
                  <span>{freshness.label}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex-shrink-0 flex items-center gap-1.5 sm:gap-2.5">
            <div className="text-right hidden sm:block">
              <div className={`flex items-center justify-end gap-1.5 text-xs font-medium ${freshness.color}`} data-testid={`text-freshness-${airport.code}`}>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${freshness.dotColor}`} aria-hidden="true" />
                <span>{freshness.label}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {airport.reportCount} {airport.reportCount === 1 ? "report" : "reports"}
              </p>
            </div>
            <div className="sm:hidden text-right">
              <p className="text-[10px] text-muted-foreground">
                {airport.reportCount} {airport.reportCount === 1 ? "report" : "reports"}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/50" aria-hidden="true" />
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

const AIRPORT_COORDS: Record<string, { lat: number; lng: number }> = {
  ATL: { lat: 33.6407, lng: -84.4277 }, AUS: { lat: 30.1975, lng: -97.6664 },
  BOS: { lat: 42.3656, lng: -71.0096 }, BWI: { lat: 39.1754, lng: -76.6684 },
  CLT: { lat: 35.2140, lng: -80.9431 }, DCA: { lat: 38.8512, lng: -77.0402 },
  DEN: { lat: 39.8561, lng: -104.6737 }, DFW: { lat: 32.8998, lng: -97.0403 },
  DTW: { lat: 42.2124, lng: -83.3534 }, EWR: { lat: 40.6895, lng: -74.1745 },
  FLL: { lat: 26.0742, lng: -80.1506 }, HNL: { lat: 21.3187, lng: -157.9225 },
  IAD: { lat: 38.9531, lng: -77.4565 }, IAH: { lat: 29.9902, lng: -95.3368 },
  JFK: { lat: 40.6413, lng: -73.7781 }, LAS: { lat: 36.0840, lng: -115.1537 },
  LAX: { lat: 33.9416, lng: -118.4085 }, LGA: { lat: 40.7769, lng: -73.8740 },
  MCO: { lat: 28.4312, lng: -81.3081 }, MIA: { lat: 25.7959, lng: -80.2870 },
  MSP: { lat: 44.8848, lng: -93.2223 }, ORD: { lat: 41.9742, lng: -87.9073 },
  PDX: { lat: 45.5898, lng: -122.5951 }, PHL: { lat: 39.8744, lng: -75.2424 },
  PHX: { lat: 33.4373, lng: -112.0078 }, SAN: { lat: 32.7338, lng: -117.1933 },
  SEA: { lat: 47.4502, lng: -122.3088 }, SFO: { lat: 37.6213, lng: -122.3790 },
  SLC: { lat: 40.7899, lng: -111.9791 }, TPA: { lat: 27.9756, lng: -82.5333 },
  RSW: { lat: 26.5362, lng: -81.7552 }, RHI: { lat: 45.6312, lng: -89.4675 },
};

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [showStickySearch, setShowStickySearch] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("active");
  const [lineType, setLineType] = useState<LineType>(() => getPreferredLineType());

  useEffect(() => {
    setPreferredLineType(lineType);
  }, [lineType]);

  const { data: airports, isLoading } = useQuery<AirportWithStats[]>({
    queryKey: ["/api/airports", { line: lineType }],
    refetchInterval: 30000,
  });

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setShowStickySearch(!entry.isIntersecting),
      { threshold: 0 }
    );
    const el = searchRef.current;
    if (el) observer.observe(el);
    return () => { if (el) observer.unobserve(el); };
  }, []);

  /**
   * Asked for on tap, not on load.
   *
   * An unexplained permission prompt on first paint gets denied — and browsers
   * remember that denial. Tying it to a control the traveller chose to press
   * makes the reason obvious and the answer far more often "allow".
   */
  const requestLocation = useCallback(() => {
    if (userLocation) {
      setSortMode("nearest");
      return;
    }
    if (!navigator.geolocation) return;

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setSortMode("nearest");
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 10000, maximumAge: 300000 },
    );
  }, [userLocation]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["/api/airports"] });
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling.current || refreshing) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) setPullDistance(Math.min(delta * 0.4, 100));
  }, [refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current) return;
    pulling.current = false;
    if (pullDistance >= 60 && !refreshing) await handleRefresh();
    setPullDistance(0);
  }, [pullDistance, refreshing, handleRefresh]);

  const distances = useMemo(() => {
    if (!userLocation) return null;
    const map = new Map<string, number>();
    for (const [code, coords] of Object.entries(AIRPORT_COORDS)) {
      map.set(code, haversineDistance(userLocation.lat, userLocation.lng, coords.lat, coords.lng));
    }
    return map;
  }, [userLocation]);

  const visible = useMemo(() => {
    if (!airports) return undefined;

    const query = searchQuery.trim().toLowerCase();
    const filtered = query
      ? airports.filter(
          (a) =>
            a.code.toLowerCase().includes(query) ||
            a.name.toLowerCase().includes(query) ||
            a.city.toLowerCase().includes(query) ||
            a.state.toLowerCase().includes(query),
        )
      : [...airports];

    // Sorting a copy — the array from the query cache must not be mutated.
    return filtered.sort((a, b) => {
      if (sortMode === "nearest" && distances) {
        const distA = distances.get(a.code) ?? Infinity;
        const distB = distances.get(b.code) ?? Infinity;
        if (distA !== distB) return distA - distB;
      }

      if (sortMode === "shortest") {
        if (a.wait.waitMinutes !== b.wait.waitMinutes) {
          return a.wait.waitMinutes - b.wait.waitMinutes;
        }
      }

      // Default and final tiebreak: airports people are actually reporting
      // from, freshest first, then alphabetical.
      if (a.reportCount > 0 !== b.reportCount > 0) return a.reportCount > 0 ? -1 : 1;
      if (a.latestReport && b.latestReport) {
        const diff = new Date(b.latestReport).getTime() - new Date(a.latestReport).getTime();
        if (diff !== 0) return diff;
      }
      return a.code.localeCompare(b.code);
    });
  }, [airports, searchQuery, sortMode, distances]);

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-background flex flex-col"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <StickySearchBar searchQuery={searchQuery} onSearchChange={setSearchQuery} visible={showStickySearch} />
      <PullToRefreshIndicator pullDistance={pullDistance} refreshing={refreshing} />
      <HeroSection searchQuery={searchQuery} onSearchChange={setSearchQuery} searchRef={searchRef} />
      <StatsBar airports={airports || []} />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 w-full flex-1">
        {/* Which line you stand in changes the answer by more than anything
            else on this screen, so it sits at the top of the list, not inside
            a form. */}
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div role="tablist" aria-label="Security line type" className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-muted flex-1 min-w-[15rem]">
            {LINE_TYPES.map((line) => {
              const Icon = LINE_ICONS[line];
              const selected = lineType === line;
              return (
                <button
                  key={line}
                  role="tab"
                  type="button"
                  aria-selected={selected}
                  onClick={() => setLineType(line)}
                  data-testid={`tab-home-line-${line}`}
                  className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                    selected ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {LINE_TYPE_SHORT_LABELS[line]}
                </button>
              );
            })}
          </div>

          <Button
            variant={sortMode === "nearest" ? "default" : "outline"}
            size="sm"
            className="h-9"
            onClick={requestLocation}
            disabled={locating}
            data-testid="button-sort-nearest"
          >
            {locating ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" aria-hidden="true" />
            ) : (
              <Navigation className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
            )}
            Nearest
          </Button>
          <Button
            variant={sortMode === "active" ? "default" : "outline"}
            size="sm"
            className="h-9"
            onClick={() => setSortMode("active")}
            data-testid="button-sort-active"
          >
            Most active
          </Button>
        </div>

        <div className="flex items-center justify-between mb-4 sm:mb-5 flex-wrap gap-2">
          <h2 className="text-lg sm:text-xl font-bold">
            {searchQuery ? "Search results" : "All airports"}
          </h2>
          {searchQuery && (
            <p className="text-sm text-muted-foreground">
              {visible?.length || 0} result{visible?.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>

        {isLoading ? (
          <AirportListSkeleton />
        ) : visible && visible.length > 0 ? (
          <div className="space-y-2 sm:space-y-2.5">
            {visible.map((airport, i) => (
              <AirportCard
                key={airport.id}
                airport={airport}
                index={i}
                distanceMiles={sortMode === "nearest" ? distances?.get(airport.code) : undefined}
              />
            ))}
          </div>
        ) : searchQuery ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card className="p-10 text-center">
              <Search className="h-10 w-10 text-muted-foreground/40 mx-auto mb-4" aria-hidden="true" />
              <p className="font-semibold mb-1">No airports found</p>
              <p className="text-sm text-muted-foreground">
                Try searching by airport code (e.g., LAX) or city name
              </p>
            </Card>
          </motion.div>
        ) : (
          <Card className="p-10 text-center">
            <Plane className="h-10 w-10 text-muted-foreground/40 mx-auto mb-4" aria-hidden="true" />
            <p className="font-semibold mb-1">No airports yet</p>
            <p className="text-sm text-muted-foreground">Check back soon for airport data</p>
          </Card>
        )}
      </div>

      <footer className="border-t py-6 mt-auto" data-testid="footer">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm font-medium text-muted-foreground" data-testid="text-footer-brand">Tarmac</span>
          </div>
          <p className="text-xs text-muted-foreground/80" data-testid="text-footer-disclaimer">
            Experimental software by Edison Labs LLC
          </p>
          <p className="text-[11px] text-muted-foreground/60">
            Wait times are crowdsourced and may not reflect actual conditions.
          </p>
          <Link href="/privacy" className="text-[11px] text-muted-foreground/80 underline">
            Privacy
          </Link>
        </div>
      </footer>
    </div>
  );
}
