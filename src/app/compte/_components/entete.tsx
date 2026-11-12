import Link from "next/link";
import { CalendarDays, ChartColumn } from "lucide-react";
import { Badge } from "@/components/ui/kit";
import { ROLE_LABELS } from "@/lib/roles";
import type { CurrentUser, Profile } from "@/lib/types";
import { dateInscription } from "../_lib/dates";

/** En-tête de /compte (rendu serveur) : avatar, rôle, inscription, liens. */
export function CompteEntete({ user, profile }: { user: CurrentUser; profile: Profile }) {
  return (
    <header className="card flex flex-wrap items-center gap-5 p-6">
      <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-surface2 text-base font-black text-primary">
        {profile.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar}
            alt={`Avatar de ${profile.pseudo}`}
            width={64}
            height={64}
            className="size-16 object-cover"
          />
        ) : (
          profile.pseudo.slice(0, 2).toUpperCase()
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-black tracking-tight text-fg">Mon compte</h1>
          <Badge tone={user.role === "membre" ? "neutral" : "primary"}>
            {ROLE_LABELS[user.role]}
          </Badge>
        </div>
        <p className="truncate text-sm font-semibold text-fg">{profile.pseudo}</p>
        <p className="truncate text-sm text-muted">{user.email}</p>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted">
          <CalendarDays className="size-3.5" aria-hidden />
          Inscrit le {dateInscription(profile.date_inscription)}
        </p>
        {profile.bio && (
          <p className="mt-2 max-w-2xl whitespace-pre-wrap text-sm text-fg">{profile.bio}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/statistiques" className="btn-secondary text-sm">
          <ChartColumn className="size-4" aria-hidden />
          Mes statistiques
        </Link>
        <Link
          href={`/profil/${encodeURIComponent(profile.pseudo)}`}
          className="btn-secondary text-sm"
        >
          Voir mon profil public
        </Link>
      </div>
    </header>
  );
}
