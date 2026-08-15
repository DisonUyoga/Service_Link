/**
 * Sync NEXT_PUBLIC_FIREBASE_* from CLI args / hardcoded update into .env.local + Vercel.
 * Does not print secret values.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, "web", ".env.local");
const token = process.env.VERCEL_TOKEN;

const updates = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "AIzaSyAsVe-waXfz6vhLVn9Pbrbk2DjhvuXtdIs",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "fir-link-2c5fc.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "fir-link-2c5fc",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "fir-link-2c5fc.firebasestorage.app",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "936730430091",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:936730430091:web:ce926af6782fc0908d228e",
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: "G-YBL4DESHC1",
};

let text = fs.readFileSync(envPath, "utf8");
const missing = [];
for (const [key, value] of Object.entries(updates)) {
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(text)) {
    text = text.replace(re, `${key}=${value}`);
  } else {
    missing.push(key);
    text += `\n${key}=${value}`;
  }
}
fs.writeFileSync(envPath, text.endsWith("\n") ? text : text + "\n");
console.log("LOCAL_UPDATED", Object.keys(updates).length, "appended", missing.length);

if (!token) {
  console.log("SKIP_VERCEL_NO_TOKEN");
  process.exit(0);
}

const webDir = path.join(root, "web");
const targets = ["production", "preview", "development"];
for (const [key, value] of Object.entries(updates)) {
  for (const target of targets) {
    spawnSync("npx", ["--yes", "vercel", "env", "rm", key, target, "--yes"], {
      cwd: webDir,
      env: { ...process.env, VERCEL_TOKEN: token },
      encoding: "utf8",
      shell: true,
    });
    const add = spawnSync("npx", ["--yes", "vercel", "env", "add", key, target], {
      cwd: webDir,
      env: { ...process.env, VERCEL_TOKEN: token },
      encoding: "utf8",
      shell: true,
      input: `${value}\n`,
    });
    if (add.status !== 0) {
      console.error("FAIL", key, target, (add.stderr || add.stdout || "").slice(0, 200));
      process.exit(1);
    }
  }
  console.log("VERCEL_SET", key);
}
console.log("DONE");
