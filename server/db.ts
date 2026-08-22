import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Idle pooled connections can be dropped at any time (Neon autosuspend,
// network blips, etc.) — the pg/neon Pool emits an 'error' event for this on
// the pool itself, and Node's EventEmitter throws (crashing the whole
// process) if nothing is listening for it. This alone kept the server up
// through such a drop during testing.
pool.on('error', (err) => {
  console.error('Unexpected error on idle database client:', err);
});

export const db = drizzle({ client: pool, schema });