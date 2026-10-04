#!/usr/bin/env node
/**
 * Appelle une route cron du site local avec le secret CRON_SECRET.
 *   node scripts/post-cron.mjs seed
 *   node scripts/post-cron.mjs revalidate
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const envFile = resolve(process.cwd(), ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const target = process.argv[2] || "seed";
const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const secret = process.env.CRON_SECRET;

if (!secret) {
  console.error("✖ CRON_SECRET absent de .env.local");
  process.exit(1);
}

const res = await fetch(`${base}/api/cron/${target}`, {
  method: "POST",
  headers: { authorization: `Bearer ${secret}` },
});
const body = await res.text();
console.log(`→ POST /api/cron/${target} → ${res.status}`);
console.log(body);
process.exit(res.ok ? 0 : 1);
