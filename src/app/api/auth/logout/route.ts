import { NextResponse } from "next/server";
import { logout } from "@/lib/auth";

/** POST /api/auth/logout — destruction de la session (§14.2). */
export async function POST() {
  await logout();
  return NextResponse.json({ ok: true });
}
