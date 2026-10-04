import type { Metadata } from "next";
import { dataMode } from "@/lib/db";
import { DEMO_ACCOUNTS } from "@/lib/db/seed";
import { ConnexionForm, type DemoAccount } from "./connexion-form";

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
  const demoAccounts: DemoAccount[] =
    dataMode() === "demo"
      ? DEMO_ACCOUNTS.map(({ email, password, pseudo, role }) => ({ email, password, pseudo, role }))
      : [];

  return (
    <div className="container-site py-10">
      <div className="mx-auto w-full max-w-md">
        <ConnexionForm next={safeNext(next)} demoAccounts={demoAccounts} />
      </div>
    </div>
  );
}
