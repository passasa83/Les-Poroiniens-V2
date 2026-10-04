import { createHash } from "node:crypto";

/**
 * Identifiants de lignes Appwrite.
 *
 * Appwrite refuse tout `rowId` de plus de **36 caractères** (caractères
 * autorisés : `a-z A-Z 0-9 . - _`, sans caractère spécial en tête). Les
 * identifiants composites du projet (`${userId}-${seriesId}`,
 * `${userId}-${chapterId}`, `s-{slug}-c{n}`…) dépassaient donc cette limite
 * dès qu'un **vrai compte** Appwrite (identifiant de 20 caractères) ou un
 * titre de série un peu long était utilisé : la création échouait en 500.
 *
 * Règle appliquée partout où un identifiant composite est construit :
 *  - si la concaténation tient dans les 36 caractères, on la conserve telle
 *    quelle (compatibilité avec les lignes déjà en base) ;
 *    sinon, on dérive un identifiant **déterministe** de 32 caractères :
 *    mêmes entrées ⇒ même id, ce qui garde cohérentes les lectures,
 *    les mises à jour et les suppressions.
 *
 * La fonction est idempotente : `rowId(rowId(x)) === rowId(x)`.
 */
export const ROW_ID_MAX = 36;

export function rowId(...parts: Array<string | number | null | undefined>): string {
  const base = parts
    .filter((p) => p !== null && p !== undefined && p !== "")
    .join("-");
  if (base.length <= ROW_ID_MAX) return base;
  return createHash("sha1").update(base).digest("hex").slice(0, 32);
}
