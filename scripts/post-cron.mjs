#!/usr/bin/env node
/**
 * Appelle une route cron du site local avec le secret CRON_SECRET.
 *   node scripts/post-cron.mjs seed
 *   node scripts/post-cron.mjs revalidate
 */
import { readFileSync, existsSync } from "node:fs";
import http from "node:http";
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

/**
 * Requête POST sans délai caché : `fetch` (undici) abandonne après 300 s
 * (`headersTimeout`), alors qu'une graine complète peut d'avantage — d'où des
 * `UND_ERR_HEADERS_TIMEOUT` successifs. `node:http` n'a que le délai qu'on lui
 * donne, et on relance ensuite (la graine est idempotente : elle crée puis
 * signale les doublons comme « ignorés »).
 */
function post(url, authorization, timeoutMs) {
  return new Promise((resolvePost, reject) => {
    const req = http.request(
      url,
      { method: "POST", headers: { authorization }, timeout: timeoutMs },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolvePost({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("délai dépassé")));
    req.on("error", reject);
    req.end();
  });
}

const url = `${base}/api/cron/${target}`;
const DELAI_MS = 15 * 60_000;
const TENTATIVES = target === "seed" ? 3 : 1;

let dernier = null;
for (let tentative = 1; tentative <= TENTATIVES; tentative++) {
  try {
    dernier = await post(url, `Bearer ${secret}`, DELAI_MS);
    console.log(
      `→ POST /api/cron/${target} → ${dernier.status} (tentative ${tentative}/${TENTATIVES})`,
    );
    console.log(dernier.body);
    // 2xx : terminé. 4xx : inutile de relancer (secret refusé, corps invalide).
    if (dernier.status < 500) break;
  } catch (err) {
    console.warn(
      `… tentative ${tentative}/${TENTATIVES} interrompue (${err.message}) — relance, la graine reprend où elle en était.`,
    );
    dernier = null;
  }
}

if (!dernier) {
  console.error("✖ aucune réponse du site local : vérifier `npm run dev`");
  process.exit(1);
}
process.exit(dernier.status >= 200 && dernier.status < 300 ? 0 : 1);
