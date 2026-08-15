import type { Express } from "express";
import { sql } from "drizzle-orm";
import { storage } from "./storage";
import { db, isDatabaseConfigured } from "./db";
import { insertWaitTimeReportSchema } from "@shared/schema";

export function registerRoutes(app: Express): void {

  // Reports what is actually wrong rather than failing opaquely, so a broken
  // deployment can be diagnosed by opening one URL in a browser.
  app.get("/api/health", async (_req, res) => {
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
      return res.status(503).json({
        ok: false,
        database: "unreachable",
        message: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      const airportCount = await storage.getAirportCount();
      return res.json({ ok: true, database: "connected", airportCount });
    } catch (error) {
      // 42P01 is Postgres for "relation does not exist".
      const undefinedTable =
        typeof error === "object" && error !== null && (error as any).code === "42P01";
      return res.status(503).json({
        ok: false,
        database: undefinedTable ? "no-tables" : "error",
        message: undefinedTable
          ? "Connected, but the tables are missing. Run migrations/setup.sql in the Neon SQL Editor."
          : error instanceof Error
            ? error.message
            : String(error),
      });
    }
  });

  app.get("/api/airports", async (_req, res) => {
    try {
      const airports = await storage.getAirports();
      res.json(airports);
    } catch (error) {
      console.error("Error fetching airports:", error);
      res.status(500).json({ message: "Failed to fetch airports" });
    }
  });

  app.get("/api/airports/:code", async (req, res) => {
    try {
      const airport = await storage.getAirportByCode(req.params.code);
      if (!airport) {
        return res.status(404).json({ message: "Airport not found" });
      }
      res.json(airport);
    } catch (error) {
      console.error("Error fetching airport:", error);
      res.status(500).json({ message: "Failed to fetch airport" });
    }
  });

  app.get("/api/reports/:code", async (req, res) => {
    try {
      const reports = await storage.getReportsByAirportCode(req.params.code);
      res.json(reports);
    } catch (error) {
      console.error("Error fetching reports:", error);
      res.status(500).json({ message: "Failed to fetch reports" });
    }
  });

  app.get("/api/checkpoints/:code", async (req, res) => {
    try {
      const stats = await storage.getCheckpointStats(req.params.code);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching checkpoint stats:", error);
      res.status(500).json({ message: "Failed to fetch checkpoint stats" });
    }
  });

  app.post("/api/reports", async (req, res) => {
    try {
      const parsed = insertWaitTimeReportSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid report data", errors: parsed.error.flatten() });
      }
      const report = await storage.createReport(parsed.data);
      res.status(201).json(report);
    } catch (error) {
      console.error("Error creating report:", error);
      res.status(500).json({ message: "Failed to create report" });
    }
  });
}
