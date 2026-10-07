import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

/** GET /api/me — identité de l'utilisateur connecté, jamais d'identité client. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentification requise.", code: "unauthorized" },
      { status: 401 },
    );
  }

  return NextResponse.json({
    id: user.id,
    pseudo: user.pseudo,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
    adult_ok: user.adult_ok,
    preferences: user.preferences,
  });
}
