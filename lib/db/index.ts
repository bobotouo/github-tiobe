import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let pgClient: postgres.Sql | null = null;
let dbClient: ReturnType<typeof drizzle<typeof schema>> | null = null;

function ensureClients() {
  if (pgClient && dbClient) return;
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) return;
  pgClient = postgres(connectionString, { prepare: false, max: 10 });
  dbClient = drizzle(pgClient, { schema });
}

export function requireDb() {
  ensureClients();
  if (!dbClient) {
    throw new Error("DATABASE_URL is not configured.");
  }
  return dbClient;
}

export function requirePg() {
  ensureClients();
  if (!pgClient) {
    throw new Error("DATABASE_URL is not configured.");
  }
  return pgClient;
}
