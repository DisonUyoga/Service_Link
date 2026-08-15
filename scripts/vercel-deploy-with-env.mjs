import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDir = path.join(root, "web");
const token = process.env.VERCEL_TOKEN;
if (!token) {
  console.error("VERCEL_TOKEN missing");
  process.exit(1);
}

function parseEnv(filePath) {
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

function run(args, opts = {}) {
  const res = spawnSync("npx", ["--yes", "vercel", ...args], {
    cwd: opts.cwd || webDir,
    env: { ...process.env, VERCEL_TOKEN: token },
    encoding: "utf8",
    shell: true,
    input: opts.input,
  });
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  if (res.status !== 0) {
    throw new Error(`vercel ${args.join(" ")} failed with ${res.status}`);
  }
  return res.stdout || "";
}

const env = parseEnv(path.join(webDir, ".env.local"));
const skip = new Set(["NODE_ENV"]);
const keys = Object.keys(env).filter((k) => !skip.has(k) && env[k] !== undefined && env[k] !== "");

console.log("Linking / creating Vercel project for web/ ...");
run(["link", "--yes", "--project", "service-link"]);

const targets = ["production", "preview", "development"];
for (const key of keys) {
  for (const target of targets) {
    console.log(`Setting ${key} (${target})`);
    // Remove existing quietly, then add
    spawnSync("npx", ["--yes", "vercel", "env", "rm", key, target, "--yes"], {
      cwd: webDir,
      env: { ...process.env, VERCEL_TOKEN: token },
      encoding: "utf8",
      shell: true,
    });
    const add = spawnSync(
      "npx",
      ["--yes", "vercel", "env", "add", key, target],
      {
        cwd: webDir,
        env: { ...process.env, VERCEL_TOKEN: token },
        encoding: "utf8",
        shell: true,
        input: `${env[key]}\n`,
      },
    );
    if (add.status !== 0) {
      console.error(`Failed ${key}@${target}:`, (add.stderr || add.stdout || "").slice(0, 300));
      process.exit(1);
    }
  }
}

console.log("Deploying production...");
const out = run(["deploy", "--prod", "--yes"]);
const urlMatch = out.match(/https:\/\/[^\s]+\.vercel\.app[^\s]*/);
if (urlMatch) {
  const url = urlMatch[0].replace(/\/$/, "");
  console.log("DEPLOY_URL", url);
  for (const target of targets) {
    spawnSync("npx", ["--yes", "vercel", "env", "rm", "NEXT_PUBLIC_APP_URL", target, "--yes"], {
      cwd: webDir,
      env: { ...process.env, VERCEL_TOKEN: token },
      encoding: "utf8",
      shell: true,
    });
    spawnSync("npx", ["--yes", "vercel", "env", "add", "NEXT_PUBLIC_APP_URL", target], {
      cwd: webDir,
      env: { ...process.env, VERCEL_TOKEN: token },
      encoding: "utf8",
      shell: true,
      input: `${url}\n`,
    });
  }
  console.log("Redeploying with NEXT_PUBLIC_APP_URL...");
  run(["deploy", "--prod", "--yes"]);
}

console.log("DEPLOY_DONE keys=", keys.length);
