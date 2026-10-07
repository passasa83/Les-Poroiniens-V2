import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { notify } from "@/lib/data/moderation";
import { countRecentImageErrors } from "@/lib/data/image-errors";
import { listProfiles } from "@/lib/data/users";
import { imageEnv } from "@/lib/media";
import { nasConfigured, nasHealth } from "@/lib/nas";

export const runtime = "nodejs";

/** Seuil d'alerte sur les erreurs d'images des 48 dernières heures. */
const IMAGE_ERROR_ALERT = Number(process.env.IMAGE_ERROR_ALERT ?? 20);
/** Espace disque libre minimal avant alerte, en pourcentage. */
const DISK_FREE_MIN_PCT = 15;

/** Même contrôle de secret que /api/cron/revalidate. */
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

async function notifyOwners(reason: string): Promise<number> {
  try {
    const owners = (await listProfiles(500)).filter((p) => p.role === "owner");
    const payload = {
      titre: "Alerte système d'images",
      message: `La supervision a détecté un problème (${reason}). Voir la page d'administration pour le détail.`,
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

/**
 * Supervision du système d'images : API du NAS (disponibilité, temps
 * de réponse, espace disque) et erreurs remontées par le lecteur.
 */
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

  const time = new Date().toISOString();
  const env = imageEnv();

  if (!nasConfigured()) {
    return NextResponse.json({
      status: "skipped",
      reason: "nas_not_configured",
      env: { IMG_BASE_URL: env.imgBase, NAS_API_BASE: env.nasApiBase },
      time,
    });
  }

  const [health, imageErrors] = await Promise.all([
    nasHealth(),
    countRecentImageErrors().catch(() => ({ total: 0, byChapter: 0 })),
  ]);

  const reasons: string[] = [];
  if (!health.ok) reasons.push(health.reason ?? "nas_unreachable");
  if (typeof health.diskFreePct === "number" && health.diskFreePct < DISK_FREE_MIN_PCT) {
    reasons.push(`disk_low_${health.diskFreePct}`);
  }
  if (imageErrors.total >= IMAGE_ERROR_ALERT) {
    reasons.push(`image_errors_${imageErrors.total}`);
  }

  const payload = {
    status: reasons.length === 0 ? "ok" : "error",
    nas: health.ok ? "ok" : (health.reason ?? "unreachable"),
    latencyMs: health.latencyMs ?? null,
    diskFreePct: health.diskFreePct ?? null,
    imageErrors,
    reasons,
    time,
  };

  if (reasons.length === 0) return NextResponse.json(payload);

  const notified = await notifyOwners(reasons.join(", "));
  return NextResponse.json({ ...payload, notified });
}
