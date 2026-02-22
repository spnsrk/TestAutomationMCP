import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb(dbPath = "./data/tamcp.db") {
  if (db) return db;

  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'uploaded',
      raw_content TEXT,
      parsed_requirements TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS test_plans (
      id TEXT PRIMARY KEY,
      document_id TEXT REFERENCES documents(id),
      status TEXT NOT NULL DEFAULT 'draft',
      plan_json TEXT NOT NULL,
      requirements_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS test_definitions (
      id TEXT PRIMARY KEY,
      test_plan_id TEXT REFERENCES test_plans(id),
      name TEXT NOT NULL,
      definition_yaml TEXT NOT NULL,
      definition_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS test_runs (
      id TEXT PRIMARY KEY,
      test_plan_id TEXT REFERENCES test_plans(id),
      status TEXT NOT NULL DEFAULT 'queued',
      environment TEXT NOT NULL DEFAULT 'default',
      parallel INTEGER DEFAULT 0,
      started_at TEXT,
      finished_at TEXT,
      results_summary_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS test_results (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES test_runs(id),
      test_id TEXT NOT NULL,
      test_name TEXT NOT NULL,
      status TEXT NOT NULL,
      duration INTEGER NOT NULL DEFAULT 0,
      result_json TEXT NOT NULL,
      analysis_json TEXT,
      created_at TEXT NOT NULL
    );
  `);

  db = drizzle(sqlite, { schema });
  return db;
}
