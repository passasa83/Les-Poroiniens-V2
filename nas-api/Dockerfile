# API de listing du NAS « Les Poroiniens » — Node zéro dépendance.
FROM node:24-alpine
WORKDIR /app
COPY server.mjs ./
ENV NODE_ENV=production PORT=8660 IMG_ROOT=/images
EXPOSE 8660
# Root du conteneur : le montage `:rw` appartient à root (miroir téléchargé
# en root), et `/move` a besoin d'écrire (`staging/` → `public/`).
CMD ["node", "server.mjs"]
