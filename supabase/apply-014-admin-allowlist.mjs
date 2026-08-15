import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(root, "web", ".env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
}

const ref = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!ref || !token) throw new Error("Supabase management credentials are not configured");

const migration = fs.readFileSync(
  path.join(root, "supabase", "migrations", "014_admin_allowlist.sql"),
  "utf8",
);
const sql = `${migration}
insert into public.admin_allowlist (email)
values ('disonobudho233@gmail.com')
on conflict (email) do nothing;`;

const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});
if (!response.ok) throw new Error(`Migration failed: ${response.status} ${await response.text()}`);
console.log("ADMIN_ALLOWLIST_READY");
