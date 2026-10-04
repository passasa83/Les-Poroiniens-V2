import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { getSeriesById } from "@/lib/data/series";
import {
  getLibraryEntry,
  removeLibraryEntry,
  upsertLibraryEntry,
} from "@/lib/data/library";

export const runtime = "nodejs";

const BodySchema = z.object({
  seriesId: z.string().min(1),
  statut: z
    .enum(["en_cours", "a_lire", "termine", "en_pause", "abandonne"])
    .nullable()
    .optional(),
  favori: z.boolean().optional(),
  note: z.number().int().min(1).max(10).nullable().optional(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Connexion requise.", code: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }

  const ip = clientIp(request);
  const rl = await rateLimit(`follow:${user.id}:${ip ?? "?"}`, {
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Trop de requêtes. Réessayez dans un instant.", code: "RATE_LIMITED" },
      { status: 429 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corps de requête invalide.", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides.", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

  const { seriesId, statut, favori, note } = parsed.data;

  const series = await getSeriesById(seriesId);
  if (!series) {
    return NextResponse.json(
      { error: "Série introuvable.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  const existing = await getLibraryEntry(user.id, seriesId);

  const patch: Parameters<typeof upsertLibraryEntry>[2] = {};
  if (statut !== undefined && statut !== null) patch.statut = statut;
  if (favori !== undefined) patch.favori = favori;
  if (note !== undefined) patch.note = note;

  // Retrait : statut null = plus dans la bibliothèque (aucun autre champ envoyé).
  const wantsRemove =
    statut === null && favori === undefined && note === undefined;

  if (wantsRemove) {
    if (existing) {
      await removeLibraryEntry(user.id, seriesId);
    }
    return NextResponse.json({ ok: true, entry: null });
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "Aucune modification à enregistrer.", code: "VALIDATION" },
      { status: 400 },
    );
  }

  // Première note/favori sur une série non suivie : suivi implicite.
  if (!existing && patch.statut === undefined) {
    patch.statut = "en_cours";
  }

  await upsertLibraryEntry(user.id, seriesId, patch);

  const entry = await getLibraryEntry(user.id, seriesId);

  return NextResponse.json({
    ok: true,
    entry: entry
      ? { statut: entry.statut, favori: entry.favori, note: entry.note }
      : null,
  });
}
