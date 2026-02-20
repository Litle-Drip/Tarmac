import { eq, desc, sql, and, gte } from "drizzle-orm";
import { db } from "./db";
import { airports, waitTimeReports, type InsertAirport, type Airport, type InsertWaitTimeReport, type WaitTimeReport, type AirportWithStats, type CheckpointStats } from "@shared/schema";
import { estimateWaitTime } from "./estimator";

const MIN_COMMUNITY_REPORTS = 3;

export interface IStorage {
  getAirports(): Promise<AirportWithStats[]>;
  getAirportByCode(code: string): Promise<AirportWithStats | undefined>;
  createAirport(airport: InsertAirport): Promise<Airport>;
  getReportsByAirportCode(code: string): Promise<WaitTimeReport[]>;
  getCheckpointStats(code: string): Promise<CheckpointStats[]>;
  createReport(report: InsertWaitTimeReport): Promise<WaitTimeReport>;
  getAirportCount(): Promise<number>;
}

function blendWaitTime(
  airport: Airport,
  communityAvg: number | null,
  reportCount: number
): { avgWaitMinutes: number; dataSource: "community" | "estimated" | "blended" } {
  const estimate = estimateWaitTime(airport);

  if (communityAvg === null || reportCount === 0) {
    return { avgWaitMinutes: estimate, dataSource: "estimated" };
  }

  if (reportCount >= MIN_COMMUNITY_REPORTS) {
    return { avgWaitMinutes: Math.round(communityAvg), dataSource: "community" };
  }

  const communityWeight = reportCount / MIN_COMMUNITY_REPORTS;
  const estimateWeight = 1 - communityWeight;
  const blended = Math.round(communityAvg * communityWeight + estimate * estimateWeight);
  return { avgWaitMinutes: blended, dataSource: "blended" };
}

export class DatabaseStorage implements IStorage {
  async getAirports(): Promise<AirportWithStats[]> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const result = await db
      .select({
        id: airports.id,
        code: airports.code,
        name: airports.name,
        city: airports.city,
        state: airports.state,
        terminal_count: airports.terminal_count,
        avgWaitMinutes: sql<number>`coalesce(avg(case when ${waitTimeReports.reportedAt} >= ${twentyFourHoursAgo} then ${waitTimeReports.waitMinutes} end), null)`.as("avg_wait"),
        reportCount: sql<number>`count(case when ${waitTimeReports.reportedAt} >= ${twentyFourHoursAgo} then 1 end)::int`.as("report_count"),
        latestReport: sql<string>`max(${waitTimeReports.reportedAt})::text`.as("latest_report"),
      })
      .from(airports)
      .leftJoin(waitTimeReports, eq(airports.id, waitTimeReports.airportId))
      .groupBy(airports.id)
      .orderBy(airports.code);

    return result.map((r) => {
      const reportCount = Number(r.reportCount) || 0;
      const communityAvg = r.avgWaitMinutes !== null ? Number(r.avgWaitMinutes) : null;
      const airport: Airport = {
        id: r.id,
        code: r.code,
        name: r.name,
        city: r.city,
        state: r.state,
        terminal_count: r.terminal_count,
      };
      const { avgWaitMinutes, dataSource } = blendWaitTime(airport, communityAvg, reportCount);

      return {
        ...airport,
        avgWaitMinutes,
        reportCount,
        latestReport: r.latestReport,
        dataSource,
      };
    });
  }

  async getAirportByCode(code: string): Promise<AirportWithStats | undefined> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const result = await db
      .select({
        id: airports.id,
        code: airports.code,
        name: airports.name,
        city: airports.city,
        state: airports.state,
        terminal_count: airports.terminal_count,
        avgWaitMinutes: sql<number>`coalesce(avg(case when ${waitTimeReports.reportedAt} >= ${twentyFourHoursAgo} then ${waitTimeReports.waitMinutes} end), null)`.as("avg_wait"),
        reportCount: sql<number>`count(case when ${waitTimeReports.reportedAt} >= ${twentyFourHoursAgo} then 1 end)::int`.as("report_count"),
        latestReport: sql<string>`max(${waitTimeReports.reportedAt})::text`.as("latest_report"),
      })
      .from(airports)
      .leftJoin(waitTimeReports, eq(airports.id, waitTimeReports.airportId))
      .where(eq(airports.code, code.toUpperCase()))
      .groupBy(airports.id);

    if (result.length === 0) return undefined;

    const r = result[0];
    const reportCount = Number(r.reportCount) || 0;
    const communityAvg = r.avgWaitMinutes !== null ? Number(r.avgWaitMinutes) : null;
    const airport: Airport = {
      id: r.id,
      code: r.code,
      name: r.name,
      city: r.city,
      state: r.state,
      terminal_count: r.terminal_count,
    };
    const { avgWaitMinutes, dataSource } = blendWaitTime(airport, communityAvg, reportCount);

    return {
      ...airport,
      avgWaitMinutes,
      reportCount,
      latestReport: r.latestReport,
      dataSource,
    };
  }

  async createAirport(airport: InsertAirport): Promise<Airport> {
    const [created] = await db.insert(airports).values(airport).returning();
    return created;
  }

  async getReportsByAirportCode(code: string): Promise<WaitTimeReport[]> {
    const airport = await db.select().from(airports).where(eq(airports.code, code.toUpperCase())).limit(1);
    if (airport.length === 0) return [];

    return db
      .select()
      .from(waitTimeReports)
      .where(eq(waitTimeReports.airportId, airport[0].id))
      .orderBy(desc(waitTimeReports.reportedAt))
      .limit(50);
  }

  async getCheckpointStats(code: string): Promise<CheckpointStats[]> {
    const airport = await db.select().from(airports).where(eq(airports.code, code.toUpperCase())).limit(1);
    if (airport.length === 0) return [];

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const result = await db
      .select({
        checkpoint: waitTimeReports.checkpoint,
        avgWaitMinutes: sql<number>`round(avg(${waitTimeReports.waitMinutes}))::int`.as("avg_wait"),
        reportCount: sql<number>`count(*)::int`.as("report_count"),
        latestReport: sql<string>`max(${waitTimeReports.reportedAt})::text`.as("latest_report"),
      })
      .from(waitTimeReports)
      .where(
        and(
          eq(waitTimeReports.airportId, airport[0].id),
          gte(waitTimeReports.reportedAt, twentyFourHoursAgo),
          sql`${waitTimeReports.checkpoint} IS NOT NULL AND ${waitTimeReports.checkpoint} != ''`
        )
      )
      .groupBy(waitTimeReports.checkpoint)
      .orderBy(sql`avg(${waitTimeReports.waitMinutes}) desc`);

    return result.map((r) => ({
      checkpoint: r.checkpoint!,
      avgWaitMinutes: Number(r.avgWaitMinutes),
      reportCount: Number(r.reportCount),
      latestReport: r.latestReport,
    }));
  }

  async createReport(report: InsertWaitTimeReport): Promise<WaitTimeReport> {
    const [created] = await db.insert(waitTimeReports).values(report).returning();
    return created;
  }

  async getAirportCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(airports);
    return Number(result[0].count);
  }
}

export const storage = new DatabaseStorage();
