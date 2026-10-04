import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { invalidate } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Cron de revalidation du catalogue (§14.8) : exécutable uniquement par le
 * cron Vercel, jamais par une route ouverte.
 * En-tête accepté : `authorization: Bearer ${CRON_SECRET}` ou `x-vercel-cron-secret`.
 */
function isAuthorized(request: Request): boolean | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null; // non configuré côté serveur

  const header = request.headers.get("authorization");
  const provided =
    header && header.toLowerCase().startsWith("bearer ")
      ? header.slice(7).trim()
      : (request.headers.get("x-vercel-cron-secret") ?? "");

  if (!provided) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

export async function GET(request: Request) {
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

  // Cache mémoire des listes/catalogues (§14.1) puis ISR des pages publiques.
  invalidate("series:");
  invalidate("recent-chapters:");
  revalidatePath("/");
  revalidatePath("/catalogue");

  return NextResponse.json({
    status: "ok",
    invalidated: ["series:", "recent-chapters:", "/", "/catalogue"],
    time: new Date().toISOString(),
  });
}
