import type { Metadata } from "next";
import { demoAccounts } from "@/lib/demo-accounts";
import { discordConfigured } from "@/lib/discord";
import { ConnexionForm } from "@/components/auth/connexion-form";
import { messageDiscord } from "@/components/auth/oauth-errors";

export const metadata: Metadata = {
  title: "Connexion",
  robots: { index: false, follow: false },
};

/** `next` n'est accepté que s'il pointe vers une page interne du site. */
function safeNext(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return "/compte";
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/compte";
  return value;
}

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; erreur?: string | string[] }>;
}) {
  const { next, erreur } = await searchParams;
  const code = Array.isArray(erreur) ? erreur[0] : erreur;

  return (
    <div className="container-site py-10">
      <div className="mx-auto w-full max-w-md">
        <ConnexionForm
          next={safeNext(next)}
          demoAccounts={demoAccounts()}
          discordEnabled={discordConfigured()}
          initialError={messageDiscord(code)}
        />
      </div>
    </div>
  );
}
