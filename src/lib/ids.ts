/** Identifiant de ligne lisible : préfixe, horodatage base 36, suffixe aléatoire. */
export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
