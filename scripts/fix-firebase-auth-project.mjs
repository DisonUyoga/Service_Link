import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDir = path.join(root, "web");
const token = process.env.VERCEL_TOKEN;
if (!token) {
  console.error("VERCEL_TOKEN missing");
  process.exit(1);
}

// Restore the FCM/Admin project and trust both Auth projects for ID tokens.
const updates = {
  FIREBASE_PROJECT_ID: "delivery-app-live-tracking-a1",
  FIREBASE_AUTH_PROJECT_IDS: "fir-link-2c5fc,delivery-app-live-tracking-a1",
};
const removals = ["FIREBASE_AUTH_PROJECT_ID"];

const envPath = path.join(webDir, ".env.local");
let text = fs.readFileSync(envPath, "utf8");
for (const key of removals) {
  text = text.replace(new RegExp(`^${key}=.*$\\r?\\n?`, "m"), "");
}
for (const [key, value] of Object.entries(updates)) {
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(text)) text = text.replace(re, `${key}=${value}`);
  else text += `\n${key}=${value}`;
}
fs.writeFileSync(envPath, text.endsWith("\n") ? text : `${text}\n`);

const targets = ["production", "preview", "development"];
function vercel(args, input) {
  return spawnSync("npx", ["--yes", "vercel", ...args], {
    cwd: webDir,
    env: { ...process.env, VERCEL_TOKEN: token },
    encoding: "utf8",
    shell: true,
    input,
  });
}

for (const key of removals) {
  for (const target of targets) vercel(["env", "rm", key, target, "--yes"]);
  console.log("REMOVED", key);
}

for (const [key, value] of Object.entries(updates)) {
  for (const target of targets) {
    vercel(["env", "rm", key, target, "--yes"]);
    const add = vercel(["env", "add", key, target], `${value}\n`);
    if (add.status !== 0) {
      console.error("FAIL", key, target);
      process.exit(1);
    }
  }
  console.log("SET", key);
}
console.log("ENV_OK");
