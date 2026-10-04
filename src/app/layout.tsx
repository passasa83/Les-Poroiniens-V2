import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { CookieBanner } from "@/components/layout/cookie-banner";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const siteName = process.env.NEXT_PUBLIC_SITE_NAME || "Les Poroiniens";

/* Typographie (DA §3.3) : Poppins, graisses 400 à 700, secours système + CJK
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

/* Thème : préférence enregistrée, sinon `prefers-color-scheme` (DA §8.1). */
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
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
        <MobileTabBar />
        {/* Espace réservé à la barre d'onglets mobile (hauteur + encoche) */}
        <div aria-hidden className="h-[calc(3.5rem+env(safe-area-inset-bottom))] md:hidden" />
        <CookieBanner />
      </body>
    </html>
  );
}
