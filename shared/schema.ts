import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  integer,
  timestamp,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/**
 * The highest wait a traveller can report. The slider and the API agree on
 * this number on purpose — an API that accepts values the UI cannot produce is
 * an API that only bots use.
 */
export const MAX_REPORTABLE_WAIT = 150;

export const LINE_TYPES = ["standard", "tsa_precheck", "clear"] as const;
export type LineType = (typeof LINE_TYPES)[number];

/**
 * Where an observation came from. Only "community" may ever be presented to a
 * traveller as a community-sourced number; the others are modelled or
 * third-party and are labelled as such in the UI.
 */
export const OBSERVATION_SOURCES = ["community", "airport_feed"] as const;
export type ObservationSource = (typeof OBSERVATION_SOURCES)[number];

export const AIRPORT_TIERS = ["mega", "large", "medium", "small"] as const;
export type AirportTier = (typeof AIRPORT_TIERS)[number];

export const airports = pgTable("airports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 10 }).notNull().unique(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  state: varchar("state", { length: 2 }).notNull(),
  terminalCount: integer("terminal_count").notNull().default(1),
  /**
   * IANA zone, e.g. "America/Los_Angeles". Wait times are driven far more by
   * the local hour than by anything else, so every time-of-day calculation
   * resolves through this rather than the server clock.
   */
  timezone: text("timezone").notNull().default("America/New_York"),
  tier: varchar("tier", { length: 10 }).notNull().default("small"),
  /**
   * Typical minutes from clearing security to standing at the gate, including
   * trains and trams. ATL's plane train and DFW's Skylink make this the
   * difference between a plan that works and one that doesn't.
   */
  gateTransitMinutes: integer("gate_transit_minutes").notNull().default(12),
});

export const waitTimeReports = pgTable(
  "wait_time_reports",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    airportId: varchar("airport_id")
      .notNull()
      .references(() => airports.id),
    waitMinutes: integer("wait_minutes").notNull(),
    /** Raw text as the traveller typed it — shown back to them verbatim. */
    checkpoint: text("checkpoint"),
    terminal: text("terminal"),
    /** Normalised forms used for grouping. See server/normalize.ts. */
    checkpointKey: text("checkpoint_key"),
    terminalKey: text("terminal_key"),
    lineType: varchar("line_type", { length: 30 }).notNull().default("standard"),
    source: varchar("source", { length: 20 }).notNull().default("community"),
    /** Opaque per-install identifier. Not an account, not tied to a person. */
    deviceId: varchar("device_id", { length: 64 }),
    /** Salted hash. We never store a raw IP. */
    ipHash: varchar("ip_hash", { length: 64 }),
    /** "active" counts toward wait times; "flagged" is retained but excluded. */
    status: varchar("status", { length: 16 }).notNull().default("active"),
    reportedAt: timestamp("reported_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // The shape every read query uses: newest rows for one airport.
    index("wait_reports_airport_time_idx").on(
      table.airportId,
      table.reportedAt.desc(),
    ),
    // Rate limiting looks up recent rows for one device at one airport.
    index("wait_reports_device_idx").on(
      table.deviceId,
      table.airportId,
      table.reportedAt.desc(),
    ),
  ],
);

/**
 * A one-tap "still about right?" on somebody else's report.
 *
 * An agreement is modelled as a fresh observation of the same wait at the
 * moment it was tapped, which is exactly what it is. That keeps the weighting
 * maths in one place and means a busy checkpoint stays fresh without anyone
 * having to fill in a form.
 */
export const reportConfirmations = pgTable(
  "report_confirmations",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    reportId: varchar("report_id")
      .notNull()
      .references(() => waitTimeReports.id, { onDelete: "cascade" }),
    deviceId: varchar("device_id", { length: 64 }).notNull(),
    ipHash: varchar("ip_hash", { length: 64 }),
    /** true = "still about right", false = "way off". */
    agrees: boolean("agrees").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("confirmations_report_idx").on(table.reportId, table.createdAt.desc()),
    // One vote per device per report.
    uniqueIndex("confirmations_device_report_idx").on(
      table.deviceId,
      table.reportId,
    ),
  ],
);

/**
 * Expected wait for an airport/line/day/hour, in the airport's local time.
 *
 * This replaces the previous hand-typed airport tiers and invented
 * multipliers. Rows are generated from published wait-time patterns; each row
 * carries its own provenance so real measured data can replace modelled data
 * one cell at a time without a code change.
 */
export const airportBaselines = pgTable(
  "airport_baselines",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    airportId: varchar("airport_id")
      .notNull()
      .references(() => airports.id, { onDelete: "cascade" }),
    lineType: varchar("line_type", { length: 30 }).notNull(),
    /** 0 = Sunday, matching JS getDay(). */
    dayOfWeek: integer("day_of_week").notNull(),
    /** 0–23 in the airport's local time. */
    hourOfDay: integer("hour_of_day").notNull(),
    waitMinutes: integer("wait_minutes").notNull(),
    /** "modeled" until replaced by "observed" rows derived from real data. */
    source: varchar("source", { length: 20 }).notNull().default("modeled"),
  },
  (table) => [
    uniqueIndex("baselines_lookup_idx").on(
      table.airportId,
      table.lineType,
      table.dayOfWeek,
      table.hourOfDay,
    ),
  ],
);

export const insertAirportSchema = createInsertSchema(airports).omit({ id: true });

export const insertWaitTimeReportSchema = createInsertSchema(waitTimeReports)
  .omit({
    id: true,
    reportedAt: true,
    checkpointKey: true,
    terminalKey: true,
    ipHash: true,
    status: true,
  })
  .extend({
    waitMinutes: z.number().int().min(0).max(MAX_REPORTABLE_WAIT),
    lineType: z.enum(LINE_TYPES),
    source: z.enum(OBSERVATION_SOURCES).default("community"),
    terminal: z.string().trim().max(60).nullish(),
    checkpoint: z.string().trim().max(60).nullish(),
  });

/** What the client is allowed to send. Server-side fields are not accepted. */
export const submitReportSchema = insertWaitTimeReportSchema.omit({
  deviceId: true,
  source: true,
});

export const confirmReportSchema = z.object({
  agrees: z.boolean(),
});

export type InsertAirport = z.infer<typeof insertAirportSchema>;
export type Airport = typeof airports.$inferSelect;
export type InsertWaitTimeReport = z.infer<typeof insertWaitTimeReportSchema>;
export type WaitTimeReport = typeof waitTimeReports.$inferSelect;
export type ReportConfirmation = typeof reportConfirmations.$inferSelect;
export type AirportBaseline = typeof airportBaselines.$inferSelect;

/**
 * How much to trust the number on screen.
 *
 * Driven by how many observations there are, how old the freshest one is, and
 * how much they disagree with each other — not by a raw report count, which
 * says nothing about whether the reports are recent or consistent.
 */
export type Confidence = "high" | "medium" | "low";

/** Which kind of data produced the headline number. */
export type WaitDataSource = "community" | "blended" | "estimated";

export type WaitEstimate = {
  /** The headline number, in minutes. */
  waitMinutes: number;
  /** Range we'd actually stand behind, in minutes. */
  low: number;
  high: number;
  confidence: Confidence;
  dataSource: WaitDataSource;
  /** Community observations that fed this number, within the window used. */
  sampleCount: number;
  /** ISO-8601 UTC. Null when nothing community-sourced contributed. */
  newestObservationAt: string | null;
};

export type LineTypeEstimate = WaitEstimate & { lineType: LineType };

export type AirportWithStats = Airport & {
  /** Estimate for the line the caller asked about (default: standard). */
  wait: WaitEstimate;
  /** Every line type, so the UI can switch without another round trip. */
  byLineType: LineTypeEstimate[];
  /** Community reports across all lines in the freshness window. */
  reportCount: number;
  /** ISO-8601 UTC, windowed to match reportCount. */
  latestReport: string | null;
};

export type CheckpointStats = {
  /** Most commonly used spelling among the grouped reports. */
  checkpoint: string;
  terminal: string | null;
  lineType: LineType;
  wait: WaitEstimate;
};

/** A report plus its confirmation tallies, for the activity feed. */
export type WaitTimeReportWithVotes = Omit<WaitTimeReport, "reportedAt"> & {
  reportedAt: string;
  agreeCount: number;
  disagreeCount: number;
};

export const RISK_TOLERANCES = ["tight", "comfortable", "early"] as const;
export type RiskTolerance = (typeof RISK_TOLERANCES)[number];

/** Query parameters for the departure planner. */
export const planQuerySchema = z.object({
  /** ISO-8601 scheduled departure. Must carry an offset. */
  departureAt: z.string().datetime({ offset: true }),
  line: z.enum(LINE_TYPES).default("standard"),
  checkedBag: z.coerce.boolean().default(false),
  international: z.coerce.boolean().default(false),
  risk: z.enum(RISK_TOLERANCES).default("comfortable"),
});

export type PlanQuery = z.infer<typeof planQuerySchema>;

export const forecastQuerySchema = z.object({
  line: z.enum(LINE_TYPES).default("standard"),
  hours: z.coerce.number().int().min(1).max(24).default(12),
});

export type WaitForecastPoint = {
  /** ISO-8601 UTC. */
  at: string;
  localHour: number;
  waitMinutes: number;
  low: number;
  high: number;
  confidence: Confidence;
};

export type PlanStep = {
  label: string;
  minutes: number;
  detail: string;
};

export type DeparturePlan = {
  departureAt: string;
  arriveAtAirportBy: string;
  /** Airline bag-drop deadline, when a bag is being checked. */
  bagDropClosesAt: string | null;
  totalMinutes: number;
  securityForecast: WaitForecastPoint;
  steps: PlanStep[];
  warnings: string[];
};

export type AirportForecast = {
  code: string;
  lineType: LineType;
  timezone: string;
  points: WaitForecastPoint[];
};
