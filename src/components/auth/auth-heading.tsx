import type { ReactNode } from "react";

/**
 * Titre d'un panneau d'authentification.
 * `none` : le titre est déjà porté par la modale (évite un double titre et
 * préserve « un seul `<h1>` » par page, §8.1).
 */
export type AuthHeadingLevel = "h1" | "h2" | "none";

export function AuthHeading({
  level,
  children,
}: {
  level: AuthHeadingLevel;
  children: ReactNode;
}) {
  if (level === "none") return null;
  const Tag = level;
  return <Tag className="text-2xl font-black tracking-tight text-fg">{children}</Tag>;
}
