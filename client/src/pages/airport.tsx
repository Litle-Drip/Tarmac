import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowLeft, Clock, Users, Plus, Plane, TrendingUp, Shield, Zap, ShieldCheck,
  MapPin, BarChart3, Signal, Sun, Moon, RefreshCw, Loader2, ThumbsUp, ThumbsDown, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/components/theme-provider";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  MAX_REPORTABLE_WAIT, LINE_TYPES, REPORT_COOLDOWN_MINUTES,
  type AirportWithStats, type WaitTimeReportWithVotes, type CheckpointStats,
  type LineType, type WaitEstimate, type CreateReportResult,
} from "@shared/schema";
import { useIsMobile } from "@/hooks/use-mobile";
import { DeparturePlanner } from "@/components/departure-planner";
import { ForecastStrip } from "@/components/forecast-strip";
import {
  getPreferredLineType, setPreferredLineType, getVotedReports, rememberVote,
  rememberReport, cooldownRemaining,
} from "@/lib/device";
import {
  getWaitTimeColor, getWaitTimeBg, getWaitTimeLabel, timeAgo, getWaitTimeHex,
  getWaitTimeDot, getDataSourceLabel, getDataSourceStyle, getDataSourceExplanation,
  getFreshnessInfo, formatRange, getConfidenceLabel, getConfidenceStyle,
  LINE_TYPE_LABELS, LINE_TYPE_SHORT_LABELS, LINE_TYPE_DESCRIPTIONS,
} from "@/lib/utils";

const LINE_ICONS: Record<LineType, typeof Shield> = {
  standard: Users,
  tsa_precheck: Shield,
  clear: Zap,
};

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

/**
 * Which line the traveller is actually standing in. This is the single most
 * important input to an accurate number — PreCheck and standard at the same
 * airport routinely differ by 20 minutes — so it sits above the gauge rather
 * than buried in the report form, and the choice is remembered.
 */
function LineTypePicker({
  value, onChange, estimates,
}: {
  value: LineType;
  onChange: (line: LineType) => void;
  estimates?: (WaitEstimate & { lineType: LineType })[];
}) {
  return (
    <div role="tablist" aria-label="Security line type" className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-muted">
      {LINE_TYPES.map((line) => {
        const Icon = LINE_ICONS[line];
        const estimate = estimates?.find((e) => e.lineType === line);
        const selected = value === line;

        return (
          <button
            key={line}
            role="tab"
            type="button"
            aria-selected={selected}
            onClick={() => onChange(line)}
            data-testid={`tab-line-${line}`}
            className={`flex flex-col items-center gap-0.5 rounded-md px-2 py-2 text-xs font-medium transition-colors ${
              selected
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5" />
              {LINE_TYPE_SHORT_LABELS[line]}
            </span>
            {estimate && (
              <span className={`text-[11px] font-bold ${getWaitTimeColor(estimate.waitMinutes)}`}>
                {estimate.waitMinutes} min
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function AnimatedGauge({ estimate, lineType }: { estimate: WaitEstimate; lineType: LineType }) {
  const minutes = estimate.waitMinutes;
  const pct = Math.min((minutes / 60) * 100, 100);
  const circumference = 2 * Math.PI * 44;
  const strokeDashoffset = circumference - (pct / 100) * circumference;
  const color = getWaitTimeHex(minutes);
  const SourceIcon =
    estimate.dataSource === "community" ? Users : estimate.dataSource === "estimated" ? BarChart3 : Signal;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative flex items-center justify-center w-32 h-32 sm:w-36 sm:h-36">
        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="44" fill="none" stroke="hsl(var(--border))" strokeWidth="5" opacity="0.5" />
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
        </svg>
        <div className={`absolute inset-4 rounded-full ${getWaitTimeBg(minutes)} flex items-center justify-center`}>
          <div
            className="text-center"
            role="status"
            aria-label={`${LINE_TYPE_LABELS[lineType]} wait, about ${minutes} minutes, likely between ${estimate.low} and ${estimate.high}`}
          >
            <motion.p
              className={`text-2xl sm:text-3xl font-bold ${getWaitTimeColor(minutes)}`}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.3 }}
              data-testid="text-wait-minutes"
            >
              {minutes}
            </motion.p>
            <p className="text-xs text-muted-foreground font-medium">min</p>
          </div>
        </div>
      </div>

      {/* A single number implies a precision we don't have. The range is the
          honest answer, and it's what someone planning a departure needs. */}
      <p className="text-sm font-medium text-muted-foreground" data-testid="text-wait-range">
        Likely {formatRange(estimate)}
      </p>

      <div className="flex items-center gap-2 flex-wrap justify-center">
        <Badge variant="secondary" className="text-xs font-semibold uppercase tracking-wider">
          {getWaitTimeLabel(minutes)}
        </Badge>
        <Badge
          variant="outline"
          className={`text-[10px] font-medium ${getDataSourceStyle(estimate.dataSource)}`}
          data-testid={`badge-detail-source-${estimate.dataSource}`}
        >
          <SourceIcon className="h-2.5 w-2.5 mr-1" aria-hidden="true" />
          {getDataSourceLabel(estimate.dataSource)}
        </Badge>
        <Badge variant="outline" className={`text-[10px] font-medium ${getConfidenceStyle(estimate.confidence)}`}>
          {getConfidenceLabel(estimate.confidence)}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground text-center max-w-xs leading-relaxed" data-testid="text-source-explanation">
        {getDataSourceExplanation(estimate.dataSource, estimate.sampleCount)}
      </p>
    </div>
  );
}

/** Common waits, so most reports are one tap rather than a drag. */
const QUICK_WAITS = [5, 10, 15, 20, 30, 45, 60];

/**
 * How long ago they cleared the checkpoint.
 *
 * People report from the gate, not from the line, so without asking this we
 * stamp every report as happening now when it describes conditions from
 * fifteen or thirty minutes earlier.
 */
const WHEN_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 0, label: "Just now" },
  { minutes: 15, label: "15 min ago" },
  { minutes: 30, label: "30 min ago" },
  { minutes: 60, label: "An hour ago" },
];

function ChipGroup({
  label, children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {children}
    </div>
  );
}

function Chip({
  selected, onClick, children, testId,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      data-testid={testId}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function ReportForm({
  airportId, airportCode, defaultLineType, onSuccess,
}: {
  airportId: string;
  airportCode: string;
  defaultLineType: LineType;
  onSuccess: () => void;
}) {
  // Deliberately not seeded from our own estimate. Pre-filling the number we
  // already believe would make it self-confirming — people accept a plausible
  // default, and our guess would quietly become "community data".
  const [waitMinutes, setWaitMinutes] = useState(15);
  const [observedMinutesAgo, setObservedMinutesAgo] = useState(0);
  const [lineType, setLineType] = useState<LineType>(defaultLineType);
  const [terminal, setTerminal] = useState("");
  const [checkpoint, setCheckpoint] = useState("");
  const { toast } = useToast();

  // Names other travellers have already used here. This is how the checkpoint
  // vocabulary converges on the real signage without us guessing at it.
  const { data: labels } = useQuery<{ terminals: string[]; checkpoints: string[] }>({
    queryKey: ["/api/airports", airportCode, "labels"],
  });

  const mutation = useMutation({
    mutationFn: async (): Promise<CreateReportResult> => {
      const res = await apiRequest("POST", "/api/reports", {
        airportId,
        waitMinutes,
        lineType,
        observedMinutesAgo,
        terminal: terminal.trim() || null,
        checkpoint: checkpoint.trim() || null,
      });
      return res.json();
    },
    onSuccess: (result) => {
      setPreferredLineType(lineType);
      rememberReport(airportCode);
      queryClient.invalidateQueries({ queryKey: ["/api/airports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports", airportCode] });
      queryClient.invalidateQueries({ queryKey: ["/api/checkpoints", airportCode] });

      // Show the contribution landing. "Thanks!" tells someone nothing about
      // whether their report mattered.
      toast({
        title: "Thanks — that's live",
        description: `${airportCode} ${LINE_TYPE_SHORT_LABELS[result.lineType]} now reads ${result.wait.waitMinutes} min.`,
      });
      onSuccess();
    },
    onError: (error: Error) => {
      toast({ title: "Couldn't submit", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="wait-slider" className="text-sm font-medium">How long was the wait?</Label>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${getWaitTimeDot(waitMinutes)}`} aria-hidden="true" />
            <span className={`text-sm font-bold ${getWaitTimeColor(waitMinutes)}`}>{waitMinutes} min</span>
          </div>
        </div>

        <ChipGroup label="Common wait times">
          {QUICK_WAITS.map((minutes) => (
            <Chip
              key={minutes}
              selected={waitMinutes === minutes}
              onClick={() => setWaitMinutes(minutes)}
              testId={`chip-wait-${minutes}`}
            >
              {minutes}
            </Chip>
          ))}
        </ChipGroup>

        <div className="px-1 pt-1">
          <Slider
            id="wait-slider"
            data-testid="slider-wait-time"
            aria-label="Wait time in minutes"
            value={[waitMinutes]}
            onValueChange={(v) => setWaitMinutes(v[0])}
            min={0}
            max={MAX_REPORTABLE_WAIT}
            step={5}
          />
        </div>
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium">When did you get through?</span>
        <ChipGroup label="When you cleared security">
          {WHEN_OPTIONS.map((option) => (
            <Chip
              key={option.minutes}
              selected={observedMinutesAgo === option.minutes}
              onClick={() => setObservedMinutesAgo(option.minutes)}
              testId={`chip-when-${option.minutes}`}
            >
              {option.label}
            </Chip>
          ))}
        </ChipGroup>
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium">Which line?</span>
        <LineTypePicker value={lineType} onChange={setLineType} />
        <p className="text-xs text-muted-foreground">{LINE_TYPE_DESCRIPTIONS[lineType]}</p>
      </div>

      <div className="space-y-3">
        {labels && labels.checkpoints.length > 0 && (
          <div className="space-y-2">
            <span className="text-sm font-medium">
              Checkpoint <span className="text-muted-foreground font-normal">(optional)</span>
            </span>
            <ChipGroup label="Checkpoints reported here">
              {labels.checkpoints.slice(0, 8).map((name) => (
                <Chip
                  key={name}
                  selected={checkpoint === name}
                  onClick={() => setCheckpoint(checkpoint === name ? "" : name)}
                  testId={`chip-checkpoint-${name}`}
                >
                  {name}
                </Chip>
              ))}
            </ChipGroup>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="terminal-input" className="text-sm font-medium">
              Terminal <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="terminal-input"
              list="known-terminals"
              data-testid="input-terminal"
              placeholder="e.g., Terminal 1"
              value={terminal}
              onChange={(e) => setTerminal(e.target.value)}
              className="h-11"
              maxLength={60}
            />
            <datalist id="known-terminals">
              {labels?.terminals.map((name) => <option key={name} value={name} />)}
            </datalist>
          </div>
          <div className="space-y-2">
            <Label htmlFor="checkpoint-input" className="text-sm font-medium">
              {labels && labels.checkpoints.length > 0 ? "Or type one" : "Checkpoint"}{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="checkpoint-input"
              list="known-checkpoints"
              data-testid="input-checkpoint"
              placeholder="e.g., North"
              value={checkpoint}
              onChange={(e) => setCheckpoint(e.target.value)}
              className="h-11"
              maxLength={60}
            />
            <datalist id="known-checkpoints">
              {labels?.checkpoints.map((name) => <option key={name} value={name} />)}
            </datalist>
          </div>
        </div>
      </div>

      <Button
        data-testid="button-submit-report"
        className="w-full h-12 text-base"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
      >
        {mutation.isPending ? "Submitting…" : "Submit report"}
      </Button>
    </div>
  );
}

function ReportFormContainer({
  open, onOpenChange, airport, defaultLineType,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  airport: AirportWithStats;
  defaultLineType: LineType;
}) {
  const isMobile = useIsMobile();

  const form = (
    <ReportForm
      airportId={airport.id}
      airportCode={airport.code}
      defaultLineType={defaultLineType}
      onSuccess={() => onOpenChange(false)}
    />
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Report wait time at {airport.code}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-8">{form}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report wait time at {airport.code}</DialogTitle>
        </DialogHeader>
        {form}
      </DialogContent>
    </Dialog>
  );
}

/**
 * "Somebody said 22 minutes eight minutes ago — still about right?"
 *
 * Confirming is by far the cheapest useful thing anyone can do: one tap while
 * already holding a boarding pass, versus a form. It belongs next to the
 * number it corrects, not four sections down the page under the planner.
 */
function ConfirmPrompt({
  report, airportCode,
}: {
  report: WaitTimeReportWithVotes;
  airportCode: string;
}) {
  const { toast } = useToast();
  const [vote, setVote] = useState<boolean | undefined>(() => getVotedReports()[report.id]);

  const mutation = useMutation({
    mutationFn: async (agrees: boolean) => {
      await apiRequest("POST", `/api/reports/${report.id}/confirm`, { agrees });
      return agrees;
    },
    onSuccess: (agrees) => {
      setVote(agrees);
      rememberVote(report.id, agrees);
      queryClient.invalidateQueries({ queryKey: ["/api/airports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports", airportCode] });
      queryClient.invalidateQueries({ queryKey: ["/api/checkpoints", airportCode] });
      toast({
        title: agrees ? "Thanks — that counts as a fresh report" : "Thanks — we've marked it as off",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Couldn't record that", description: error.message, variant: "destructive" });
    },
  });

  if (vote !== undefined) return null;

  return (
    <div
      className="flex items-center justify-between gap-3 flex-wrap rounded-lg border bg-muted/40 px-4 py-3"
      data-testid="confirm-prompt"
    >
      <p className="text-sm min-w-0">
        <span className="font-semibold">{report.waitMinutes} min</span>
        <span className="text-muted-foreground">
          {" "}for {LINE_TYPE_SHORT_LABELS[report.lineType as LineType] ?? "Standard"}
          {report.checkpoint ? ` at ${report.checkpoint}` : ""}, {timeAgo(report.observedAt).toLowerCase()}.
          Still about right?
        </span>
      </p>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate(true)}
          data-testid="button-confirm-yes"
        >
          <ThumbsUp className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
          Yes
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate(false)}
          data-testid="button-confirm-no"
        >
          <ThumbsDown className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
          Way off
        </Button>
      </div>
    </div>
  );
}

function LineTypeCard({ estimate }: { estimate: WaitEstimate & { lineType: LineType } }) {
  const Icon = LINE_ICONS[estimate.lineType];
  const barWidth = Math.min((estimate.waitMinutes / 60) * 100, 100);

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="flex items-center gap-3"
    >
      <div className={`flex-shrink-0 p-2 rounded-md ${getWaitTimeBg(estimate.waitMinutes)}`}>
        <Icon className={`h-4 w-4 ${getWaitTimeColor(estimate.waitMinutes)}`} aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium">{LINE_TYPE_LABELS[estimate.lineType]}</span>
            <span className="text-xs text-muted-foreground">
              {estimate.sampleCount > 0 ? `(${estimate.sampleCount})` : "(est.)"}
            </span>
          </div>
          <span className={`text-sm font-bold ${getWaitTimeColor(estimate.waitMinutes)}`}>
            {estimate.waitMinutes} min
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: getWaitTimeHex(estimate.waitMinutes) }}
            initial={{ width: 0 }}
            animate={{ width: `${barWidth}%` }}
            transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
          />
        </div>
      </div>
    </motion.div>
  );
}

/**
 * A report plus the one-tap confirmation.
 *
 * Confirming is the cheapest useful contribution anyone can make — it takes a
 * second while already standing in the line, and an agreement counts as a
 * fresh observation of that wait.
 */
function ReportCard({
  report, index, airportCode,
}: {
  report: WaitTimeReportWithVotes;
  index: number;
  airportCode: string;
}) {
  const Icon = LINE_ICONS[report.lineType as LineType] ?? Users;
  const { toast } = useToast();
  const [vote, setVote] = useState<boolean | undefined>(() => getVotedReports()[report.id]);

  const mutation = useMutation({
    mutationFn: async (agrees: boolean) => {
      await apiRequest("POST", `/api/reports/${report.id}/confirm`, { agrees });
      return agrees;
    },
    onSuccess: (agrees) => {
      setVote(agrees);
      rememberVote(report.id, agrees);
      queryClient.invalidateQueries({ queryKey: ["/api/airports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports", airportCode] });
      queryClient.invalidateQueries({ queryKey: ["/api/checkpoints", airportCode] });
    },
    onError: (error: Error) => {
      toast({ title: "Couldn't record that", description: error.message, variant: "destructive" });
    },
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.05, 0.3) }}
    >
      <Card className="p-3 sm:p-3.5">
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className={`relative flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-md flex-shrink-0 ${getWaitTimeBg(report.waitMinutes)}`}>
              <span className={`text-sm font-bold ${getWaitTimeColor(report.waitMinutes)}`}>
                {report.waitMinutes}
              </span>
              <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ${getWaitTimeDot(report.waitMinutes)} ring-2 ring-card`} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" aria-hidden="true" />
                <span className="text-sm font-medium">
                  {LINE_TYPE_SHORT_LABELS[report.lineType as LineType] ?? "Standard"}
                </span>
                {report.terminal && <Badge variant="outline" className="text-[10px]">{report.terminal}</Badge>}
                {report.checkpoint && <Badge variant="outline" className="text-[10px]">{report.checkpoint}</Badge>}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {report.waitMinutes} min wait · {timeAgo(report.observedAt)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {vote === undefined ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  aria-label="Still about right"
                  title="Still about right"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate(true)}
                  data-testid={`button-agree-${report.id}`}
                >
                  <ThumbsUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  aria-label="Way off"
                  title="Way off"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate(false)}
                  data-testid={`button-disagree-${report.id}`}
                >
                  <ThumbsDown className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground px-2" data-testid={`text-voted-${report.id}`}>
                {vote ? "Confirmed" : "Flagged"}
              </span>
            )}
            {report.agreeCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground" title={`${report.agreeCount} confirmed`}>
                <ThumbsUp className="h-3 w-3" aria-hidden="true" />
                {report.agreeCount}
              </span>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function CheckpointCard({ checkpoint, index }: { checkpoint: CheckpointStats; index: number }) {
  const freshness = getFreshnessInfo(checkpoint.wait.newestObservationAt);
  const barWidth = Math.min((checkpoint.wait.waitMinutes / 60) * 100, 100);
  const Icon = LINE_ICONS[checkpoint.lineType] ?? Users;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.08, 0.3) }}
      className="flex items-center gap-3"
    >
      <div className={`flex-shrink-0 flex flex-col items-center justify-center w-11 h-11 rounded-md ${getWaitTimeBg(checkpoint.wait.waitMinutes)}`}>
        <span className={`text-sm font-bold ${getWaitTimeColor(checkpoint.wait.waitMinutes)}`}>
          {checkpoint.wait.waitMinutes}
        </span>
        <span className={`text-[8px] font-medium ${getWaitTimeColor(checkpoint.wait.waitMinutes)}`}>min</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className="text-sm font-medium" data-testid={`text-checkpoint-name-${index}`}>
              {checkpoint.checkpoint}
            </span>
            {checkpoint.terminal && (
              <Badge variant="outline" className="text-[10px]">{checkpoint.terminal}</Badge>
            )}
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Icon className="h-2.5 w-2.5" aria-hidden="true" />
              {LINE_TYPE_SHORT_LABELS[checkpoint.lineType]}
            </span>
          </div>
          <div className={`flex items-center gap-1 text-[10px] font-medium flex-shrink-0 ${freshness.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${freshness.dotColor}`} aria-hidden="true" />
            <span>{freshness.label}</span>
          </div>
        </div>
        <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: getWaitTimeHex(checkpoint.wait.waitMinutes) }}
            initial={{ width: 0 }}
            animate={{ width: `${barWidth}%` }}
            transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
          />
        </div>
      </div>
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
            <Skeleton className="h-9 w-32 rounded-md hidden sm:block" />
          </div>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <Card className="p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <Skeleton className="w-32 h-32 sm:w-36 sm:h-36 rounded-full" />
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
  const [formOpen, setFormOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const [lineType, setLineType] = useState<LineType>(() => getPreferredLineType());
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);

  useEffect(() => {
    setPreferredLineType(lineType);
  }, [lineType]);

  const { data: airport, isLoading: airportLoading } = useQuery<AirportWithStats>({
    queryKey: ["/api/airports", code, { line: lineType }],
    refetchInterval: 30000,
  });

  const { data: reports, isLoading: reportsLoading } = useQuery<WaitTimeReportWithVotes[]>({
    queryKey: ["/api/reports", code],
    refetchInterval: 30000,
    enabled: !!airport,
  });

  const { data: checkpointStats } = useQuery<CheckpointStats[]>({
    queryKey: ["/api/checkpoints", code],
    refetchInterval: 30000,
    enabled: !!airport,
  });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/airports"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/reports", code] }),
        queryClient.invalidateQueries({ queryKey: ["/api/checkpoints", code] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [code]);

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

  if (airportLoading) return <AirportDetailSkeleton />;

  if (!airport) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center px-4">
          <Plane className="h-14 w-14 text-muted-foreground/30 mx-auto mb-5" aria-hidden="true" />
          <h2 className="text-xl font-bold mb-2">Airport not found</h2>
          <p className="text-muted-foreground mb-5">We couldn't find an airport with code "{code}"</p>
          <Button onClick={() => setLocation("/")} className="h-12 px-6" data-testid="button-back-home">
            Go back home
          </Button>
        </motion.div>
      </div>
    );
  }

  const freshness = getFreshnessInfo(airport.latestReport);

  // The freshest report for the line being viewed — the one most worth
  // confirming, and the one a traveller can actually check against.
  const topReport = reports?.find((report) => report.lineType === lineType);
  const cooldown = cooldownRemaining(airport.code, REPORT_COOLDOWN_MINUTES);

  return (
    <div
      className="min-h-screen bg-background flex flex-col"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <PullToRefreshIndicator pullDistance={pullDistance} refreshing={refreshing} />

      <div className="bg-gradient-to-r from-primary/5 via-primary/8 to-primary/5 dark:from-primary/10 dark:via-primary/5 dark:to-primary/10 border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }} className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/")} className="mb-2 sm:mb-3 -ml-2 h-10" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-1" aria-hidden="true" />
              All airports
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="h-10 w-10 mb-2 sm:mb-3"
              aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
              data-testid="button-theme-toggle-detail"
            >
              {theme === "light" ? <Moon className="h-4.5 w-4.5" /> : <Sun className="h-4.5 w-4.5" />}
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="flex items-start justify-between gap-3 sm:gap-4 flex-wrap"
          >
            <div>
              <div className="flex items-center gap-2 sm:gap-2.5 mb-1.5 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-bold" data-testid="text-airport-code">{airport.code}</h1>
                <Badge variant="secondary" className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" aria-hidden="true" />
                  {airport.city}, {airport.state}
                </Badge>
              </div>
              <p className="text-muted-foreground text-sm" data-testid="text-airport-name">{airport.name}</p>
              <div className={`flex items-center gap-1.5 mt-2 text-xs font-medium ${freshness.color}`} data-testid="text-detail-freshness">
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${freshness.dotColor} ${freshness.level === "fresh" ? "animate-pulse" : ""}`}
                  aria-hidden="true"
                />
                <Clock className="h-3 w-3" aria-hidden="true" />
                <span>
                  {airport.reportCount > 0
                    ? `Last report ${freshness.label.toLowerCase()}`
                    : "No reports in the last 6 hours"}
                </span>
              </div>
            </div>

            <Button
              className="hidden sm:flex"
              onClick={() => setFormOpen(true)}
              disabled={cooldown > 0}
              title={cooldown > 0 ? `You reported recently — ${cooldown} min to go` : undefined}
              data-testid="button-report-wait"
            >
              <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
              {cooldown > 0 ? `Reported — ${cooldown}m` : "Report wait time"}
            </Button>
          </motion.div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 space-y-5 sm:space-y-6 w-full flex-1 pb-24 sm:pb-6">
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }}>
          <Card className="p-5 sm:p-6 space-y-5">
            <LineTypePicker value={lineType} onChange={setLineType} estimates={airport.byLineType} />

            <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
              <AnimatedGauge estimate={airport.wait} lineType={lineType} />
              <div className="flex-1 w-full">
                <h2 className="text-sm font-semibold text-muted-foreground mb-3 sm:mb-4 uppercase tracking-wider">
                  All lines
                </h2>
                <div className="space-y-3 sm:space-y-4">
                  {airport.byLineType.map((estimate) => (
                    <LineTypeCard key={estimate.lineType} estimate={estimate} />
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </motion.div>

        {topReport && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.22 }}>
            <ConfirmPrompt report={topReport} airportCode={airport.code} />
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.24 }}>
          <DeparturePlanner airport={airport} lineType={lineType} />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.28 }}>
          <ForecastStrip code={airport.code} lineType={lineType} />
        </motion.div>

        {checkpointStats && checkpointStats.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.3 }}>
            <Card className="p-4 sm:p-5" data-testid="card-checkpoint-breakdown">
              <div className="flex items-center gap-2 mb-3 sm:mb-4">
                <Shield className="h-4 w-4 text-primary" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">By checkpoint</h2>
              </div>
              <div className="space-y-3 sm:space-y-4">
                {checkpointStats.map((cp, i) => (
                  <CheckpointCard key={`${cp.terminal ?? ""}-${cp.checkpoint}-${cp.lineType}`} checkpoint={cp} index={i} />
                ))}
              </div>
            </Card>
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.35 }}>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-lg font-bold">Recent reports</h2>
            <span className="text-sm text-muted-foreground">Last 6 hours</span>
          </div>

          {reports && reports.length > 0 && (
            <p className="text-xs text-muted-foreground mb-3 flex items-start gap-1.5">
              <Info className="h-3.5 w-3.5 flex-shrink-0 mt-px" aria-hidden="true" />
              Standing in one of these lines? Tap 👍 or 👎 on the closest match — it counts as a fresh report and takes a second.
            </p>
          )}

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
            <div className="space-y-2 sm:space-y-2.5">
              {reports.map((report, i) => (
                <ReportCard key={report.id} report={report} index={i} airportCode={airport.code} />
              ))}
            </div>
          ) : (
            <Card className="p-8 sm:p-10 text-center">
              <TrendingUp className="h-10 w-10 text-muted-foreground/30 mx-auto mb-4" aria-hidden="true" />
              <p className="font-semibold mb-1">No reports in the last 6 hours</p>
              <p className="text-sm text-muted-foreground mb-4">
                The number above is an estimate until someone reports from the airport.
              </p>
              <Button onClick={() => setFormOpen(true)} className="h-12 px-6" data-testid="button-first-report">
                <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Be the first to report
              </Button>
            </Card>
          )}
        </motion.div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 sm:hidden z-40 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" data-testid="sticky-report-button">
        <Button
          className="w-full h-14 text-base shadow-lg rounded-xl"
          onClick={() => setFormOpen(true)}
          disabled={cooldown > 0}
          data-testid="button-report-wait-sticky"
        >
          <Plus className="h-5 w-5 mr-2" aria-hidden="true" />
          {cooldown > 0
            ? `Thanks — you can report again in ${cooldown} min`
            : "Report wait time"}
        </Button>
      </div>

      <ReportFormContainer open={formOpen} onOpenChange={setFormOpen} airport={airport} defaultLineType={lineType} />

      <footer className="border-t py-6 mt-auto hidden sm:block">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground/50" aria-hidden="true" />
            <span className="text-xs text-muted-foreground">Tarmac</span>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted-foreground">
              Wait times are crowdsourced and may not reflect actual conditions.
            </p>
            <Link href="/privacy" className="text-xs text-muted-foreground underline">
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
