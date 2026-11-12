import { getCurrentUser } from "@/server/auth";
import { atLeast, can } from "@/lib/roles";
import { AccessDenied } from "@/components/ui/access-denied";
import { listAll, TABLES } from "@/server/db";
import type { Role } from "@/lib/types";
import { UsersPanel, type UserRow } from "./_components/users-panel";

export const dynamic = "force-dynamic";

/** Gestion des utilisateurs (admin+ : ban, rôles ≤ Modo). */
export default async function AdminUsersPage() {
  const user = await getCurrentUser();
  if (!user || !atLeast(user.role, "admin") || !can(user.role, "manage_users")) {
    return <AccessDenied required="admin" />;
  }

  /* Tous les profils (avant : 500 au plus) ; commentaires réduits à la
     colonne auteur pour le compteur (avant : 5000 lignes complètes). */
  const [profils, auteurs] = await Promise.all([
    listAll(TABLES.profiles, {
      order: { field: "date_inscription", dir: "desc" },
      select: ["user_id", "pseudo", "role", "date_inscription", "banni"],
    }),
    listAll(TABLES.comments, { select: ["user_id"] }),
  ]);

  const counts = new Map<string, number>();
  for (const { user_id } of auteurs) counts.set(user_id, (counts.get(user_id) ?? 0) + 1);

  const rows: UserRow[] = profils.map((profile) => ({
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
          Membre ; les rôles Administrateur et Gérant sont réservés au Gérant.
        </p>
      </div>

      <UsersPanel rows={rows} me={{ id: user.id, role: user.role }} />
    </div>
  );
}
