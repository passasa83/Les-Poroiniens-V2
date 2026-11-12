import { NextResponse } from "next/server";
import { allHistory } from "@/lib/data/history";
import { listLibrary } from "@/lib/data/library";
import { computeStats } from "@/lib/data/stats";
import { getProfile } from "@/lib/data/users";
import { listAll, TABLES } from "@/server/db";
import { route } from "@/server/http";

/** GET /api/account/export — export complet des données personnelles (RGPD). */
export const GET = route(
  {
    auth: "user",
    rateLimit: {
      key: "account:export",
      by: "ip+user",
      limit: 5,
      windowMs: 60_000,
      message: "Trop d'exports récents. Réessayez dans un instant.",
    },
  },
  async ({ user }) => {
    /* Export complet (RGPD) : tout l'historique et tous les commentaires,
       lus par lots — l'ancien plafond de 1000 lignes tronquait l'export. */
    const [profile, bibliotheque, historique, commentaires] = await Promise.all([
      getProfile(user.id),
      listLibrary(user.id),
      allHistory(user.id),
      listAll(TABLES.comments, {
        filters: [{ field: "user_id", op: "eq", value: user.id }],
        order: { field: "created_at", dir: "desc" },
      }),
    ]);
    const statistiques = computeStats(historique, bibliotheque);

    const day = new Date().toISOString().slice(0, 10);
    return NextResponse.json(
      {
        format: "poroiniens/export/v1",
        exporte_le: new Date().toISOString(),
        utilisateur: {
          id: user.id,
          pseudo: user.pseudo,
          email: user.email,
          role: user.role,
          adulte: user.adult_ok,
        },
        profil: profile,
        bibliotheque,
        historique,
        commentaires,
        statistiques,
      },
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="export-poroiniens-${day}.json"`,
          "Cache-Control": "no-store",
        },
      },
    );
  },
);
