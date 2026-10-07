import Link from "next/link";
import { AtSign, MessageCircle, Video, type LucideIcon } from "lucide-react";
import { RankList } from "@/components/home/rank-list";
import type { Series } from "@/lib/types";

/** Réseaux saisis par le Gérant (Paramètres du site), un seul fichier de code. */
const SOCIALS: Array<{ key: string; label: string; icon: LucideIcon }> = [
  { key: "social_discord", label: "Discord", icon: MessageCircle },
  { key: "social_youtube", label: "YouTube", icon: Video },
  { key: "social_x", label: "X (Twitter)", icon: AtSign },
];

/** Seules les URL http(s) valides deviennent des liens (saisie admin). */
function safeUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Colonne latérale « Nouveautés » : Communauté, annonces internes et
 * « Les plus lus ». Masquée quand rien n'a à y être affiché.
 */
export function UpdatesSidebar({
  settings,
  popular,
  adultAllowed,
}: {
  settings: Record<string, string>;
  popular: Series[];
  adultAllowed: boolean;
}) {
  const links = SOCIALS.flatMap((s) => {
    const href = safeUrl(settings[s.key]);
    return href ? [{ ...s, href }] : [];
  });
  const announcement = settings.announcement?.trim();
  const showPopular = popular.length > 0;

  if (links.length === 0 && !announcement && !showPopular) return null;

  return (
    <aside className="space-y-6" aria-label="Compléments">
      {links.length > 0 && (
        <section className="card p-4">
          <h2 className="section-title text-center">Communauté</h2>
          <div className="mt-3 flex flex-wrap justify-center gap-3">
            {links.map(({ key, label, href, icon: Icon }) => (
              <a
                key={key}
                href={href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                aria-label={`Nous rejoindre sur ${label}`}
                title={label}
                className="grid size-11 place-items-center rounded-full border border-line text-muted transition-colors hover:border-accent hover:text-fg"
              >
                <Icon className="size-5" aria-hidden />
              </a>
            ))}
          </div>
        </section>
      )}

      {announcement && (
        <section className="card p-4">
          <h2 className="section-title">Annonce</h2>
          <p className="meta mt-2">{announcement}</p>
        </section>
      )}

      {showPopular && (
        <section>
          <div className="flex items-center justify-between">
            <h2 className="section-title">Les plus lus</h2>
            <Link
              href="/catalogue?sort=popularite"
              className="link-muted inline-flex min-h-11 items-center text-sm"
            >
              Voir tout →
            </Link>
          </div>
          <div className="mt-3">
            <RankList series={popular} adultAllowed={adultAllowed} columns={1} />
          </div>
        </section>
      )}
    </aside>
  );
}
