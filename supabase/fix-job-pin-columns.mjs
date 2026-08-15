import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(root, "web", ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

const ref = process.env.SUPABASE_PROJECT_REF;
const token = process.env.SUPABASE_ACCESS_TOKEN;

async function run(query, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${label}: ${res.status} ${text}`);
  console.log(label, text.slice(0, 500));
  return text;
}

await run(
  `select column_name from information_schema.columns
   where table_schema='public' and table_name='job_requests'
     and column_name in ('access_notes','recipient_name','recipient_phone','place_id','formatted_address')
   order by 1`,
  "columns-before",
);

await run(
  `alter table public.job_requests
     add column if not exists recipient_name text not null default '',
     add column if not exists recipient_phone text not null default '',
     add column if not exists access_notes text not null default '',
     add column if not exists place_id text not null default '',
     add column if not exists formatted_address text not null default '';`,
  "ensure-columns",
);

await run(`notify pgrst, 'reload schema';`, "reload-schema-cache");

await run(
  `select column_name from information_schema.columns
   where table_schema='public' and table_name='job_requests'
     and column_name in ('access_notes','recipient_name','recipient_phone','place_id','formatted_address')
   order by 1`,
  "columns-after",
);

console.log("DONE");
