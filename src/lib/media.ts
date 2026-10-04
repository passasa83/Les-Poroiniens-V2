import "server-only";
import { createHmac } from "node:crypto";
import type { ScanPage } from "@/lib/types";

/**
 * Résolution des URLs de pages de scans (§5.3 et §14.7).
 * - Mode démo : chemin local servi par /api/img/page.
 * - Prod : URL signée à durée courte vers le CDN qui devance le NAS.
 * Aucun octet d'image ne transite par les fonctions Vercel.
 */
export function pageUrl(page: Pick<ScanPage, "chemin">): string {
  const path = page.chemin;
  if (path.startsWith("/") || path.startsWith("data:")) return path; // local / démo

  const cdn = process.env.CDN_BASE_URL;
  if (cdn) {
    const exp = Math.floor(Date.now() / 1000) + 300; // 5 minutes
    const sig = sign(`${path}|${exp}`);
    return `${cdn.replace(/\/$/, "")}/${path.replace(/^\//, "")}?exp=${exp}&sig=${sig}`;
  }
  // Pas de CDN : proxy local (uniquement en interne, jamais en prod)
  return `/api/image?path=${encodeURIComponent(path)}`;
}

function sign(payload: string): string {
  const key = process.env.AUTH_SECRET || "dev-secret-a-changer";
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function verifySignature(path: string, exp: string, sig: string): boolean {
  if (Number(exp) * 1000 < Date.now()) return false;
  const expected = sign(`${path}|${exp}`);
  return expected === sig;
}
