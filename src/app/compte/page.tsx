import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { listSessions } from "@/lib/data/sessions";
import { getProfile } from "@/lib/data/users";
import { atLeast } from "@/lib/roles";
import { AccessDenied } from "@/components/ui/access-denied";
import type { CurrentUser, Profile } from "@/lib/types";
import { CompteSection } from "./_components/compte-section";
import { ConfidentialiteSection } from "./_components/confidentialite-section";
import { CompteEntete } from "./_components/entete";
import { CompteOnglets } from "./_components/onglets";
import { PreferencesSection } from "./_components/preferences-section";
import { ProfilSection } from "./_components/profil-section";
import { SessionsSection } from "./_components/sessions-section";
import { resolveSection, type SectionKey } from "./sections";

export const metadata: Metadata = {
  title: "Mon compte",
  robots: { index: false, follow: false },
};

/** Profil de repli tant que la ligne `profiles` n'existe pas encore. */
function profilParDefaut(user: CurrentUser): Profile {
  return {
    user_id: user.id,
    pseudo: user.pseudo,
    avatar: user.avatar,
    bio: "",
    role: user.role,
    date_inscription: new Date(0).toISOString(),
    adult_ok: user.adult_ok,
    adult_ok_at: null,
    confidentialite: { bibliothequePublique: true, statsPubliques: true },
    preferences: user.preferences,
  };
}

/**
 * Une section par onglet, chacune avec son propre état : seules les données
 * de l'onglet affiché sont chargées (les sessions Appwrite ne sont plus lues
 * pour afficher le profil). La `key` réinitialise l'état en changeant d'onglet.
 */
async function Section({
  section,
  user,
  profile,
}: {
  section: SectionKey;
  user: CurrentUser;
  profile: Profile;
}) {
  switch (section) {
    case "profil":
      return <ProfilSection profile={profile} />;
    case "preferences":
      return <PreferencesSection initial={profile.preferences} />;
    case "confidentialite":
      return <ConfidentialiteSection profile={profile} />;
    case "sessions":
      return <SessionsSection sessions={await listSessions()} />;
    case "compte":
      return <CompteSection user={user} profile={profile} />;
  }
}

export default async function ComptePage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion?next=/compte");
  if (!atLeast(user.role, "membre")) return <AccessDenied required="membre" />;

  const { section } = await searchParams;
  const courante = resolveSection(section);
  const profile = (await getProfile(user.id)) ?? profilParDefaut(user);

  return (
    <div className="container-site py-8">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <CompteEntete user={user} profile={profile} />
        <CompteOnglets section={courante} />
        <Section key={courante} section={courante} user={user} profile={profile} />
      </div>
    </div>
  );
}
