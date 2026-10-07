export type SommaireEntree = { id: string; titre: string };

/**
 * Sommaire ancré des pages légales : liste de liens internes vers les
 * titres de sections. Chaque `id` doit exister dans la page (libellé explicite
 * pour les lecteurs d'écran, cible focusable au clavier).
 */
export function Sommaire({
  entrees,
  id = "sommaire",
}: {
  entrees: SommaireEntree[];
  id?: string;
}) {
  return (
    <nav aria-labelledby={`${id}-titre`} className="card mt-6 max-w-3xl p-5" id={id}>
      <p className="text-sm font-semibold text-fg" id={`${id}-titre`}>
        Sommaire
      </p>
      <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {entrees.map((entree) => (
          <li key={entree.id} className="text-sm">
            <a className="link-muted underline" href={`#${entree.id}`}>
              {entree.titre}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
