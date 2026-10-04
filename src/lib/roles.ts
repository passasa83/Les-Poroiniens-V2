import type { Role } from "@/lib/types";

/** Rang minimal (section 14.6 du cahier des charges). */
export const ROLE_RANK: Record<Role, number> = {
  visiteur: 0,
  membre: 1,
  modo: 2,
  admin: 3,
  owner: 4,
};

export function atLeast(role: Role | undefined, min: Role): boolean {
  return ROLE_RANK[role ?? "visiteur"] >= ROLE_RANK[min];
}

export const ROLE_LABELS: Record<Role, string> = {
  visiteur: "Visiteur",
  membre: "Membre",
  modo: "Modérateur",
  admin: "Administrateur",
  owner: "Gérant",
};

/**
 * Matrice des droits (section 4.3).
 * `owner` couvre tout ; les actions marquées « Gérant uniquement » ne sont
 * jamais accordées à `admin`, même quand elles semblent proches.
 */
export const PERMISSIONS = {
  read: ["visiteur", "membre", "modo", "admin", "owner"],
  library: ["membre", "modo", "admin", "owner"],
  comment: ["membre", "modo", "admin", "owner"],
  moderate: ["modo", "admin", "owner"],
  edit_series: ["admin", "owner"],
  manage_recommendations: ["admin", "owner"],
  manage_users: ["admin", "owner"],
  /** Cloisonnement Gérant : import de chapitres — admin exclu. */
  import_chapters: ["owner"],
  publish_chapter: ["owner"],
  connect_drive: ["owner"],
  name_admin: ["owner"],
  full_audit: ["owner"],
  site_settings: ["owner"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | undefined, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(
    (role ?? "visiteur") as Role,
  );
}
