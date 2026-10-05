import type { Metadata } from "next";
import { demoAccounts } from "@/lib/demo-accounts";
import { ConnexionForm } from "@/components/auth/connexion-form";

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
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="container-site py-10">
      <div className="mx-auto w-full max-w-md">
        <ConnexionForm next={safeNext(next)} demoAccounts={demoAccounts()} />
      </div>
    </div>
  );
}
