import { NextResponse } from "next/server";
import { route } from "@/server/http";

/** GET /api/me — identité de l'utilisateur connecté, jamais d'identité client. */
export const GET = route({ auth: "user" }, async ({ user }) => {
  return NextResponse.json({
    id: user.id,
    pseudo: user.pseudo,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    adult_ok: user.adult_ok,
    preferences: user.preferences,
  });
});
