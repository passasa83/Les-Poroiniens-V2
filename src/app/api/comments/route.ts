import { NextResponse } from "next/server";
import { z } from "zod";
import { adultGateAccepted, getCurrentUser } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
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
import { notify } from "@/lib/data/moderation";
import { can } from "@/lib/roles";
import { getDb, TABLES } from "@/lib/db";
import type { Comment } from "@/lib/types";

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

/** Décors : liked / canEdit / canDelete (§8). */
async function decorate(
  threads: CommentThread[],
  userId: string | null,
  moderate: boolean,
): Promise<ApiComment[]> {
  const liked = new Set<string>();
  if (userId) {
    const { items } = await getDb().list<{ target_id: string }>(TABLES.commentLikes, {
      filters: [{ field: "user_id", op: "eq", value: userId }],
      limit: 500,
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("target") ?? "";
  const sep = raw.indexOf(":");
  const targetType = sep > 0 ? raw.slice(0, sep) : "";
  const targetId = sep > 0 ? raw.slice(sep + 1) : "";

  if ((targetType !== "series" && targetType !== "chapter") || !targetId) {
    return NextResponse.json(
      { error: "Paramètre target invalide (format type:id).", code: "VALIDATION" },
      { status: 400 },
    );
  }

  const info = await targetInfo(targetType, targetId);
  if (!info) {
    return NextResponse.json(
      { error: "contenu introuvable", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  if (info.adult && !(await adultGateAccepted())) {
    return NextResponse.json(
      { error: "Ce contenu est réservé aux majeurs.", code: "ADULT_GATE" },
      { status: 403 },
    );
  }

  const user = await getCurrentUser();
  const moderate = user ? can(user.role, "moderate") : false;
  const { roots, total } = await listComments(targetType, targetId);
  const comments = await decorate(roots, user ? user.id : null, moderate);

  return NextResponse.json({ comments, total });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Connexion requise pour commenter.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const limit = rateLimit(`comment:${clientIp(request)}:${user.id}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "trop de commentaires envoyés", code: "RATE_LIMIT" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "corps invalide", code: "VALIDATION" }, { status: 400 });
  }

  const parsed = CreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "corps invalide", code: "VALIDATION" }, { status: 400 });
  }

  const { targetType, targetId, parentId, contenu, spoiler } = parsed.data;

  const info = await targetInfo(targetType, targetId);
  if (!info) {
    return NextResponse.json(
      { error: "contenu introuvable", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  if (info.adult && !(await adultGateAccepted())) {
    return NextResponse.json(
      { error: "Ce contenu est réservé aux majeurs.", code: "ADULT_GATE" },
      { status: 403 },
    );
  }

  // Vérifie aussi l'existence du parent et son rattachement à la même cible.
  let parent: Comment | null = null;
  if (parentId) {
    parent = await getDb().get<Comment>(TABLES.comments, parentId);
    if (!parent || parent.target_type !== targetType || parent.target_id !== targetId) {
      return NextResponse.json(
        { error: "commentaire parent introuvable", code: "NOT_FOUND" },
        { status: 404 },
      );
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
}
