import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { pool } from "../db/pool.js";

async function run(): Promise<void> {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const schemaPath = resolve(currentDir, "../db/schema.sql");
  const sql = await readFile(schemaPath, "utf8");
  await pool.query(sql);
  await pool.end();
  console.log("Database schema applied.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
