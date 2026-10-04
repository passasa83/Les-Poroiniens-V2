import { getCurrentUser } from "@/lib/auth";
import { atLeast, can } from "@/lib/roles";
import { AccessDenied } from "@/components/ui/access-denied";
import { getDb, TABLES } from "@/lib/db";
import type { Comment, Profile, Role } from "@/lib/types";
import { UsersPanel, type UserRow } from "./_components/users-panel";

export const dynamic = "force-dynamic";

type ProfileRow = Profile & { banni?: boolean };

/** Gestion des utilisateurs (admin+ : ban, rôles ≤ Modo — §9.3). */
export default async function AdminUsersPage() {
  const user = await getCurrentUser();
  if (!user || !atLeast(user.role, "admin") || !can(user.role, "manage_users")) {
    return <AccessDenied required="admin" />;
  }

  const [profileRes, commentRes] = await Promise.all([
    getDb().list<ProfileRow>(TABLES.profiles, {
      order: { field: "date_inscription", dir: "desc" },
      limit: 500,
    }),
    getDb().list<Comment>(TABLES.comments, { limit: 5000 }),
  ]);

  const counts = new Map<string, number>();
  for (const comment of commentRes.items) {
    counts.set(comment.user_id, (counts.get(comment.user_id) ?? 0) + 1);
  }

  const rows: UserRow[] = profileRes.items.map((profile) => ({
    userId: profile.user_id,
    pseudo: profile.pseudo,
    role: (profile.role ?? "membre") as Role,
    dateInscription: profile.date_inscription,
    banni: Boolean(profile.banni),
    nbCommentaires: counts.get(profile.user_id) ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="section-title">Utilisateurs</h1>
        <p className="mt-1 text-sm text-muted">
          {rows.length} profil{rows.length > 1 ? "s" : ""} · Attribution des rôles Modérateur et
          Membre ; les rôles Administrateur et Gérant sont réservés au Gérant (§9.3).
        </p>
      </div>

      <UsersPanel rows={rows} me={{ id: user.id, role: user.role }} />
    </div>
  );
}
