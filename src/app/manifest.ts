import type { MetadataRoute } from "next";

const siteName = process.env.NEXT_PUBLIC_SITE_NAME || "Les Poroiniens";

/** Manifeste PWA minimal (nom, langue, thème sombre, icône par défaut). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteName,
    short_name: siteName,
    description:
      "Lecture de scans manga, manhwa et manhua : catalogue, fiches séries, lecteur optimisé et suivi de lecture.",
    lang: "fr",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0b11",
    theme_color: "#0a0b11",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
