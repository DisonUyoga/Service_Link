/**
 * Apply supabase/migrations/*.sql (+ seed) against the hosted Postgres.
 *
 * Usage (PowerShell):
 *   $env:SUPABASE_DB_PASSWORD="your-db-password"
 *   node supabase/apply-migrations.mjs
 *
 * Or set DATABASE_URL to a full postgres connection string.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const projectRef = process.env.SUPABASE_PROJECT_REF || "ckruqpbkprhnfjalroha";

function loadEnvLocal() {
  const envPath = path.join(root, "web", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

loadEnvLocal();

function connectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!password) {
    throw new Error(
      "Set SUPABASE_DB_PASSWORD (Project Settings → Database) or DATABASE_URL",
    );
  }
  const encoded = encodeURIComponent(password);
  // Direct connection (IPv4). Pooler also works if direct is blocked.
  return (
    process.env.SUPABASE_DB_URL ||
    `postgresql://postgres:${encoded}@db.${projectRef}.supabase.co:5432/postgres`
  );
}

async function runFile(client, filePath) {
  const sql = fs.readFileSync(filePath, "utf8");
  const name = path.relative(root, filePath);
  process.stdout.write(`→ ${name} … `);
  await client.query(sql);
  console.log("ok");
}

async function main() {
  const client = new pg.Client({
    connectionString: connectionString(),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });

  await client.connect();
  console.log("Connected to Postgres");

  await client.query("create schema if not exists supabase_migrations");
  await client.query(`
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      name text not null,
      applied_at timestamptz not null default now()
    )
  `);

  const migDir = path.join(__dirname, "migrations");
  const files = fs
    .readdirSync(migDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    const { rows } = await client.query(
      "select 1 from supabase_migrations.schema_migrations where version = $1",
      [version],
    );
    if (rows.length) {
      console.log(`↻ ${file} (already applied)`);
      continue;
    }
    await client.query("begin");
    try {
      await runFile(client, path.join(migDir, file));
      await client.query(
        "insert into supabase_migrations.schema_migrations(version, name) values ($1, $2)",
        [version, file],
      );
      await client.query("commit");
    } catch (e) {
      await client.query("rollback");
      throw e;
    }
  }

  const seed = path.join(__dirname, "seed.sql");
  if (fs.existsSync(seed)) {
    await runFile(client, seed);
  }

  const { rows: cats } = await client.query(
    "select count(*)::int as n from public.service_categories",
  );
  const { rows: grants } = await client.query(`
    select grantee, string_agg(privilege_type, ', ' order by privilege_type) as privs
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'profiles'
      and grantee in ('anon','authenticated','service_role')
    group by grantee
    order by grantee
  `);

  console.log(`Categories seeded: ${cats[0].n}`);
  console.log("Profile grants:", grants);
  await client.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error("Migration failed:", err.message || err);
  process.exit(1);
});
