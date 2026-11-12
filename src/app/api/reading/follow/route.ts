import { NextResponse } from "next/server";
import { z } from "zod";
import { getSeriesById } from "@/lib/data/series";
import { getLibraryEntry, removeLibraryEntry, upsertLibraryEntry } from "@/lib/data/library";
import { fail, route } from "@/server/http";

export const runtime = "nodejs";

const BodySchema = z.object({
  seriesId: z.string().min(1),
  statut: z.enum(["en_cours", "a_lire", "termine", "en_pause", "abandonne"]).nullable().optional(),
  favori: z.boolean().optional(),
  note: z.number().int().min(1).max(10).nullable().optional(),
});

export const POST = route(
  {
    auth: "user",
    rateLimit: { key: "follow", by: "ip+user", limit: 60, windowMs: 60_000 },
    body: BodySchema,
  },
  async ({ user, body }) => {
    const { seriesId, statut, favori, note } = body;

    const series = await getSeriesById(seriesId);
    if (!series) {
      fail(404, "Série introuvable.", "NOT_FOUND");
    }

    const existing = await getLibraryEntry(user.id, seriesId);

    const patch: Parameters<typeof upsertLibraryEntry>[2] = {};
    if (statut !== undefined && statut !== null) patch.statut = statut;
    if (favori !== undefined) patch.favori = favori;
    if (note !== undefined) patch.note = note;

    // Retrait : statut null = plus dans la bibliothèque (aucun autre champ envoyé).
    const wantsRemove = statut === null && favori === undefined && note === undefined;

    if (wantsRemove) {
      if (existing) {
        await removeLibraryEntry(user.id, seriesId);
      }
      return NextResponse.json({ ok: true, entry: null });
    }

    if (Object.keys(patch).length === 0) {
      fail(400, "Aucune modification à enregistrer.", "VALIDATION");
    }

    // Première note/favori sur une série non suivie : suivi implicite.
    if (!existing && patch.statut === undefined) {
      patch.statut = "en_cours";
    }

    await upsertLibraryEntry(user.id, seriesId, patch);

    const entry = await getLibraryEntry(user.id, seriesId);

    return NextResponse.json({
      ok: true,
      entry: entry ? { statut: entry.statut, favori: entry.favori, note: entry.note } : null,
    });
  },
);
