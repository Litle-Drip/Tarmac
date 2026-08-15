import { eq, desc, sql, and, gte, lt, inArray } from "drizzle-orm";
import { db } from "./db.js";
import {
  airports,
  waitTimeReports,
  reportConfirmations,
  LINE_TYPES,
  REPORT_RETENTION_DAYS,
  type InsertAirport,
  type Airport,
  type InsertWaitTimeReport,
  type WaitTimeReport,
  type WaitTimeReportWithVotes,
  type AirportWithStats,
  type CheckpointStats,
  type CreateReportResult,
  type LineType,
  type LineTypeEstimate,
  type AirportForecast,
  type DeparturePlan,
  type PlanQuery,
} from "../shared/schema.js";
import {
  estimateWait,
  isPlausible,
  WINDOWS_MINUTES,
  type Observation,
} from "./wait-model.js";
import {
  forecastWait,
  currentDelta,
  planDeparture,
  type WaitForecast,
} from "./forecast.js";
import { localClock } from "./local-time.js";
import { loadBaselineLookup, type BaselineLookup } from "./baselines.js";
import { normalizeLabel, pickDisplayLabel, cleanRawLabel } from "./normalize.js";
import { REPORT_COOLDOWN_MINUTES, REPORTS_PER_DEVICE_PER_HOUR } from "./identity.js";

/** The widest window the model will look at. Nothing older is ever fetched. */
const MAX_WINDOW_MINUTES = WINDOWS_MINUTES[WINDOWS_MINUTES.length - 1];

/**
 * A confirmation is worth less than a typed report: agreeing that a number
 * looks right is easier than judging one from scratch.
 */
const CONFIRMATION_TRUST = 0.6;

/** Each disagreement halves what the original report counts for. */
const DISAGREEMENT_DECAY = 0.5;
const MIN_TRUST = 0.1;

export type RateLimitReason = "cooldown" | "hourly_cap";

export class RateLimitError extends Error {
  constructor(
    public readonly reason: RateLimitReason,
    public readonly retryAfterMinutes: number,
  ) {
    super(
      reason === "cooldown"
        ? `You just reported this airport. You can report it again in about ${retryAfterMinutes} minutes.`
        : "You've submitted a lot of reports in the last hour. Try again shortly.",
    );
    this.name = "RateLimitError";
  }
}

function windowStart(now: Date, minutes: number): Date {
  return new Date(now.getTime() - minutes * 60_000);
}

type RawReport = {
  id: string;
  airportId: string;
  waitMinutes: number;
  lineType: string;
  terminal: string | null;
  checkpoint: string | null;
  terminalKey: string | null;
  checkpointKey: string | null;
  reportedAt: Date;
  observedAt: Date;
};

type RawConfirmation = {
  reportId: string;
  agrees: boolean;
  createdAt: Date;
};

/**
 * Turn stored rows into the observation list the model consumes.
 *
 * Agreements become fresh observations of the same wait at the moment they
 * were tapped — which is exactly what an agreement is, and is what lets a busy
 * checkpoint stay current without anyone filling in a form. Disagreements pull
 * down the trust of the report they landed on.
 */
function toObservations(
  reports: RawReport[],
  confirmations: RawConfirmation[],
): Observation[] {
  const byReport = new Map<string, RawConfirmation[]>();
  for (const confirmation of confirmations) {
    const list = byReport.get(confirmation.reportId);
    if (list) list.push(confirmation);
    else byReport.set(confirmation.reportId, [confirmation]);
  }

  const observations: Observation[] = [];

  for (const report of reports) {
    const votes = byReport.get(report.id) ?? [];
    const disagreements = votes.filter((v) => !v.agrees).length;
    const trust = Math.max(
      MIN_TRUST,
      Math.pow(DISAGREEMENT_DECAY, disagreements),
    );

    observations.push({
      waitMinutes: report.waitMinutes,
      // When they went through, not when they told us.
      at: report.observedAt,
      trust,
    });

    for (const vote of votes) {
      if (!vote.agrees) continue;
      observations.push({
        waitMinutes: report.waitMinutes,
        at: vote.createdAt,
        trust: CONFIRMATION_TRUST * trust,
      });
    }
  }

  return observations;
}

function groupByLineType(
  reports: RawReport[],
  confirmations: RawConfirmation[],
): Map<LineType, Observation[]> {
  const grouped = new Map<LineType, Observation[]>();

  for (const lineType of LINE_TYPES) {
    const forLine = reports.filter((r) => r.lineType === lineType);
    grouped.set(lineType, toObservations(forLine, confirmations));
  }

  return grouped;
}

function buildStats(
  airport: Airport,
  reports: RawReport[],
  confirmations: RawConfirmation[],
  baseline: BaselineLookup,
  now: Date,
  requestedLine: LineType,
): AirportWithStats {
  const grouped = groupByLineType(reports, confirmations);

  const byLineType: LineTypeEstimate[] = LINE_TYPES.map((lineType) => ({
    lineType,
    ...estimateWait(
      grouped.get(lineType) ?? [],
      baseline(airport, lineType, now),
      now,
    ),
  }));

  const wait =
    byLineType.find((estimate) => estimate.lineType === requestedLine) ??
    byLineType[0];

  // "Last report" means the freshest condition we know about, which is when
  // somebody was last in the line — not when a form was last submitted.
  const latest = reports.reduce<Date | null>(
    (newest, report) =>
      newest === null || report.observedAt > newest ? report.observedAt : newest,
    null,
  );

  return {
    ...airport,
    wait,
    byLineType,
    reportCount: reports.length,
    latestReport: latest ? latest.toISOString() : null,
  };
}

export interface IStorage {
  getAirports(lineType: LineType, now?: Date): Promise<AirportWithStats[]>;
  getAirportByCode(
    code: string,
    lineType: LineType,
    now?: Date,
  ): Promise<AirportWithStats | undefined>;
  createAirport(airport: InsertAirport): Promise<Airport>;
  getReportsByAirportCode(code: string): Promise<WaitTimeReportWithVotes[]>;
  getCheckpointStats(code: string, now?: Date): Promise<CheckpointStats[]>;
  createReport(
    report: InsertWaitTimeReport,
    ipHash: string | null,
  ): Promise<CreateReportResult>;
  confirmReport(
    reportId: string,
    deviceId: string,
    ipHash: string | null,
    agrees: boolean,
  ): Promise<void>;
  getKnownLabels(code: string): Promise<{ terminals: string[]; checkpoints: string[] }>;
  getAirportCount(): Promise<number>;
  purgeExpiredReports(now?: Date): Promise<number>;
  getForecast(
    code: string,
    lineType: LineType,
    hours: number,
    now?: Date,
  ): Promise<AirportForecast | undefined>;
  getPlan(
    code: string,
    query: PlanQuery,
    now?: Date,
  ): Promise<(DeparturePlan & { timezone: string }) | undefined>;
}

export class DatabaseStorage implements IStorage {
  private async recentReports(
    now: Date,
    airportIds?: string[],
  ): Promise<RawReport[]> {
    const since = windowStart(now, MAX_WINDOW_MINUTES);

    const conditions = [
      gte(waitTimeReports.reportedAt, since),
      eq(waitTimeReports.status, "active"),
    ];
    if (airportIds) {
      if (airportIds.length === 0) return [];
      conditions.push(inArray(waitTimeReports.airportId, airportIds));
    }

    return db
      .select({
        id: waitTimeReports.id,
        airportId: waitTimeReports.airportId,
        waitMinutes: waitTimeReports.waitMinutes,
        lineType: waitTimeReports.lineType,
        terminal: waitTimeReports.terminal,
        checkpoint: waitTimeReports.checkpoint,
        terminalKey: waitTimeReports.terminalKey,
        checkpointKey: waitTimeReports.checkpointKey,
        reportedAt: waitTimeReports.reportedAt,
        observedAt: waitTimeReports.observedAt,
      })
      .from(waitTimeReports)
      .where(and(...conditions));
  }

  private async confirmationsFor(
    reportIds: string[],
    now: Date,
  ): Promise<RawConfirmation[]> {
    if (reportIds.length === 0) return [];

    return db
      .select({
        reportId: reportConfirmations.reportId,
        agrees: reportConfirmations.agrees,
        createdAt: reportConfirmations.createdAt,
      })
      .from(reportConfirmations)
      .where(
        and(
          inArray(reportConfirmations.reportId, reportIds),
          gte(reportConfirmations.createdAt, windowStart(now, MAX_WINDOW_MINUTES)),
        ),
      );
  }

  async getAirports(
    lineType: LineType,
    now: Date = new Date(),
  ): Promise<AirportWithStats[]> {
    const [rows, reports, baseline] = await Promise.all([
      db.select().from(airports).orderBy(airports.code),
      this.recentReports(now),
      loadBaselineLookup(),
    ]);

    const confirmations = await this.confirmationsFor(
      reports.map((r) => r.id),
      now,
    );

    const byAirport = new Map<string, RawReport[]>();
    for (const report of reports) {
      const list = byAirport.get(report.airportId);
      if (list) list.push(report);
      else byAirport.set(report.airportId, [report]);
    }

    return rows.map((airport) =>
      buildStats(
        airport,
        byAirport.get(airport.id) ?? [],
        confirmations,
        baseline,
        now,
        lineType,
      ),
    );
  }

  async getAirportByCode(
    code: string,
    lineType: LineType,
    now: Date = new Date(),
  ): Promise<AirportWithStats | undefined> {
    const airport = await this.findAirport(code);
    if (!airport) return undefined;

    const [reports, baseline] = await Promise.all([
      this.recentReports(now, [airport.id]),
      loadBaselineLookup(),
    ]);

    const confirmations = await this.confirmationsFor(
      reports.map((r) => r.id),
      now,
    );

    return buildStats(airport, reports, confirmations, baseline, now, lineType);
  }

  private async findAirport(code: string): Promise<Airport | undefined> {
    const rows = await db
      .select()
      .from(airports)
      .where(eq(airports.code, code.trim().toUpperCase()))
      .limit(1);
    return rows[0];
  }

  async createAirport(airport: InsertAirport): Promise<Airport> {
    const [created] = await db.insert(airports).values(airport).returning();
    return created;
  }

  /**
   * The activity feed. Windowed to match the numbers above it — a list headed
   * "Recent reports" must not be able to show something from three months ago.
   */
  async getReportsByAirportCode(code: string): Promise<WaitTimeReportWithVotes[]> {
    const airport = await this.findAirport(code);
    if (!airport) return [];

    const now = new Date();

    const rows = await db
      .select()
      .from(waitTimeReports)
      .where(
        and(
          eq(waitTimeReports.airportId, airport.id),
          eq(waitTimeReports.status, "active"),
          gte(waitTimeReports.reportedAt, windowStart(now, MAX_WINDOW_MINUTES)),
        ),
      )
      .orderBy(desc(waitTimeReports.reportedAt))
      .limit(50);

    const votes = await this.confirmationsFor(
      rows.map((r) => r.id),
      now,
    );

    const tally = new Map<string, { agree: number; disagree: number }>();
    for (const vote of votes) {
      const current = tally.get(vote.reportId) ?? { agree: 0, disagree: 0 };
      if (vote.agrees) current.agree += 1;
      else current.disagree += 1;
      tally.set(vote.reportId, current);
    }

    return rows.map((row) => {
      const counts = tally.get(row.id) ?? { agree: 0, disagree: 0 };
      return {
        ...row,
        reportedAt: row.reportedAt.toISOString(),
        observedAt: row.observedAt.toISOString(),
        agreeCount: counts.agree,
        disagreeCount: counts.disagree,
      };
    });
  }

  /**
   * Per-checkpoint breakdown, grouped on normalised keys so that "North",
   * "north" and "North Checkpoint" are one queue rather than three — and split
   * by terminal and line type, because checkpoint "C" in Terminal 1 has
   * nothing to do with checkpoint "C" in Terminal 5.
   */
  async getCheckpointStats(
    code: string,
    now: Date = new Date(),
  ): Promise<CheckpointStats[]> {
    const airport = await this.findAirport(code);
    if (!airport) return [];

    const [reports, baseline] = await Promise.all([
      this.recentReports(now, [airport.id]),
      loadBaselineLookup(),
    ]);

    const named = reports.filter((r) => r.checkpointKey !== null);
    if (named.length === 0) return [];

    const confirmations = await this.confirmationsFor(
      named.map((r) => r.id),
      now,
    );

    const groups = new Map<string, RawReport[]>();
    for (const report of named) {
      const groupKey = `${report.terminalKey ?? ""}|${report.checkpointKey}|${report.lineType}`;
      const list = groups.get(groupKey);
      if (list) list.push(report);
      else groups.set(groupKey, [report]);
    }

    const stats: CheckpointStats[] = [];

    for (const group of groups.values()) {
      const lineType = group[0].lineType as LineType;
      const wait = estimateWait(
        toObservations(group, confirmations),
        baseline(airport, lineType, now),
        now,
      );

      stats.push({
        checkpoint: pickDisplayLabel(group.map((r) => r.checkpoint)) ?? "Checkpoint",
        terminal: pickDisplayLabel(group.map((r) => r.terminal)),
        lineType,
        wait,
      });
    }

    // Longest first — the number a traveller most needs to see is the one
    // that might make them late.
    return stats.sort((a, b) => b.wait.waitMinutes - a.wait.waitMinutes);
  }

  /**
   * Labels other travellers have already used at this airport, so the form can
   * suggest them. This is how the checkpoint vocabulary converges on the real
   * signage without us having to guess at it for 32 airports.
   */
  async getKnownLabels(
    code: string,
  ): Promise<{ terminals: string[]; checkpoints: string[] }> {
    const airport = await this.findAirport(code);
    if (!airport) return { terminals: [], checkpoints: [] };

    const rows = await db
      .select({
        terminal: waitTimeReports.terminal,
        checkpoint: waitTimeReports.checkpoint,
        terminalKey: waitTimeReports.terminalKey,
        checkpointKey: waitTimeReports.checkpointKey,
      })
      .from(waitTimeReports)
      .where(
        and(
          eq(waitTimeReports.airportId, airport.id),
          eq(waitTimeReports.status, "active"),
          gte(waitTimeReports.reportedAt, windowStart(new Date(), 90 * 24 * 60)),
        ),
      )
      .limit(2000);

    type LabelRow = { key: string | null; label: string | null };

    const collect = (candidates: LabelRow[]): string[] => {
      const byKey = new Map<string, (string | null)[]>();
      for (const { key, label } of candidates) {
        if (!key) continue;
        const list = byKey.get(key);
        if (list) list.push(label);
        else byKey.set(key, [label]);
      }
      return [...byKey.values()]
        .map((labels) => pickDisplayLabel(labels))
        .filter((label): label is string => label !== null)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    };

    return {
      terminals: collect(
        rows.map((row) => ({ key: row.terminalKey, label: row.terminal })),
      ),
      checkpoints: collect(
        rows.map((row) => ({ key: row.checkpointKey, label: row.checkpoint })),
      ),
    };
  }

  /**
   * Record a report.
   *
   * Rate limiting and plausibility both happen here rather than in the route,
   * so there is no path into the table that skips them.
   */
  async createReport(
    report: InsertWaitTimeReport,
    ipHash: string | null,
  ): Promise<CreateReportResult> {
    const now = new Date();
    const lineType = report.lineType as LineType;

    if (report.deviceId) {
      await this.enforceRateLimit(report.deviceId, report.airportId, now);
    }

    const airport = await db
      .select()
      .from(airports)
      .where(eq(airports.id, report.airportId))
      .limit(1);

    if (airport.length === 0) {
      throw new UnknownAirportError(report.airportId);
    }

    // The traveller tells us how long ago they cleared the checkpoint; we
    // turn that into an instant here rather than trusting a timestamp from
    // their device, whose clock we have no reason to believe.
    const observedAt = new Date(
      now.getTime() - (report.observedMinutesAgo ?? 0) * 60_000,
    );

    const baseline = await loadBaselineLookup();
    // Judge plausibility against the hour they were actually in the line.
    const expected = baseline(airport[0], lineType, observedAt);

    const terminal = cleanRawLabel(report.terminal);
    const checkpoint = cleanRawLabel(report.checkpoint);

    // Retention runs off the back of writes rather than a scheduler: it needs
    // no extra configuration to keep working, and a deployment that accepts
    // reports is by definition one that can clean them up.
    void this.maybePurge(now);

    const [created] = await db
      .insert(waitTimeReports)
      .values({
        airportId: report.airportId,
        waitMinutes: report.waitMinutes,
        lineType,
        source: report.source ?? "community",
        terminal,
        checkpoint,
        terminalKey: normalizeLabel(terminal),
        checkpointKey: normalizeLabel(checkpoint),
        deviceId: report.deviceId ?? null,
        ipHash,
        reportedAt: now,
        observedAt,
        // Implausible values are kept, not dropped — a filter that silently
        // deletes data is a filter nobody can debug.
        status: isPlausible(report.waitMinutes, expected) ? "active" : "flagged",
      })
      .returning();

    // Hand back what the airport now reads, so the person who just reported
    // can see their contribution land instead of being thanked into a void.
    const updated = await this.getAirportByCode(airport[0].code, lineType, now);

    return {
      report: {
        ...created,
        reportedAt: created.reportedAt.toISOString(),
        observedAt: created.observedAt.toISOString(),
        agreeCount: 0,
        disagreeCount: 0,
      },
      wait: updated?.wait ?? {
        waitMinutes: report.waitMinutes,
        low: report.waitMinutes,
        high: report.waitMinutes,
        confidence: "low",
        dataSource: "community",
        sampleCount: 1,
        newestObservationAt: observedAt.toISOString(),
      },
      lineType,
    };
  }

  private lastPurgeAt = 0;

  /** At most once an hour per instance, and never blocking the response. */
  private async maybePurge(now: Date): Promise<void> {
    const HOUR_MS = 60 * 60 * 1000;
    if (now.getTime() - this.lastPurgeAt < HOUR_MS) return;
    this.lastPurgeAt = now.getTime();

    try {
      await this.purgeExpiredReports(now);
    } catch (error) {
      // Retention failing must never stop someone filing a report.
      console.error("Retention purge failed:", error);
    }
  }

  private async enforceRateLimit(
    deviceId: string,
    airportId: string,
    now: Date,
  ): Promise<void> {
    const cooldownSince = windowStart(now, REPORT_COOLDOWN_MINUTES);

    const recent = await db
      .select({ reportedAt: waitTimeReports.reportedAt })
      .from(waitTimeReports)
      .where(
        and(
          eq(waitTimeReports.deviceId, deviceId),
          eq(waitTimeReports.airportId, airportId),
          gte(waitTimeReports.reportedAt, cooldownSince),
        ),
      )
      .orderBy(desc(waitTimeReports.reportedAt))
      .limit(1);

    if (recent.length > 0) {
      const elapsed = (now.getTime() - recent[0].reportedAt.getTime()) / 60_000;
      throw new RateLimitError(
        "cooldown",
        Math.max(1, Math.ceil(REPORT_COOLDOWN_MINUTES - elapsed)),
      );
    }

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(waitTimeReports)
      .where(
        and(
          eq(waitTimeReports.deviceId, deviceId),
          gte(waitTimeReports.reportedAt, windowStart(now, 60)),
        ),
      );

    if (Number(count) >= REPORTS_PER_DEVICE_PER_HOUR) {
      throw new RateLimitError("hourly_cap", 60);
    }
  }

  async confirmReport(
    reportId: string,
    deviceId: string,
    ipHash: string | null,
    agrees: boolean,
  ): Promise<void> {
    const report = await db
      .select({ id: waitTimeReports.id, deviceId: waitTimeReports.deviceId })
      .from(waitTimeReports)
      .where(eq(waitTimeReports.id, reportId))
      .limit(1);

    if (report.length === 0) throw new UnknownReportError(reportId);

    // Confirming your own report would just be reporting twice.
    if (report[0].deviceId && report[0].deviceId === deviceId) {
      throw new SelfConfirmationError();
    }

    await db
      .insert(reportConfirmations)
      .values({ reportId, deviceId, ipHash, agrees })
      .onConflictDoUpdate({
        target: [reportConfirmations.deviceId, reportConfirmations.reportId],
        set: { agrees, createdAt: new Date() },
      });
  }

  /**
   * Delete reports past the retention window.
   *
   * Confirmations cascade with their report, so the device token and IP hash
   * attached to a report go with it. The privacy page promises this happens;
   * this is where it happens.
   */
  async purgeExpiredReports(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(
      now.getTime() - REPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const deleted = await db
      .delete(waitTimeReports)
      .where(lt(waitTimeReports.reportedAt, cutoff))
      .returning({ id: waitTimeReports.id });

    if (deleted.length > 0) {
      console.log(`Purged ${deleted.length} reports older than ${REPORT_RETENTION_DAYS} days`);
    }
    return deleted.length;
  }

  async getAirportCount(): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(airports);
    return Number(result[0].count);
  }

  /**
   * Build a forecast function for one airport and line.
   *
   * The current estimate anchors it: how far today is running from typical is
   * measured once, then decayed as the horizon grows. Returning a closure lets
   * the planner probe different arrival times without re-querying.
   */
  private async forecaster(
    airport: Airport,
    lineType: LineType,
    now: Date,
  ): Promise<(target: Date) => WaitForecast> {
    const [reports, baseline] = await Promise.all([
      this.recentReports(now, [airport.id]),
      loadBaselineLookup(),
    ]);

    const forLine = reports.filter((r) => r.lineType === lineType);
    const confirmations = await this.confirmationsFor(
      forLine.map((r) => r.id),
      now,
    );

    const baselineNow = baseline(airport, lineType, now);
    const current = estimateWait(
      toObservations(forLine, confirmations),
      baselineNow,
      now,
    );

    const delta = currentDelta(current, baselineNow);

    return (target: Date) =>
      forecastWait(
        baseline(airport, lineType, target),
        delta,
        current.confidence,
        now,
        target,
        localClock(target, airport.timezone).hour,
      );
  }

  /** Hourly forecast for the next `hours`, on the hour in the airport's zone. */
  async getForecast(
    code: string,
    lineType: LineType,
    hours: number,
    now: Date = new Date(),
  ): Promise<AirportForecast | undefined> {
    const airport = await this.findAirport(code);
    if (!airport) return undefined;

    const forecastAt = await this.forecaster(airport, lineType, now);

    const points: WaitForecast[] = [];
    for (let offset = 0; offset <= hours; offset++) {
      points.push(forecastAt(new Date(now.getTime() + offset * 60 * 60_000)));
    }

    return {
      code: airport.code,
      lineType,
      timezone: airport.timezone,
      points,
    };
  }

  /** Work backwards from a flight to the moment to be at the airport. */
  async getPlan(
    code: string,
    query: PlanQuery,
    now: Date = new Date(),
  ): Promise<(DeparturePlan & { timezone: string }) | undefined> {
    const airport = await this.findAirport(code);
    if (!airport) return undefined;

    const forecastAt = await this.forecaster(airport, query.line, now);

    const plan = planDeparture({
      departureAt: new Date(query.departureAt),
      now,
      gateTransitMinutes: airport.gateTransitMinutes,
      forecastAt,
      options: {
        checkedBag: query.checkedBag,
        international: query.international,
        risk: query.risk,
      },
    });

    return { ...plan, timezone: airport.timezone };
  }
}

export class UnknownAirportError extends Error {
  constructor(airportId: string) {
    super(`No airport with id ${airportId}`);
    this.name = "UnknownAirportError";
  }
}

export class UnknownReportError extends Error {
  constructor(reportId: string) {
    super(`No report with id ${reportId}`);
    this.name = "UnknownReportError";
  }
}

export class SelfConfirmationError extends Error {
  constructor() {
    super("You can't confirm your own report.");
    this.name = "SelfConfirmationError";
  }
}

export const storage = new DatabaseStorage();
