import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Clock, Users, Plus, Plane, TrendingUp, Shield, Zap } from "lucide-react";
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
import { getWaitTimeColor, getWaitTimeBg, getWaitTimeLabel, formatMinutes, timeAgo } from "@/lib/utils";

function WaitTimeGauge({ minutes }: { minutes: number | null }) {
  const pct = minutes !== null ? Math.min((minutes / 60) * 100, 100) : 0;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`relative flex items-center justify-center w-28 h-28 rounded-full ${getWaitTimeBg(minutes)}`}>
        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--border))" strokeWidth="6" />
          {minutes !== null && (
            <circle
              cx="50" cy="50" r="42" fill="none"
              stroke="currentColor"
              className={getWaitTimeColor(minutes)}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${pct * 2.64} 264`}
            />
          )}
        </svg>
        <div className="text-center z-10">
          <p className={`text-2xl font-bold ${getWaitTimeColor(minutes)}`}>
            {formatMinutes(minutes).replace(" min", "")}
          </p>
          <p className="text-xs text-muted-foreground">min</p>
        </div>
      </div>
      <Badge variant="secondary">{getWaitTimeLabel(minutes)}</Badge>
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
    <div className="space-y-5">
      <div className="space-y-3">
        <Label className="text-sm font-medium">Wait Time: {waitMinutes} minutes</Label>
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
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>0 min</span>
          <span>30 min</span>
          <span>60 min</span>
          <span>90 min</span>
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
            <SelectItem value="standard">Standard</SelectItem>
            <SelectItem value="tsa_precheck">TSA PreCheck</SelectItem>
            <SelectItem value="clear">CLEAR</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Terminal (optional)</Label>
          <Input
            data-testid="input-terminal"
            placeholder="e.g., Terminal 1"
            value={terminal}
            onChange={(e) => setTerminal(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium">Checkpoint (optional)</Label>
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

function ReportCard({ report }: { report: WaitTimeReport }) {
  const lineTypeLabels: Record<string, { label: string; icon: typeof Shield }> = {
    standard: { label: "Standard", icon: Users },
    tsa_precheck: { label: "PreCheck", icon: Shield },
    clear: { label: "CLEAR", icon: Zap },
  };
  const lt = lineTypeLabels[report.lineType] || lineTypeLabels.standard;
  const Icon = lt.icon;

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`flex items-center justify-center w-10 h-10 rounded-md ${getWaitTimeBg(report.waitMinutes)}`}>
            <span className={`text-sm font-bold ${getWaitTimeColor(report.waitMinutes)}`}>
              {report.waitMinutes}
            </span>
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm font-medium">{lt.label}</span>
              {report.terminal && (
                <Badge variant="outline" className="text-xs">{report.terminal}</Badge>
              )}
              {report.checkpoint && (
                <Badge variant="outline" className="text-xs">{report.checkpoint}</Badge>
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
  );
}

function AirportDetailSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <Skeleton className="h-8 w-48" />
      <Card className="p-6">
        <div className="flex items-center gap-6">
          <Skeleton className="w-28 h-28 rounded-full" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </Card>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="p-3">
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-md" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          </Card>
        ))}
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
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
        <Plane className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Airport not found</h2>
        <p className="text-muted-foreground mb-4">We couldn't find an airport with code "{code}"</p>
        <Button onClick={() => setLocation("/")} data-testid="button-back-home">Go Back</Button>
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
    <div className="min-h-screen bg-background">
      <div className="bg-gradient-to-r from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/5 border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
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

          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h1 className="text-2xl font-bold" data-testid="text-airport-code">{airport.code}</h1>
                <Badge variant="secondary">{airport.city}, {airport.state}</Badge>
              </div>
              <p className="text-muted-foreground" data-testid="text-airport-name">{airport.name}</p>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-report-wait">
                  <Plus className="h-4 w-4 mr-1" />
                  Report Wait
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Report Wait Time at {airport.code}</DialogTitle>
                </DialogHeader>
                <ReportForm airportId={airport.id} airportCode={airport.code} onSuccess={() => setDialogOpen(false)} />
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <Card className="p-6">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <WaitTimeGauge minutes={airport.avgWaitMinutes} />
            <div className="flex-1 w-full">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Average by Line Type</h3>
              <div className="space-y-3">
                {lineTypeStats && Object.entries(lineTypeStats).map(([type, stats]) => {
                  const avg = Math.round(stats.total / stats.count);
                  const labels: Record<string, string> = {
                    standard: "Standard",
                    tsa_precheck: "TSA PreCheck",
                    clear: "CLEAR",
                  };
                  return (
                    <div key={type} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm">{labels[type] || type}</span>
                        <span className="text-xs text-muted-foreground">({stats.count})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${getWaitTimeBg(avg).replace("bg-", "bg-")}`}
                            style={{ width: `${Math.min((avg / 60) * 100, 100)}%`, backgroundColor: avg <= 10 ? '#22c55e' : avg <= 20 ? '#f59e0b' : avg <= 35 ? '#f97316' : '#ef4444' }}
                          />
                        </div>
                        <span className={`text-sm font-semibold min-w-[3rem] text-right ${getWaitTimeColor(avg)}`}>
                          {avg} min
                        </span>
                      </div>
                    </div>
                  );
                })}
                {(!lineTypeStats || Object.keys(lineTypeStats).length === 0) && (
                  <p className="text-sm text-muted-foreground">No reports yet. Be the first to report!</p>
                )}
              </div>
            </div>
          </div>
        </Card>

        <div>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-lg font-semibold">Recent Reports</h2>
            <span className="text-sm text-muted-foreground">
              {airport.reportCount} total
            </span>
          </div>

          {reportsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="p-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-10 h-10 rounded-md" />
                    <div className="space-y-1.5 flex-1">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : reports && reports.length > 0 ? (
            <div className="space-y-2">
              {reports.map((report) => (
                <ReportCard key={report.id} report={report} />
              ))}
            </div>
          ) : (
            <Card className="p-8 text-center">
              <TrendingUp className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium mb-1">No reports yet</p>
              <p className="text-sm text-muted-foreground mb-3">
                Help other travelers by sharing your experience
              </p>
              <Button onClick={() => setDialogOpen(true)} data-testid="button-first-report">
                <Plus className="h-4 w-4 mr-1" />
                Be the First to Report
              </Button>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
