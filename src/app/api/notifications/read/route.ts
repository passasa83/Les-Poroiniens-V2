import { NextResponse } from "next/server";
import { markNotificationsRead } from "@/lib/data/notifications";
import { route } from "@/server/http";

/** POST /api/notifications/read — marque toutes les notifications comme lues. */
export const POST = route(
  {
    auth: "user",
    rateLimit: { key: "notifications", by: "ip+user", limit: 30, windowMs: 60_000 },
  },
  async ({ user }) => {
    await markNotificationsRead(user.id);
    return NextResponse.json({ ok: true });
  },
);
