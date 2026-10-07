import type { MetadataRoute } from "next";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

/**
 * Règles générales : tout est explorable sauf les espaces
 * privés et les API. Le `noindex` des séries +18 est posé par la page elle-même
 * (balise `robots` de la fiche série), pas ici.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin/", "/gerant/", "/compte/"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
