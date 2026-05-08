import dotenv from "dotenv";
import { closePool } from "../src/db.js";
import { ensureDatabaseSchema } from "../src/schema.js";

dotenv.config();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required to run database migrations.");
  process.exit(1);
}

try {
  await ensureDatabaseSchema();
  console.log("Database schema and seed data are up to date.");
} catch (error) {
  console.error("Database migration failed:");
  console.error(error);
  process.exitCode = 1;
} finally {
  await closePool();
}
