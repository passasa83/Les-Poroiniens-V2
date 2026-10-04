import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createReport } from "@/lib/data/moderation";

export const runtime = "nodejs";

const ReportSchema = z.object({
  type: z.enum(["comment", "chapter", "series"]),
  targetId: z.string().min(1).max(64),
  raison: z.string().min(1).max(80),
  details: z.string().max(500).optional().default(""),
});

/** Signalements (§8.3 / §14) : membre connecté, 5 signalements / 10 min. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Vous devez être connecté pour signaler un problème.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const limit = rateLimit(`report:${clientIp(request)}:${user.id}`, {
    limit: 5,
    windowMs: 10 * 60_000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Trop de signalements. Réessayez plus tard.", code: "RATE_LIMIT" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "corps invalide", code: "VALIDATION" }, { status: 400 });
  }

  const parsed = ReportSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "corps invalide", code: "VALIDATION" }, { status: 400 });
  }

  const { type, targetId, raison, details } = parsed.data;

  const report = await createReport({
    type,
    target_id: targetId,
    reporter_id: user.id,
    raison: raison.trim(),
    details: details.trim(),
  });

  return NextResponse.json({ ok: true, report: { id: report.id } }, { status: 201 });
}
