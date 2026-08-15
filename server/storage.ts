import { eq, desc, sql, and, gte, inArray } from "drizzle-orm";
import { db } from "./db.js";
import {
  airports,
  waitTimeReports,
  reportConfirmations,
  LINE_TYPES,
  type InsertAirport,
  type Airport,
  type InsertWaitTimeReport,
  type WaitTimeReport,
  type WaitTimeReportWithVotes,
  type AirportWithStats,
  type CheckpointStats,
  type LineType,
  type LineTypeEstimate,
} from "../shared/schema.js";
import {
  estimateWait,
  isPlausible,
  WINDOWS_MINUTES,
  type Observation,
} from "./wait-model.js";
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
      at: report.reportedAt,
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

  const latest = reports.reduce<Date | null>(
    (newest, report) =>
      newest === null || report.reportedAt > newest ? report.reportedAt : newest,
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
  createReport(report: InsertWaitTimeReport, ipHash: string | null): Promise<WaitTimeReport>;
  confirmReport(
    reportId: string,
    deviceId: string,
    ipHash: string | null,
    agrees: boolean,
  ): Promise<void>;
  getKnownLabels(code: string): Promise<{ terminals: string[]; checkpoints: string[] }>;
  getAirportCount(): Promise<number>;
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
  ): Promise<WaitTimeReport> {
    const now = new Date();

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

    const baseline = await loadBaselineLookup();
    const expected = baseline(airport[0], report.lineType as LineType, now);

    const terminal = cleanRawLabel(report.terminal);
    const checkpoint = cleanRawLabel(report.checkpoint);

    const [created] = await db
      .insert(waitTimeReports)
      .values({
        airportId: report.airportId,
        waitMinutes: report.waitMinutes,
        lineType: report.lineType,
        source: report.source ?? "community",
        terminal,
        checkpoint,
        terminalKey: normalizeLabel(terminal),
        checkpointKey: normalizeLabel(checkpoint),
        deviceId: report.deviceId ?? null,
        ipHash,
        // Implausible values are kept, not dropped — a filter that silently
        // deletes data is a filter nobody can debug.
        status: isPlausible(report.waitMinutes, expected) ? "active" : "flagged",
      })
      .returning();

    return created;
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

  async getAirportCount(): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(airports);
    return Number(result[0].count);
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
