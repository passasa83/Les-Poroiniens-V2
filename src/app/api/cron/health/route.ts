import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { notify } from "@/lib/data/moderation";
import { listProfiles } from "@/lib/data/users";

export const runtime = "nodejs";

const CHECK_TIMEOUT_MS = 5_000;

/** Même contrôle de secret que /api/cron/revalidate (§14.8). */
function isAuthorized(request: Request): boolean | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;

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

/** Vérifie que l'API du NAS répond (§5.3 : alerte si l'API ne répond plus). */
async function checkNas(): Promise<{ ok: boolean; reason?: string }> {
  const base = process.env.NAS_API_URL;
  if (!base) return { ok: false, reason: "nas_not_configured" };

  const key = process.env.NAS_API_KEY;
  try {
    const res = await fetch(base.replace(/\/$/, ""), {
      method: "GET",
      headers: key ? { "x-api-key": key } : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    // Une réponse reçue (hors erreur serveur) signifie que l'API est en service.
    if (res.status >= 500) return { ok: false, reason: `http_${res.status}` };
    return { ok: true };
  } catch (error) {
    const timedOut =
      error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return { ok: false, reason: timedOut ? "timeout" : "unreachable" };
  }
}

async function notifyOwners(reason: string): Promise<number> {
  try {
    const owners = (await listProfiles(500)).filter((p) => p.role === "owner");
    const payload = {
      titre: "API du NAS injoignable",
      message: `La vérification d'intégrité de l'API des scans a échoué (${reason}). Les pages de scans peuvent être indisponibles.`,
      raison: reason,
      lien: "/admin",
    };
    await Promise.all(owners.map((o) => notify(o.user_id, "system", payload)));
    return owners.length;
  } catch {
    // Base de notifications indisponible : laissé au prochain passage du cron.
    return 0;
  }
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

  if (!process.env.NAS_API_URL) {
    return NextResponse.json({ status: "skipped", reason: "nas_not_configured" });
  }

  const check = await checkNas();
  const time = new Date().toISOString();

  if (check.ok) {
    return NextResponse.json({ status: "ok", nas: "ok", time });
  }

  const notified = await notifyOwners(check.reason ?? "unreachable");
  return NextResponse.json({
    status: "error",
    nas: check.reason ?? "unreachable",
    notified,
    time,
  });
}
