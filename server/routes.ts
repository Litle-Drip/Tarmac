import type { Express, Request, Response } from "express";
import { sql } from "drizzle-orm";
import {
  storage,
  RateLimitError,
  UnknownAirportError,
  UnknownReportError,
  SelfConfirmationError,
} from "./storage.js";
import { db, isDatabaseConfigured } from "./db.js";
import {
  submitReportSchema,
  confirmReportSchema,
  LINE_TYPES,
  type LineType,
} from "../shared/schema.js";
import { identify, readDeviceId, DEVICE_HEADER } from "./identity.js";

/**
 * Read endpoints are cheap to serve stale and expensive to serve from
 * Postgres — every open tab polls them. A short shared cache absorbs almost
 * all of that while keeping the number fresh enough to plan around.
 */
function cacheFor(res: Response, seconds: number): void {
  res.set(
    "Cache-Control",
    `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${seconds * 3}`,
  );
}

function readLineType(req: Request): LineType {
  const requested = String(req.query.line ?? "").trim();
  return (LINE_TYPES as readonly string[]).includes(requested)
    ? (requested as LineType)
    : "standard";
}

function logAndFail(res: Response, context: string, error: unknown): void {
  console.error(`${context}:`, error);
  res.status(500).json({ message: `Failed to ${context}` });
}

export function registerRoutes(app: Express): void {
  /**
   * Reports what is actually wrong rather than failing opaquely, so a broken
   * deployment can be diagnosed by opening one URL in a browser.
   *
   * Diagnoses are safe to expose; the underlying driver messages are not —
   * they can carry host and credential detail — so those are logged instead.
   */
  app.get("/api/health", async (_req, res) => {
    res.set("Cache-Control", "no-store");

    if (!isDatabaseConfigured()) {
      return res.status(503).json({
        ok: false,
        database: "unconfigured",
        message:
          "DATABASE_URL is not set on this deployment. Add it in your host's environment variables and redeploy.",
      });
    }

    try {
      await db.execute(sql`select 1`);
    } catch (error) {
      console.error("Health check: database unreachable:", error);
      return res.status(503).json({
        ok: false,
        database: "unreachable",
        message:
          "Could not connect to the database. Check DATABASE_URL and that the database is running. Details are in the server logs.",
      });
    }

    try {
      const airportCount = await storage.getAirportCount();
      return res.json({ ok: true, database: "connected", airportCount });
    } catch (error) {
      // 42P01 is Postgres for "relation does not exist".
      const undefinedTable =
        typeof error === "object" && error !== null && (error as any).code === "42P01";
      console.error("Health check: query failed:", error);
      return res.status(503).json({
        ok: false,
        database: undefinedTable ? "no-tables" : "error",
        message: undefinedTable
          ? "Connected, but the tables are missing. Run migrations/setup.sql in the Neon SQL Editor."
          : "Connected, but the query failed. Details are in the server logs.",
      });
    }
  });

  app.get("/api/airports", async (req, res) => {
    try {
      const airports = await storage.getAirports(readLineType(req));
      cacheFor(res, 20);
      res.json(airports);
    } catch (error) {
      logAndFail(res, "fetch airports", error);
    }
  });

  app.get("/api/airports/:code", async (req, res) => {
    try {
      const airport = await storage.getAirportByCode(
        req.params.code,
        readLineType(req),
      );
      if (!airport) {
        return res.status(404).json({ message: "Airport not found" });
      }
      cacheFor(res, 20);
      res.json(airport);
    } catch (error) {
      logAndFail(res, "fetch airport", error);
    }
  });

  /** Terminal and checkpoint names other travellers have used here. */
  app.get("/api/airports/:code/labels", async (req, res) => {
    try {
      const labels = await storage.getKnownLabels(req.params.code);
      cacheFor(res, 300);
      res.json(labels);
    } catch (error) {
      logAndFail(res, "fetch labels", error);
    }
  });

  app.get("/api/reports/:code", async (req, res) => {
    try {
      const reports = await storage.getReportsByAirportCode(req.params.code);
      cacheFor(res, 20);
      res.json(reports);
    } catch (error) {
      logAndFail(res, "fetch reports", error);
    }
  });

  app.get("/api/checkpoints/:code", async (req, res) => {
    try {
      const stats = await storage.getCheckpointStats(req.params.code);
      cacheFor(res, 20);
      res.json(stats);
    } catch (error) {
      logAndFail(res, "fetch checkpoint stats", error);
    }
  });

  app.post("/api/reports", async (req, res) => {
    res.set("Cache-Control", "no-store");

    const { deviceId, ipHash } = identify(req);

    // Without a device token there is no cooldown to enforce, which makes the
    // rate limit optional for anyone who simply omits the header. The app
    // always sends one.
    if (!deviceId) {
      return res.status(400).json({
        message: "Missing or malformed device token.",
        detail: `Send a stable identifier in the ${DEVICE_HEADER} header.`,
      });
    }

    const parsed = submitReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: "Invalid report data", errors: parsed.error.flatten() });
    }

    try {
      const report = await storage.createReport(
        { ...parsed.data, deviceId, source: "community" },
        ipHash,
      );
      return res.status(201).json(report);
    } catch (error) {
      if (error instanceof RateLimitError) {
        res.set("Retry-After", String(error.retryAfterMinutes * 60));
        return res
          .status(429)
          .json({ message: error.message, reason: error.reason });
      }
      if (error instanceof UnknownAirportError) {
        return res.status(400).json({ message: "Unknown airport." });
      }
      return logAndFail(res, "create report", error);
    }
  });

  /** One-tap "still about right?" on somebody else's report. */
  app.post("/api/reports/:id/confirm", async (req, res) => {
    res.set("Cache-Control", "no-store");

    const deviceId = readDeviceId(req);
    if (!deviceId) {
      return res.status(400).json({
        message: "Missing or malformed device token.",
        detail: `Send a stable identifier in the ${DEVICE_HEADER} header.`,
      });
    }

    const parsed = confirmReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: "Invalid confirmation", errors: parsed.error.flatten() });
    }

    try {
      const { ipHash } = identify(req);
      await storage.confirmReport(
        req.params.id,
        deviceId,
        ipHash,
        parsed.data.agrees,
      );
      return res.status(204).end();
    } catch (error) {
      if (error instanceof UnknownReportError) {
        return res.status(404).json({ message: "Report not found." });
      }
      if (error instanceof SelfConfirmationError) {
        return res.status(409).json({ message: error.message });
      }
      return logAndFail(res, "confirm report", error);
    }
  });
}
