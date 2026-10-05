import type { ReleaseItem } from "@/lib/data/chapters";

export const DAY_MS = 86_400_000;

/**
 * Découpe les sorties des sept derniers jours en tranches glissantes
 * (§6.2 « Nouveautés ») : `0` = dernières 24 h, `1` = hier, … `7`.
 * L'horloge est lue ici, hors composant React (règle de pureté).
 */
export function bucketByDay(items: ReleaseItem[]): {
  buckets: Map<number, ReleaseItem[]>;
  ages: number[];
} {
  const now = Date.now();
  const buckets = new Map<number, ReleaseItem[]>();

  for (const item of items) {
    const ts = item.publish_at ? Date.parse(item.publish_at) : NaN;
    if (Number.isNaN(ts)) continue;
    const age = Math.floor((now - ts) / DAY_MS);
    if (age > 7) continue;
    const list = buckets.get(age) ?? [];
    list.push(item);
    buckets.set(age, list);
  }

  return { buckets, ages: [...buckets.keys()].sort((a, b) => a - b) };
}

/** Sortie publiée dans les dernières 24 heures (étiquette rouge du héros). */
export function isWithin24h(iso: string | null | undefined): boolean {
  const ts = iso ? Date.parse(iso) : NaN;
  return !Number.isNaN(ts) && Date.now() - ts <= DAY_MS;
}

/** Intitulé d'une tranche : « Dernières 24 h », « Hier », « Il y a n jours ». */
export function dayLabel(age: number): string {
  if (age <= 0) return "Dernières 24 h";
  if (age === 1) return "Hier";
  return `Il y a ${age} jours`;
}
