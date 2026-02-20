import { eq, desc, sql, and, gte } from "drizzle-orm";
import { db } from "./db";
import { airports, waitTimeReports, type InsertAirport, type Airport, type InsertWaitTimeReport, type WaitTimeReport, type AirportWithStats } from "@shared/schema";

export interface IStorage {
  getAirports(): Promise<AirportWithStats[]>;
  getAirportByCode(code: string): Promise<AirportWithStats | undefined>;
  createAirport(airport: InsertAirport): Promise<Airport>;
  getReportsByAirportCode(code: string): Promise<WaitTimeReport[]>;
  createReport(report: InsertWaitTimeReport): Promise<WaitTimeReport>;
  getAirportCount(): Promise<number>;
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
        reportCount: sql<number>`count(${waitTimeReports.id})::int`.as("report_count"),
        latestReport: sql<string>`max(${waitTimeReports.reportedAt})::text`.as("latest_report"),
      })
      .from(airports)
      .leftJoin(waitTimeReports, eq(airports.id, waitTimeReports.airportId))
      .groupBy(airports.id)
      .orderBy(airports.code);

    return result.map((r) => ({
      ...r,
      avgWaitMinutes: r.avgWaitMinutes !== null ? Math.round(Number(r.avgWaitMinutes)) : null,
      reportCount: Number(r.reportCount),
    }));
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
        reportCount: sql<number>`count(${waitTimeReports.id})::int`.as("report_count"),
        latestReport: sql<string>`max(${waitTimeReports.reportedAt})::text`.as("latest_report"),
      })
      .from(airports)
      .leftJoin(waitTimeReports, eq(airports.id, waitTimeReports.airportId))
      .where(eq(airports.code, code.toUpperCase()))
      .groupBy(airports.id);

    if (result.length === 0) return undefined;

    const r = result[0];
    return {
      ...r,
      avgWaitMinutes: r.avgWaitMinutes !== null ? Math.round(Number(r.avgWaitMinutes)) : null,
      reportCount: Number(r.reportCount),
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
