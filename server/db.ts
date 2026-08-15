import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../shared/schema.js";

// On a serverless host each warm instance keeps its own pool, so keep it
// small and point DATABASE_URL at a pooled connection string (Neon's
// "-pooler" host) to avoid exhausting Postgres connections.
const isServerless = Boolean(process.env.VERCEL);

let instance: NodePgDatabase<typeof schema> | undefined;

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

function connect(): NodePgDatabase<typeof schema> {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Add it to the deployment's environment variables.",
    );
  }

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: isServerless ? 1 : 10,
    idleTimeoutMillis: isServerless ? 10_000 : 30_000,
    connectionTimeoutMillis: 10_000,
  });

  // A pool emits an error when the server drops an idle client. With no
  // listener attached Node treats that as an uncaught exception and kills
  // the process.
  pool.on("error", (err) => {
    console.error("Postgres pool error:", err);
  });

  return drizzle(pool, { schema });
}

// Connect on first use rather than at import time. Throwing while this module
// loads takes down every route in the deployment, including the health check
// whose whole job is to report the problem.
export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    if (!instance) {
      instance = connect();
    }
    return Reflect.get(instance as object, prop, receiver);
  },
});
