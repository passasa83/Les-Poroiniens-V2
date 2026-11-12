import { logout } from "@/server/auth";
import { route } from "@/server/http";

/** POST /api/auth/logout — destruction de la session. */
export const POST = route({}, async () => {
  await logout();
  return Response.json({ ok: true });
});
