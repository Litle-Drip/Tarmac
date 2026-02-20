import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const airports = pgTable("airports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 10 }).notNull().unique(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  state: varchar("state", { length: 2 }).notNull(),
  terminal_count: integer("terminal_count").notNull().default(1),
});

export const waitTimeReports = pgTable("wait_time_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  airportId: varchar("airport_id").notNull().references(() => airports.id),
  waitMinutes: integer("wait_minutes").notNull(),
  checkpoint: text("checkpoint"),
  terminal: text("terminal"),
  lineType: varchar("line_type", { length: 30 }).notNull().default("standard"),
  reportedAt: timestamp("reported_at").notNull().defaultNow(),
});

export const insertAirportSchema = createInsertSchema(airports).omit({ id: true });
export const insertWaitTimeReportSchema = createInsertSchema(waitTimeReports)
  .omit({ id: true, reportedAt: true })
  .extend({
    waitMinutes: z.number().min(0).max(300),
    lineType: z.enum(["standard", "tsa_precheck", "clear"]),
  });

export type InsertAirport = z.infer<typeof insertAirportSchema>;
export type Airport = typeof airports.$inferSelect;
export type InsertWaitTimeReport = z.infer<typeof insertWaitTimeReportSchema>;
export type WaitTimeReport = typeof waitTimeReports.$inferSelect;

export type AirportWithStats = Airport & {
  avgWaitMinutes: number | null;
  reportCount: number;
  latestReport: string | null;
};
