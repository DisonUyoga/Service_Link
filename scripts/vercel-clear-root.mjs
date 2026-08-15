import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectMeta = JSON.parse(
  fs.readFileSync(path.join(root, "web", ".vercel", "project.json"), "utf8"),
);
const token = process.env.VERCEL_TOKEN;
if (!token) {
  console.error("VERCEL_TOKEN missing");
  process.exit(1);
}

const res = await fetch(
  `https://api.vercel.com/v9/projects/${projectMeta.projectId}?teamId=${projectMeta.orgId}`,
  {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      rootDirectory: null,
      framework: "nextjs",
    }),
  },
);
const text = await res.text();
if (!res.ok) {
  console.error("PATCH_FAILED", res.status, text.slice(0, 400));
  process.exit(1);
}
const data = JSON.parse(text);
console.log(
  JSON.stringify({
    name: data.name,
    rootDirectory: data.rootDirectory,
    framework: data.framework,
  }),
);
