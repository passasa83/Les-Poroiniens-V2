import type { NextConfig } from "next";

const imgHosts = [
  "localhost",
  "appwrite.monhomelabdechlag.duckdns.org",
  ...(process.env.CDN_BASE_URL ? [new URL(process.env.CDN_BASE_URL).host] : []),
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: imgHosts.map((hostname) => ({
      protocol: "https",
      hostname,
      pathname: "/**",
    })),
  },
  async rewrites() {
    return {
      // L'App Router n'accepte que des segments dynamiques entiers (`[n]`).
      // L'URL publique reste « canonique » `/serie/{slug}/chapitre-{n}` :
      // on la réécrit vers la route interne.
      beforeFiles: [
        {
          source: "/serie/:slug/chapitre-:n",
          destination: "/serie/:slug/:n",
        },
      ],
    };
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // CSP : 'self' + CDN d'images. Les scripts inline de Next sont autorisés
          // (nécessaire au fonctionnement de l'App Router).
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
      {
        // Cache long sur les images de scans servies par le proxy local
        source: "/scan/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
