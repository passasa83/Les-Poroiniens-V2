/**
 * Reprise de lecture sans compte, rangée sous une clé unique par type de
 * lecteur (au lieu d'une clé par chapitre, qui s'accumulaient sans fin) :
 * - scans : numéro de page (1-based) ;
 * - light novel : fraction 0-1 du défilement.
 *
 * Les anciennes clés `lp-progress:<id>` / `lp-ln-progress:<id>` sont
 * regroupées au premier accès puis supprimées. Seuls les `MAX` chapitres les
 * plus récents sont gardés.
 */

type Kind = "scans" | "ln";

const KEYS: Record<Kind, string> = { scans: "lp-progress", ln: "lp-ln-progress" };
const MAX = 300;
/** Migration faite pour ce chargement de page. */
const migrated: Record<Kind, boolean> = { scans: false, ln: false };

function read(kind: Kind): Record<string, number> {
  const raw = localStorage.getItem(KEYS[kind]);
  let map: Record<string, number> = {};
  if (raw) {
    try {
      const data = JSON.parse(raw) as unknown;
      if (data && typeof data === "object") map = data as Record<string, number>;
    } catch {
      /* valeur corrompue : on repart de zéro */
    }
  }
  return migrate(kind, map);
}

/** Regroupe les anciennes clés par chapitre (une seule fois). */
function migrate(kind: Kind, map: Record<string, number>): Record<string, number> {
  if (migrated[kind]) return map;
  migrated[kind] = true;
  const prefix = `${KEYS[kind]}:`;
  const legacy: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) legacy.push(key);
  }
  if (legacy.length === 0) return map;
  for (const key of legacy) {
    const value = Number(localStorage.getItem(key));
    const id = key.slice(prefix.length);
    if (id && Number.isFinite(value) && !(id in map)) map[id] = value;
  }
  write(kind, map);
  for (const key of legacy) localStorage.removeItem(key);
  return map;
}

function write(kind: Kind, map: Record<string, number>): void {
  const ids = Object.keys(map);
  for (const id of ids.slice(0, Math.max(0, ids.length - MAX))) delete map[id];
  localStorage.setItem(KEYS[kind], JSON.stringify(map));
}

export function getLocalProgress(kind: Kind, chapterId: string): number | null {
  try {
    const value = read(kind)[chapterId];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function setLocalProgress(kind: Kind, chapterId: string, value: number): void {
  try {
    const map = read(kind);
    // Réinsertion en fin : ordre = du plus ancien au plus récent.
    delete map[chapterId];
    map[chapterId] = value;
    write(kind, map);
  } catch {
    /* stockage indisponible : reprise non mémorisée */
  }
}
