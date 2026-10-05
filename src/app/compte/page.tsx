import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listSessions } from "@/lib/data/sessions";
import { getProfile } from "@/lib/data/users";
import { atLeast } from "@/lib/roles";
import { AccessDenied } from "@/components/ui/access-denied";
import type { Profile } from "@/lib/types";
import { CompteClient } from "./compte-client";
import { resolveSection } from "./sections";

export const metadata: Metadata = {
  title: "Mon compte",
  robots: { index: false, follow: false },
};

export default async function ComptePage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion?next=/compte");
  if (!atLeast(user.role, "membre")) return <AccessDenied required="membre" />;

  const { section } = await searchParams;
  const [profile, sessions] = await Promise.all([getProfile(user.id), listSessions()]);

  const courant: Profile = profile ?? {
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

  return (
    <div className="container-site py-8">
      <CompteClient
        user={user}
        profile={courant}
        sessions={sessions}
        section={resolveSection(section)}
      />
    </div>
  );
}
