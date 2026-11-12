import { NextResponse } from "next/server";
import { z } from "zod";
import { adultGateAccepted } from "@/server/auth";
import { getChapterById } from "@/lib/data/chapters";
import { getSeriesById } from "@/lib/data/series";
import {
  canEditComment,
  createComment,
  listComments,
  updateComment,
  validateComment,
  type CommentThread,
} from "@/lib/data/comments";
import { notify } from "@/lib/data/notifications";
import { can } from "@/lib/roles";
import { getDb, listParValeurs, TABLES } from "@/server/db";
import type { Comment } from "@/lib/types";
import { fail, route } from "@/server/http";

export const runtime = "nodejs";

const CreateSchema = z.object({
  targetType: z.enum(["series", "chapter"]),
  targetId: z.string().min(1).max(64),
  parentId: z.string().min(1).max(64).nullable().optional(),
  contenu: z.string().min(1),
  spoiler: z.boolean().optional(),
});

function rejectionMessage(reason: string): string {
  switch (reason) {
    case "vide":
      return "Le commentaire ne peut pas être vide.";
    case "trop_long":
      return "Le commentaire dépasse 4 000 caractères.";
    case "doublon":
      return "Vous avez déjà publié ce commentaire.";
    case "trop_tot":
      return "Veuillez patienter quelques secondes avant de publier un nouveau commentaire.";
    case "lien":
      return "Les liens sont bloqués dans les commentaires des comptes récents.";
    default:
      return "Commentaire refusé.";
  }
}

async function targetInfo(
  targetType: "series" | "chapter",
  targetId: string,
): Promise<{ adult: boolean } | null> {
  if (targetType === "series") {
    const series = await getSeriesById(targetId);
    return series ? { adult: series.classification === "adult" } : null;
  }
  const chapter = await getChapterById(targetId);
  if (!chapter) return null;
  const series = await getSeriesById(chapter.series_id);
  return { adult: Boolean(series && series.classification === "adult") };
}

type ApiComment = CommentThread & {
  liked: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

/** Décors : liked / canEdit / canDelete. */
async function decorate(
  threads: CommentThread[],
  userId: string | null,
  moderate: boolean,
): Promise<ApiComment[]> {
  const liked = new Set<string>();
  if (userId) {
    /* Likes du membre sur les commentaires affichés seulement (avant : ses
       500 derniers likes, tous fils confondus — au-delà, les cœurs
       disparaissaient). */
    const ids: string[] = [];
    const collect = (list: CommentThread[]) =>
      list.forEach((t) => {
        ids.push(t.id);
        collect(t.children ?? []);
      });
    collect(threads);
    const items = await listParValeurs(TABLES.commentLikes, ids, "target_id", {
      filters: [{ field: "user_id", op: "eq", value: userId }],
      select: ["target_id"],
    });
    for (const l of items) liked.add(l.target_id);
  }

  const walk = (list: CommentThread[]): ApiComment[] =>
    list.map((t) => ({
      ...t,
      liked: liked.has(t.id),
      canEdit: userId ? canEditComment(t, userId) || moderate : false,
      canDelete: userId ? t.user_id === userId || moderate : false,
      children: walk(t.children ?? []),
    }));

  return walk(threads);
}

export const GET = route({ auth: "optional" }, async ({ user, searchParams }) => {
  const raw = searchParams.get("target") ?? "";
  const sep = raw.indexOf(":");
  const targetType = sep > 0 ? raw.slice(0, sep) : "";
  const targetId = sep > 0 ? raw.slice(sep + 1) : "";

  if ((targetType !== "series" && targetType !== "chapter") || !targetId) {
    fail(400, "Paramètre target invalide (format type:id).", "VALIDATION");
  }

  const info = await targetInfo(targetType, targetId);
  if (!info) {
    fail(404, "contenu introuvable", "NOT_FOUND");
  }

  if (info.adult && !(await adultGateAccepted())) {
    fail(403, "Ce contenu est réservé aux majeurs.", "ADULT_GATE");
  }

  const moderate = user ? can(user.role, "moderate") : false;
  const { roots, total } = await listComments(targetType, targetId);
  const comments = await decorate(roots, user ? user.id : null, moderate);

  return Response.json({ comments, total });
});

export const POST = route(
  {
    auth: "user",
    unauthorized: "Connexion requise pour commenter.",
    rateLimit: {
      key: "comment",
      by: "ip+user",
      limit: 10,
      windowMs: 60_000,
      message: "trop de commentaires envoyés",
    },
    body: CreateSchema,
    invalidBody: "corps invalide",
  },
  async ({ user, body }) => {
    const { targetType, targetId, parentId, contenu, spoiler } = body;

    const info = await targetInfo(targetType, targetId);
    if (!info) {
      fail(404, "contenu introuvable", "NOT_FOUND");
    }

    if (info.adult && !(await adultGateAccepted())) {
      fail(403, "Ce contenu est réservé aux majeurs.", "ADULT_GATE");
    }

    // Vérifie aussi l'existence du parent et son rattachement à la même cible.
    let parent: Comment | null = null;
    if (parentId) {
      parent = await getDb().get(TABLES.comments, parentId);
      if (!parent || parent.target_type !== targetType || parent.target_id !== targetId) {
        fail(404, "commentaire parent introuvable", "NOT_FOUND");
      }
    }

    const validation = await validateComment({
      userId: user.id,
      contenu,
      parentId: parent ? parent.id : null,
    });
    if (!validation.ok) {
      return NextResponse.json(
        { error: rejectionMessage(validation.reason), code: validation.reason.toUpperCase() },
        { status: 400 },
      );
    }

    const comment = await createComment({
      targetType,
      targetId,
      parentId: parent ? parent.id : null,
      userId: user.id,
      pseudo: user.pseudo,
      contenu: validation.contenu,
    });

    if (spoiler) {
      await updateComment(comment.id, { spoiler: true });
      comment.spoiler = true;
    }

    if (parent && parent.user_id !== user.id) {
      await notify(parent.user_id, "mention", {
        kind: "reply",
        commentId: comment.id,
        targetType,
        targetId,
        pseudo: user.pseudo,
        preview: comment.contenu.slice(0, 120),
      });
    }

    return NextResponse.json(
      {
        comment: {
          ...comment,
          liked: false,
          canEdit: true,
          canDelete: true,
          children: [],
        },
      },
      { status: 201 },
    );
  },
);
