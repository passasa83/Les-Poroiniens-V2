import type { Metadata } from "next";
import { InscriptionForm } from "@/components/auth/inscription-form";
import { discordConfigured } from "@/lib/discord";

export const metadata: Metadata = {
  title: "Inscription",
  robots: { index: false, follow: false },
};

export default function InscriptionPage() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null;

  return (
    <div className="container-site py-10">
      <div className="mx-auto w-full max-w-md">
        <InscriptionForm turnstileSiteKey={siteKey} discordEnabled={discordConfigured()} />
      </div>
    </div>
  );
}
