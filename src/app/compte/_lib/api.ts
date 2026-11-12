/** Appel JSON des routes `/api/account/*` : erreur lisible au lieu d'une exception. */
type ApiReply = { error?: string; message?: string };

export async function apiJson<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(path, init);
    const data = (await res.json().catch(() => ({}))) as T & ApiReply;
    if (!res.ok) return { ok: false, error: data.error || "Une erreur est survenue." };
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Impossible de contacter le serveur." };
  }
}

export const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
