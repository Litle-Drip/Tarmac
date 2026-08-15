import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { sql } from "drizzle-orm";
import { db } from "./db.js";
import { refreshBaselineCache } from "./baselines.js";

/**
 * Applies migrations/setup.sql.
 *
 * That file is the single definition of the schema and the seed data — the
 * same one people paste into the Neon SQL editor when they set up without a
 * terminal. Keeping one copy means the two paths cannot drift apart, which is
 * what previously left the SQL seed staggering its timestamps correctly while
 * the TypeScript seed dropped the offset and wrote everything at `now()`.
 *
 * It is idempotent: safe to run against a fresh database or an existing one.
 */
export async function seedDatabase(): Promise<void> {
  const setupPath = resolveSetupPath();
  const setupSql = await readFile(setupPath, "utf-8");

  console.log(`Applying ${path.relative(process.cwd(), setupPath)}...`);
  await db.execute(sql.raw(setupSql));

  await refreshBaselineCache();
  console.log("Schema and seed data are up to date.");
}

function resolveSetupPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "migrations", "setup.sql");
}
