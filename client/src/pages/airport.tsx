import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Clock, Users, Plus, Plane, TrendingUp, Shield, Zap, ShieldCheck, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { AirportWithStats, WaitTimeReport } from "@shared/schema";
import { getWaitTimeColor, getWaitTimeBg, getWaitTimeLabel, formatMinutes, timeAgo, getWaitTimeHex, getWaitTimeDot } from "@/lib/utils";

function AnimatedGauge({ minutes }: { minutes: number | null }) {
  const pct = minutes !== null ? Math.min((minutes / 60) * 100, 100) : 0;
  const circumference = 2 * Math.PI * 44;
  const strokeDashoffset = circumference - (pct / 100) * circumference;
  const color = getWaitTimeHex(minutes);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative flex items-center justify-center w-36 h-36">
        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="44" fill="none" stroke="hsl(var(--border))" strokeWidth="5" opacity="0.5" />
          {minutes !== null && (
            <motion.circle
              cx="50" cy="50" r="44" fill="none"
              stroke={color}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
            />
          )}
        </svg>
        <div className={`absolute inset-4 rounded-full ${getWaitTimeBg(minutes)} flex items-center justify-center`}>
          <div className="text-center">
            <motion.p
              className={`text-3xl font-bold ${getWaitTimeColor(minutes)}`}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.3 }}
            >
              {formatMinutes(minutes).replace(" min", "")}
            </motion.p>
            <p className="text-xs text-muted-foreground font-medium">min avg</p>
          </div>
        </div>
      </div>
      <Badge variant="secondary" className="text-xs font-semibold uppercase tracking-wider">
        {getWaitTimeLabel(minutes)}
      </Badge>
    </div>
  );
}

function ReportForm({ airportId, airportCode, onSuccess }: { airportId: string; airportCode: string; onSuccess: () => void }) {
  const [waitMinutes, setWaitMinutes] = useState(15);
  const [lineType, setLineType] = useState("standard");
  const [terminal, setTerminal] = useState("");
  const [checkpoint, setCheckpoint] = useState("");
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/reports", {
        airportId,
        waitMinutes,
        lineType,
        terminal: terminal || null,
        checkpoint: checkpoint || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/airports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/airports", airportCode] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports", airportCode] });
      toast({ title: "Report submitted!", description: "Thanks for helping fellow travelers." });
      onSuccess();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Wait Time</Label>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${getWaitTimeDot(waitMinutes)}`} />
            <span className={`text-sm font-bold ${getWaitTimeColor(waitMinutes)}`}>{waitMinutes} min</span>
          </div>
        </div>
        <div className="px-1">
          <Slider
            data-testid="slider-wait-time"
            value={[waitMinutes]}
            onValueChange={(v) => setWaitMinutes(v[0])}
            min={0}
            max={120}
            step={5}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground font-medium">
          <span>0</span>
          <span>30</span>
          <span>60</span>
          <span>90</span>
          <span>120 min</span>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Line Type</Label>
        <Select value={lineType} onValueChange={setLineType}>
          <SelectTrigger data-testid="select-line-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="standard">
              <span className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5" />
                Standard
              </span>
            </SelectItem>
            <SelectItem value="tsa_precheck">
              <span className="flex items-center gap-2">
                <Shield className="h-3.5 w-3.5" />
                TSA PreCheck
              </span>
            </SelectItem>
            <SelectItem value="clear">
              <span className="flex items-center gap-2">
                <Zap className="h-3.5 w-3.5" />
                CLEAR
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Terminal <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input
            data-testid="input-terminal"
            placeholder="e.g., Terminal 1"
            value={terminal}
            onChange={(e) => setTerminal(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium">Checkpoint <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input
            data-testid="input-checkpoint"
            placeholder="e.g., North"
            value={checkpoint}
            onChange={(e) => setCheckpoint(e.target.value)}
          />
        </div>
      </div>

      <Button
        data-testid="button-submit-report"
        className="w-full"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
      >
        {mutation.isPending ? "Submitting..." : "Submit Report"}
      </Button>
    </div>
  );
}

function LineTypeCard({ type, avg, count }: { type: string; avg: number; count: number }) {
  const labels: Record<string, { label: string; icon: typeof Shield; desc: string }> = {
    standard: { label: "Standard", icon: Users, desc: "Regular screening" },
    tsa_precheck: { label: "TSA PreCheck", icon: Shield, desc: "Expedited screening" },
    clear: { label: "CLEAR", icon: Zap, desc: "Identity verification" },
  };
  const lt = labels[type] || labels.standard;
  const Icon = lt.icon;
  const barWidth = Math.min((avg / 60) * 100, 100);

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="flex items-center gap-3"
    >
      <div className={`flex-shrink-0 p-2 rounded-md ${getWaitTimeBg(avg)}`}>
        <Icon className={`h-4 w-4 ${getWaitTimeColor(avg)}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium">{lt.label}</span>
            <span className="text-xs text-muted-foreground">({count})</span>
          </div>
          <span className={`text-sm font-bold ${getWaitTimeColor(avg)}`}>{avg} min</span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: getWaitTimeHex(avg) }}
            initial={{ width: 0 }}
            animate={{ width: `${barWidth}%` }}
            transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
          />
        </div>
      </div>
    </motion.div>
  );
}

function ReportCard({ report, index }: { report: WaitTimeReport; index: number }) {
  const lineTypeLabels: Record<string, { label: string; icon: typeof Shield }> = {
    standard: { label: "Standard", icon: Users },
    tsa_precheck: { label: "PreCheck", icon: Shield },
    clear: { label: "CLEAR", icon: Zap },
  };
  const lt = lineTypeLabels[report.lineType] || lineTypeLabels.standard;
  const Icon = lt.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.05, 0.3) }}
    >
      <Card className="p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`relative flex items-center justify-center w-11 h-11 rounded-md ${getWaitTimeBg(report.waitMinutes)}`}>
              <span className={`text-sm font-bold ${getWaitTimeColor(report.waitMinutes)}`}>
                {report.waitMinutes}
              </span>
              <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ${getWaitTimeDot(report.waitMinutes)} ring-2 ring-card`} />
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium">{lt.label}</span>
                {report.terminal && (
                  <Badge variant="outline" className="text-[10px]">{report.terminal}</Badge>
                )}
                {report.checkpoint && (
                  <Badge variant="outline" className="text-[10px]">{report.checkpoint}</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {report.waitMinutes} min wait
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
            <Clock className="h-3 w-3" />
            <span>{timeAgo(report.reportedAt as unknown as string)}</span>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function AirportDetailSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-gradient-to-r from-primary/5 to-primary/10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Skeleton className="h-8 w-32 mb-3" />
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-5 w-28 rounded-full" />
              </div>
              <Skeleton className="h-5 w-64" />
            </div>
            <Skeleton className="h-9 w-32 rounded-md" />
          </div>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <Card className="p-6">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <Skeleton className="w-36 h-36 rounded-full" />
            <div className="flex-1 w-full space-y-4">
              <Skeleton className="h-4 w-40" />
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-9 h-9 rounded-md" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-1.5 w-full rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
        <Skeleton className="h-5 w-32" />
        <div className="space-y-2.5">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-3.5">
              <div className="flex items-center gap-3">
                <Skeleton className="w-11 h-11 rounded-md" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AirportDetail() {
  const { code } = useParams<{ code: string }>();
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: airport, isLoading: airportLoading } = useQuery<AirportWithStats>({
    queryKey: ["/api/airports", code],
    refetchInterval: 30000,
  });

  const { data: reports, isLoading: reportsLoading } = useQuery<WaitTimeReport[]>({
    queryKey: ["/api/reports", code],
    refetchInterval: 30000,
    enabled: !!airport,
  });

  if (airportLoading) {
    return <AirportDetailSkeleton />;
  }

  if (!airport) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center px-4"
        >
          <Plane className="h-14 w-14 text-muted-foreground/30 mx-auto mb-5" />
          <h2 className="text-xl font-bold mb-2">Airport not found</h2>
          <p className="text-muted-foreground mb-5">We couldn't find an airport with code "{code}"</p>
          <Button onClick={() => setLocation("/")} data-testid="button-back-home">Go Back Home</Button>
        </motion.div>
      </div>
    );
  }

  const lineTypeStats = reports?.reduce<Record<string, { total: number; count: number }>>((acc, r) => {
    if (!acc[r.lineType]) acc[r.lineType] = { total: 0, count: 0 };
    acc[r.lineType].total += r.waitMinutes;
    acc[r.lineType].count += 1;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="bg-gradient-to-r from-primary/5 via-primary/8 to-primary/5 dark:from-primary/10 dark:via-primary/5 dark:to-primary/10 border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/")}
              className="mb-3 -ml-2"
              data-testid="button-back"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              All Airports
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="flex items-start justify-between gap-4 flex-wrap"
          >
            <div>
              <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                <h1 className="text-3xl font-bold" data-testid="text-airport-code">{airport.code}</h1>
                <Badge variant="secondary" className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {airport.city}, {airport.state}
                </Badge>
              </div>
              <p className="text-muted-foreground text-sm" data-testid="text-airport-name">{airport.name}</p>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-report-wait">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Report Wait Time
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Report Wait Time at {airport.code}</DialogTitle>
                </DialogHeader>
                <ReportForm airportId={airport.id} airportCode={airport.code} onSuccess={() => setDialogOpen(false)} />
              </DialogContent>
            </Dialog>
          </motion.div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 w-full flex-1">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <Card className="p-6">
            <div className="flex flex-col sm:flex-row items-center gap-8">
              <AnimatedGauge minutes={airport.avgWaitMinutes} />
              <div className="flex-1 w-full">
                <h3 className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wider">By Line Type</h3>
                <div className="space-y-4">
                  {lineTypeStats && Object.entries(lineTypeStats).map(([type, stats]) => {
                    const avg = Math.round(stats.total / stats.count);
                    return <LineTypeCard key={type} type={type} avg={avg} count={stats.count} />;
                  })}
                  {(!lineTypeStats || Object.keys(lineTypeStats).length === 0) && (
                    <div className="text-center py-4">
                      <p className="text-sm text-muted-foreground">No reports yet. Be the first to share your experience!</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.35 }}
        >
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-lg font-bold">Recent Reports</h2>
            <span className="text-sm text-muted-foreground">
              {airport.reportCount} total
            </span>
          </div>

          {reportsLoading ? (
            <div className="space-y-2.5">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="p-3.5">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-11 h-11 rounded-md" />
                    <div className="space-y-1.5 flex-1">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : reports && reports.length > 0 ? (
            <div className="space-y-2.5">
              {reports.map((report, i) => (
                <ReportCard key={report.id} report={report} index={i} />
              ))}
            </div>
          ) : (
            <Card className="p-10 text-center">
              <TrendingUp className="h-10 w-10 text-muted-foreground/30 mx-auto mb-4" />
              <p className="font-semibold mb-1">No reports yet</p>
              <p className="text-sm text-muted-foreground mb-4">
                Help other travelers by sharing your experience
              </p>
              <Button onClick={() => setDialogOpen(true)} data-testid="button-first-report">
                <Plus className="h-4 w-4 mr-1.5" />
                Be the First to Report
              </Button>
            </Card>
          )}
        </motion.div>
      </div>

      <footer className="border-t py-6 mt-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground/50" />
            <span className="text-xs text-muted-foreground">GateCheck</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Wait times are crowdsourced and may not reflect actual conditions.
          </p>
        </div>
      </footer>
    </div>
  );
}
