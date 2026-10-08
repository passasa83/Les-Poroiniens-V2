import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { SiteFooter } from "@/components/layout/site-footer";
import { HeaderSkeleton, SiteHeader } from "@/components/layout/site-header";
import { CookieBanner } from "@/components/layout/cookie-banner";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";
import { PwaRegister } from "@/components/layout/pwa-register";
import { AuthModal } from "@/components/auth/auth-modal";
import { demoAccounts } from "@/lib/demo-accounts";
import { discordConfigured } from "@/lib/discord";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const siteName = process.env.NEXT_PUBLIC_SITE_NAME || "Les Poroiniens";

/* Typographie (DA) : Poppins, graisses 400 à 700, secours système + CJK
   déclarés dans `--font-sans` (globals.css) pour les titres originaux. */
const poppins = Poppins({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${siteName} — Lecture de scans manga`,
    template: `%s — ${siteName}`,
  },
  description:
    "Lisez les derniers scans manga, manhwa et manhua : catalogue, fiches séries, lecteur optimisé et suivi de lecture.",
  openGraph: {
    type: "website",
    locale: "fr_FR",
    siteName,
    url: siteUrl,
  },
  /* PWA : icônes réelles dans /public, iPhone incluant un
     « apple-touch-icon » ; le lien vers manifest.webmanifest est rendu par
     Next depuis src/app/manifest.ts. */
  applicationName: siteName,
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#1d1d1f" },
  ],
  width: "device-width",
  initialScale: 1,
};

/* Thème : préférence enregistrée, sinon `prefers-color-scheme` (DA). */
const themeInit = `
try {
  var stored = localStorage.getItem('lp-theme');
  var systemLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  document.documentElement.dataset.theme =
    stored === 'dark' || stored === 'light' ? stored : (systemLight ? 'light' : 'dark');
} catch (e) {}
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" data-theme="dark" className={poppins.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="flex min-h-screen flex-col antialiased">
        {/* Lien d'évitement (WCAG 2.4.1) : premier élément focusable,
            il saute la barre de navigation pour aller au contenu principal. */}
        <a
          href="#contenu-principal"
          className="sr-only z-50 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-primaryfg"
        >
          Aller au contenu principal
        </a>
        {/* L'en-tête (session + notifications, jusqu'à 4 requêtes vers le
            backend) est mis en Suspense : le contenu de la page part
            immédiatement au lieu d'attendre l'en-tête, la coquille ayant
            exactement la même hauteur (aucun décalage visuel). */}
        <Suspense fallback={<HeaderSkeleton />}>
          <SiteHeader />
        </Suspense>
        <main id="contenu-principal" className="flex-1 scroll-mt-24">
          {children}
        </main>
        <SiteFooter />
        <MobileTabBar />
        {/* Espace réservé à la barre d'onglets mobile (hauteur + encoche) */}
        <div aria-hidden className="h-[calc(3.5rem+env(safe-area-inset-bottom))] md:hidden" />
        <CookieBanner />
        {/* PWA : enregistrement du service worker, discret et
            limité à la construction de production (voir pwa-register.tsx). */}
        <PwaRegister />
        {/* Modale d'authentification : connexion, inscription et
            mot de passe oublié, accessibles depuis n'importe quelle page. */}
        <Suspense fallback={null}>
          <AuthModal
            demoAccounts={demoAccounts()}
            turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null}
            discordEnabled={discordConfigured()}
          />
        </Suspense>
      </body>
    </html>
  );
}
