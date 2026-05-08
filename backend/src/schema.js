import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hasDatabaseUrl, query } from "./db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(__dirname, "../schema.sql");

export async function ensureDatabaseSchema() {
  if (!hasDatabaseUrl()) return false;

  const schemaSql = await readFile(schemaPath, "utf8");
  await query(schemaSql);
  return true;
}
