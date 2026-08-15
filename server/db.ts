import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

// On a serverless host each warm instance keeps its own pool, so keep it
// small and point DATABASE_URL at a pooled connection string (Neon's
// "-pooler" host) to avoid exhausting Postgres connections.
const isServerless = Boolean(process.env.VERCEL);

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: isServerless ? 1 : 10,
  idleTimeoutMillis: isServerless ? 10_000 : 30_000,
  connectionTimeoutMillis: 10_000,
});

export const db = drizzle(pool, { schema });
