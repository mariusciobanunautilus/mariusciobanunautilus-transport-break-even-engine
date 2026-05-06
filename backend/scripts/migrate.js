import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(__dirname, "../schema.sql");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required to run database migrations.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false
});

try {
  const schemaSql = await readFile(schemaPath, "utf8");
  await pool.query(schemaSql);
  console.log("Database schema and seed data are up to date.");
} catch (error) {
  console.error("Database migration failed:");
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
