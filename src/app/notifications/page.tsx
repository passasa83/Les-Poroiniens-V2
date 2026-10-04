import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AtSign, BookOpen, Info } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { listNotifications } from "@/lib/data/moderation";
import { atLeast } from "@/lib/roles";
import { AccessDenied } from "@/components/ui/access-denied";
import { Badge, EmptyState } from "@/components/ui/kit";
import type { Notification } from "@/lib/types";
import { NotificationsActions } from "./notifications-client";

export const metadata: Metadata = {
  title: "Notifications",
  robots: { index: false, follow: false },
};

function texte(notification: Notification): string {
  const payload = notification.payload ?? {};
  if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
  if (typeof payload.titre === "string" && payload.titre.trim()) return payload.titre;
  if (notification.type === "chapter") return "Nouveau chapitre disponible";
  if (notification.type === "mention") return "Vous avez été mentionné";
  return "Notification du site";
}

/** Lien contextuel : tolérant aux différentes formes de payload. */
function lien(notification: Notification): string | null {
  const payload = notification.payload ?? {};
  const chemin = (value: unknown) =>
    typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : null;

  const direct =
    chemin(payload.url) ?? chemin(payload.href) ?? chemin(payload.path) ?? chemin(payload.lien);
  if (direct) return direct;

  const slug =
    (typeof payload.slug === "string" && payload.slug) ||
    (typeof payload.seriesSlug === "string" && payload.seriesSlug) ||
    (typeof payload.series_slug === "string" && payload.series_slug) ||
    null;
  const numero =
    (typeof payload.numero === "number" && payload.numero) ||
    (typeof payload.chapter_numero === "number" && payload.chapter_numero) ||
    (typeof payload.numero_chapitre === "number" && payload.numero_chapitre) ||
    null;

  if (notification.type === "chapter") {
    if (slug && numero !== null) return `/serie/${slug}/chapitre-${numero}`;
    if (slug) return `/serie/${slug}`;
    return "/catalogue";
  }

  if (notification.type === "mention") {
    const pseudo =
      (typeof payload.pseudo === "string" && payload.pseudo) ||
      (typeof payload.auteur === "string" && payload.auteur) ||
      null;
    return pseudo ? `/profil/${encodeURIComponent(pseudo)}` : null;
  }

  if (payload.kind === "reset_request") return "/gerant";
  return "/";
}

function icone(type: Notification["type"]) {
  if (type === "chapter") return BookOpen;
  if (type === "mention") return AtSign;
  return Info;
}

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion?next=/notifications");
  if (!atLeast(user.role, "membre")) return <AccessDenied required="membre" />;

  const notifications = await listNotifications(user.id);
  const unread = notifications.filter((n) => !n.lu).length;

  return (
    <div className="container-site space-y-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-fg">Notifications</h1>
          <p className="text-sm text-muted">
            {notifications.length} notification{notifications.length > 1 ? "s" : ""} ·{" "}
            {unread} non lue{unread > 1 ? "s" : ""}
          </p>
        </div>
        <NotificationsActions unread={unread} />
      </header>

      {notifications.length === 0 ? (
        <EmptyState
          title="Aucune notification"
          description="Vous serez prévenu ici des nouveaux chapitres des séries que vous suivez et des réponses à vos commentaires."
          action={
            <Link href="/bibliotheque" className="btn-secondary">
              Gérer mes séries suivies
            </Link>
          }
        />
      ) : (
        <ul className="space-y-2">
          {notifications.map((notification) => {
            const Icon = icone(notification.type);
            const href = lien(notification);
            const content = (
              <span className="flex w-full items-start gap-3">
                <span
                  className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full ${
                    notification.lu ? "bg-surface2 text-muted" : "bg-primary/15 text-primary"
                  }`}
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-fg">
                      {texte(notification)}
                    </span>
                    {!notification.lu && <Badge tone="primary">Nouveau</Badge>}
                  </span>
                  <span className="block text-xs text-muted">
                    {new Date(notification.created_at).toLocaleString("fr-FR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </span>
                {href && <span className="text-xs text-muted">→</span>}
              </span>
            );

            return (
              <li key={notification.id}>
                {href ? (
                  <Link
                    href={href}
                    className="card flex items-center p-3 transition-colors hover:border-primary"
                  >
                    {content}
                  </Link>
                ) : (
                  <span className="card flex items-center p-3">{content}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
