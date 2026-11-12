/** « 2 octobre 2026 ». */
export function dateInscription(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Date ISO → « 2 octobre 2026 à 14:05 » ; null si la date est illisible. */
export function horodatage(iso: string | null): string | null {
  if (!iso) return null;
  const temps = Date.parse(iso);
  if (Number.isNaN(temps)) return null;
  return new Date(temps).toLocaleString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
