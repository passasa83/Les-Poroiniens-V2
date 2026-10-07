import type { MetadataRoute } from "next";

const siteName = process.env.NEXT_PUBLIC_SITE_NAME || "Les Poroiniens";

/**
 * Manifeste PWA (« PWA installable »).
 * `theme_color` / `background_color` reprennent les jetons de la DA
 * (`--bg` = #1d1d1f, `--accent` = #d93a44) et les icônes sont de vraies
 * images PNG générées dans `public/icons` (192, 512, maskable 512).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: siteName,
    short_name: siteName,
    description:
      "Lecture de scans manga, manhwa et manhua : catalogue, fiches séries, lecteur optimisé et suivi de lecture.",
    lang: "fr",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#1d1d1f",
    theme_color: "#1d1d1f",
    categories: ["entertainment", "books", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      { src: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  };
}
