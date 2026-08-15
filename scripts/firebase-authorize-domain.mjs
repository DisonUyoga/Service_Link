/**
 * Add production Vercel host to Firebase Auth authorized domains.
 * Usage: node scripts/firebase-authorize-domain.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "web", "package.json"));
const { GoogleAuth } = require("google-auth-library");

const envPath = path.join(root, "web", ".env.local");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m || process.env[m[1]] !== undefined) continue;
  let v = m[2];
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  process.env[m[1]] = v;
}

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "");
const projectId =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  process.env.FIREBASE_PROJECT_ID ||
  sa.project_id;

const domainsToAdd = ["service-link-mu.vercel.app", "localhost"];

const auth = new GoogleAuth({
  credentials: sa,
  scopes: [
    "https://www.googleapis.com/auth/identitytoolkit",
    "https://www.googleapis.com/auth/firebase",
    "https://www.googleapis.com/auth/cloud-platform",
  ],
});
const client = await auth.getClient();
const token = await client.getAccessToken();
if (!token.token) {
  console.error("No access token");
  process.exit(1);
}

const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`;
const getRes = await fetch(url, {
  headers: { Authorization: `Bearer ${token.token}` },
});
const getText = await getRes.text();
if (!getRes.ok) {
  console.error("GET_CONFIG_FAILED", getRes.status, getText.slice(0, 500));
  console.error("projectId", projectId, "saProject", sa.project_id);
  process.exit(1);
}
const config = JSON.parse(getText);
const existing = new Set(config.authorizedDomains || []);
const before = [...existing];
for (const d of domainsToAdd) existing.add(d);
const authorizedDomains = [...existing];

const patchRes = await fetch(url, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${token.token}`,
    "Content-Type": "application/json",
    // updateMask required by some Identity Toolkit versions
  },
  body: JSON.stringify({ authorizedDomains }),
});
const patchText = await patchRes.text();
if (!patchRes.ok) {
  // retry with updateMask query
  const patch2 = await fetch(`${url}?updateMask=authorizedDomains`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ authorizedDomains }),
  });
  const patch2Text = await patch2.text();
  if (!patch2.ok) {
    console.error("PATCH_FAILED", patchRes.status, patchText.slice(0, 400));
    console.error("PATCH2_FAILED", patch2.status, patch2Text.slice(0, 400));
    process.exit(1);
  }
  const updated = JSON.parse(patch2Text);
  console.log(
    JSON.stringify({
      projectId,
      added: domainsToAdd.filter((d) => !before.includes(d)),
      count: (updated.authorizedDomains || authorizedDomains).length,
      hasVercel: (updated.authorizedDomains || []).includes("service-link-mu.vercel.app"),
    }),
  );
  process.exit(0);
}

const updated = JSON.parse(patchText);
console.log(
  JSON.stringify({
    projectId,
    added: domainsToAdd.filter((d) => !before.includes(d)),
    count: (updated.authorizedDomains || authorizedDomains).length,
    hasVercel: (updated.authorizedDomains || authorizedDomains).includes(
      "service-link-mu.vercel.app",
    ),
  }),
);
