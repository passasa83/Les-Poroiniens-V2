import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { appwriteEnabled, getDb, invalidate, TABLES } from "@/lib/db";
import { getDemoStore } from "@/lib/db/seed";

export const runtime = "nodejs";

/**
 * Chargement du catalogue de démonstration dans Appwrite (une seule fois).
 * Protégé par CRON_SECRET, même mécanisme que /api/cron/revalidate.
 */
function isAuthorized(request: Request): boolean | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;
  const header = request.headers.get("authorization");
  const provided =
    header && header.toLowerCase().startsWith("bearer ")
      ? header.slice(7).trim()
      : (request.headers.get("x-vercel-cron-secret") ?? "");
  if (!provided) return false;
  return timingSafeEqual(
    createHash("sha256").update(provided).digest(),
    createHash("sha256").update(secret).digest(),
  );
}

/** Les objets JSON sont stockés en texte (colonnes longtext). */
function serialize(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      out[key] = JSON.stringify(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export async function POST(request: Request) {
  const authorized = isAuthorized(request);
  if (authorized === null) {
    return NextResponse.json(
      { error: "cron_disabled", code: "CRON_SECRET_MISSING" },
      { status: 503 },
    );
  }
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized", code: "CRON_SECRET_INVALID" }, { status: 401 });
  }
  if (!appwriteEnabled()) {
    return NextResponse.json(
      { error: "appwrite_not_configured", code: "NO_API_KEY" },
      { status: 409 },
    );
  }

  const db = getDb();
  const demo = getDemoStore();
  const created: Record<string, number> = {};
  const skipped: Record<string, number> = {};
  const failures: string[] = [];

  // `users` n'existe pas côté Appwrite (Appwrite Auth gère les comptes).
  // Écriture en parallèle borné : en séquentiel, une graine complète (pages
  // comprises) dépassait les 15 min d'attente de `post-cron.mjs`.
  const CONCURRENCE = 12;
  for (const [table, rows] of Object.entries(demo)) {
    if (table === TABLES.users) continue;
    let count = 0;
    let skip = 0;
    const toutes = [...rows.values()];
    const portion = Math.ceil(toutes.length / CONCURRENCE);
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCE, toutes.length) }, (_, i) =>
        toutes.slice(i * portion, (i + 1) * portion),
      ).map(async (lot) => {
        for (const row of lot) {
          const id = String(row.id);
          // une table absente ou une ligne illisible ne doit pas masquer le reste
          const existing = await db.get(table, id).catch(() => null);
          if (existing) {
            skip += 1;
            continue;
          }
          try {
            await db.create(table, id, serialize(row));
            count += 1;
          } catch (err) {
            // une ligne en conflit (pseudo unique…) ne doit pas bloquer la suite
            const message = (err as Error).message ?? String(err);
            console.error(`seed ${table}/${id}:`, message);
            if (failures.length < 20) failures.push(`${table}/${id} : ${message}`);
          }
        }
      }),
    );
    created[table] = count;
    skipped[table] = skip;
  }

  invalidate("series:");
  invalidate("recent-chapters:");
  invalidate("stats:");

  return NextResponse.json({ status: "ok", created, skipped, failures });
}
