import "server-only";

/**
 * Tolérance aux pannes de transport.
 *
 * L'Appwrite du projet vit dans un home-lab joignable via VPN/Internet : les
 * requêtes passent en ~1,3 s normalement, mais une coupure du tunnel provoque
 * des `ConnectTimeoutError` de 10 s. Ces erreurs sont **transitoires** — le
 * serveur n'a jamais été joigné — contrairement aux réponses applicatives
 * Appwrite (4xx / 5xx, clé invalide, document manquant), qui ne doivent ni
 * être rejouées ni masquées.
 */

const TRANSIENT_CODES = [
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENETUNREACH",
];

export function isTransientNetworkError(err: unknown): boolean {
  const e = err as { message?: string; cause?: { code?: string; message?: string } };
  const hay = `${e?.message ?? ""} ${e?.cause?.code ?? ""} ${e?.cause?.message ?? ""}`;
  if (TRANSIENT_CODES.some((code) => hay.includes(code))) return true;
  return /fetch failed|connect timeout/i.test(hay);
}

/**
 * Lecture rejouée une fois (300 ms) après une erreur de transport.
 * Seules les lectures passent par ce helper : une écriture n'est jamais
 * rejouée, au risque de dupliquer une ligne.
 */
export async function withRetry<T>(fn: () => Promise<T>, tries = 2): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (attempt === tries || !isTransientNetworkError(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw last;
}
