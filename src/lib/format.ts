/** Formatage des temps relatifs (« il y a 6 h »), côté serveur et client. */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return "";

  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "hier";
  if (days < 30) return `il y a ${days} j`;

  const months = Math.floor(days / 30);
  if (months < 12) return `il y a ${months} mois`;
  const years = Math.floor(days / 365);
  return `il y a ${years} an${years > 1 ? "s" : ""}`;
}

/** Date courte : relatif sous 7 jours, date complète au-delà (§6.5). */
export function dateOrRelative(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const days = (Date.now() - date.getTime()) / 86_400_000;
  return days >= 0 && days < 7 ? relativeTime(iso) || "" : date.toLocaleDateString("fr-FR");
}

/** Durée en minutes → « 45 min », « 2 h 30 » (§6.8, temps de lecture estimé). */
export function duree(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return "0 min";
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

/** Synthèse d'un texte long pour les aperçus (synopsis du héros, §6.1). */
export function plainText(raw: string | null | undefined, max = 180): string {
  const clean = (raw ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
