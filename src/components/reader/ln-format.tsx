"use client";

import { useMemo, type ReactNode } from "react";

/**
 * Conversion de l'ancien format des fichiers light novel en nœuds React.
 *
 * Les `.txt` du NAS viennent de l'ancien site, où des fragments HTML étaient
 * injectés après assainissement (sanitizer maison + styles `css/ln.css`).
 * Dans la V2, rien n'est jamais injecté : chaque paragraphe est découpé en
 * nœuds typés, seules les balises réellement présentes dans le corpus sont
 * traduites en équivalents visuels, et tout le reste — y compris un texte
 * qui *ressemble* à une balise (`<Kaga Michio : 17 ans, …>`) — reste du
 * texte brut.
 *
 * Inventaire des 166 chapitres importés : `<em>` (3071×), `<strong>` (157×),
 * `<span class="ln-sep">` (61×, dont une balise mal formée sans guillemet
 * final), `<span class="ln-box …">` (23×), `<hr class="ln-divider">` (12×),
 * `<ul class="ln-list ln-list--tight">` + `<li>`, `<span class="comfortaa-text">`,
 * `<img src="https://file.garden/…">` (16×). Aucune entité HTML, aucun `<br>`.
 */

type NoeudLn =
  | { t: "texte"; v: string }
  | { t: "gras" | "italique" | "souligne" | "barre"; enfants: NoeudLn[] }
  | { t: "confort"; enfants: NoeudLn[] }
  | { t: "cadre"; compact: boolean; confort: boolean; enfants: NoeudLn[] }
  | { t: "liste"; ordonnee: boolean; serre: boolean; items: NoeudLn[][] }
  | { t: "separe"; icone: string }
  | { t: "filet" }
  | { t: "saut" }
  | { t: "image"; src: string };

type Contexte =
  | { kind: "racine" | "transparent" | "ignorer" | "item"; enfants: NoeudLn[] }
  | { kind: "gras" | "italique" | "souligne" | "barre" | "confort"; enfants: NoeudLn[] }
  | { kind: "cadre"; compact: boolean; confort: boolean; enfants: NoeudLn[] }
  | { kind: "liste"; ordonnee: boolean; serre: boolean; enfants: NoeudLn[]; items: NoeudLn[][] };

/** Balises reconnues — tout ce qui n'est pas dans la liste reste du texte. */
const TAG_RE = /<(\/?)(em|i|strong|b|u|s|strike|br|hr|span|div|ul|ol|li|img)(\s[^<>]*?)?(\/?)>/gi;

const SIMPLE: Record<string, "gras" | "italique" | "souligne" | "barre"> = {
  em: "italique",
  i: "italique",
  strong: "gras",
  b: "gras",
  u: "souligne",
  s: "barre",
  strike: "barre",
};

/** À la fermeture : quels kinds de contexte une balise peut refermer. */
const FERME: Record<string, Contexte["kind"][]> = {
  em: ["italique"],
  i: ["italique"],
  strong: ["gras"],
  b: ["gras"],
  u: ["souligne"],
  s: ["barre"],
  strike: ["barre"],
  span: ["transparent", "cadre", "confort", "ignorer"],
  div: ["transparent", "cadre", "confort", "ignorer"],
  ul: ["liste"],
  ol: ["liste"],
  li: ["item"],
};

/** `class="…"`, tolérant aux guillemets non fermés du corpus. */
function classeDe(attrs: string): string {
  return (attrs.match(/class\s*=\s*"([^"]*)/i)?.[1] ?? "").toLowerCase();
}

function convertir(ctx: Contexte): NoeudLn[] {
  switch (ctx.kind) {
    case "racine":
    case "transparent":
    case "item":
      return ctx.enfants;
    case "ignorer":
      return [];
    case "gras":
    case "italique":
    case "souligne":
    case "barre":
    case "confort":
      return [{ t: ctx.kind, enfants: ctx.enfants }];
    case "cadre":
      return [{ t: "cadre", compact: ctx.compact, confort: ctx.confort, enfants: ctx.enfants }];
    case "liste":
      return [{ t: "liste", ordonnee: ctx.ordonnee, serre: ctx.serre, items: ctx.items }];
  }
}

/** Analyse un paragraphe de l'ancien format. Sans effet sur le texte pur. */
function parserAncienFormat(texte: string): NoeudLn[] {
  const racine: Contexte = { kind: "racine", enfants: [] };
  const pile: Contexte[] = [racine];

  const ajouter = (n: NoeudLn) => {
    pile[pile.length - 1].enfants.push(n);
  };

  /** Convertit un contexte terminé et le rattache à son parent. */
  const fermerContexte = (i: number): void => {
    const ctx = pile[i];
    const parent = pile[i - 1];
    pile.length = i;
    const noeuds = convertir(ctx);
    if (ctx.kind === "item" && parent.kind === "liste") parent.items.push(noeuds);
    else parent.enfants.push(...noeuds);
  };

  /** Referme le kind correspondant (les balises non fermées se ferment aussi). */
  const fermer = (kinds: Contexte["kind"][]): void => {
    let idx = -1;
    for (let i = pile.length - 1; i > 0; i--) {
      if (kinds.includes(pile[i].kind)) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return;
    while (pile.length - 1 > idx) fermerContexte(pile.length - 1);
    fermerContexte(idx);
  };

  TAG_RE.lastIndex = 0;
  let curseur = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(texte)) !== null) {
    if (m.index > curseur) ajouter({ t: "texte", v: texte.slice(curseur, m.index) });
    curseur = m.index + m[0].length;

    const [, barre, brut, attrs = ""] = m;
    const nom = brut.toLowerCase();
    if (barre === "/") {
      fermer(FERME[nom] ?? []);
      continue;
    }
    if (nom === "br") {
      ajouter({ t: "saut" });
      continue;
    }
    if (nom === "hr") {
      ajouter({ t: "filet" });
      continue;
    }
    if (nom === "img") {
      const src = attrs.match(/src\s*=\s*"([^"]*)/i)?.[1] ?? "";
      if (src) ajouter({ t: "image", src });
      continue;
    }
    const classe = classeDe(attrs);
    if (nom === "span" || nom === "div") {
      if (classe.includes("ln-sep")) {
        ajouter({ t: "separe", icone: attrs.match(/data-icon\s*=\s*"([^"]*)/i)?.[1]?.trim() || "◇" });
        pile.push({ kind: "ignorer", enfants: [] }); // le contenu éventuel de la balise saute
        continue;
      }
      if (classe.includes("ln-box")) {
        pile.push({
          kind: "cadre",
          compact: classe.includes("is-compact"),
          confort: classe.includes("comfortaa-text"),
          enfants: [],
        });
        continue;
      }
      if (classe.includes("comfortaa-text")) {
        pile.push({ kind: "confort", enfants: [] });
        continue;
      }
      pile.push({ kind: "transparent", enfants: [] });
      continue;
    }
    if (nom === "ul" || nom === "ol") {
      pile.push({
        kind: "liste",
        ordonnee: nom === "ol",
        serre: classe.includes("ln-list--tight"),
        enfants: [],
        items: [],
      });
      continue;
    }
    if (nom === "li") {
      pile.push({ kind: "item", enfants: [] });
      continue;
    }
    const kind = SIMPLE[nom];
    if (kind) pile.push({ kind, enfants: [] });
  }
  if (curseur < texte.length) ajouter({ t: "texte", v: texte.slice(curseur) });
  while (pile.length > 1) fermerContexte(pile.length - 1);
  return racine.enfants;
}

/** Vrai si le nœud demande un rendu de type bloc (cadre, image, liste…). */
function noeudBloquant(n: NoeudLn): boolean {
  return n.t === "separe" || n.t === "filet" || n.t === "liste" || n.t === "image" || n.t === "cadre";
}

/* ─────────────────────────── Rendu ─────────────────────────── */

/** Comfortaa comme sur l'ancien site (police locale sinon repli `cursive`). */
const CONFORT = { fontFamily: '"Comfortaa", cursive' } as const;

function rendreNoeuds(noeuds: NoeudLn[]): ReactNode[] {
  return noeuds.map((n, i) => {
    switch (n.t) {
      case "texte":
        return n.v;
      case "gras":
        return <strong key={i}>{rendreNoeuds(n.enfants)}</strong>;
      case "italique":
        return <em key={i}>{rendreNoeuds(n.enfants)}</em>;
      case "souligne":
        return <u key={i}>{rendreNoeuds(n.enfants)}</u>;
      case "barre":
        return <s key={i}>{rendreNoeuds(n.enfants)}</s>;
      case "confort":
        return (
          <span key={i} style={CONFORT}>
            {rendreNoeuds(n.enfants)}
          </span>
        );
      case "cadre":
        return (
          <span
            key={i}
            style={n.confort ? CONFORT : undefined}
            /* ancien `.ln-box` : cadre arrondi, léger voile, tabulations
               conservées ; variante `is-compact` resserrée + chiffres tabulaires */
            className={`my-4 block rounded-[14px] border border-line bg-surface/5 [tab-size:2] [white-space:pre-wrap] ${
              n.compact
                ? "px-[0.7rem] py-[0.5rem] leading-none [font-variant-numeric:tabular-nums]"
                : "px-[0.9rem] py-[0.75rem] leading-[1.5]"
            }`}
          >
            {rendreNoeuds(n.enfants)}
          </span>
        );
      case "separe":
        /* ancien `.ln-sep` : glyphe centré (◇ par défaut, `data-icon` sinon) */
        return (
          <span
            key={i}
            aria-hidden="true"
            className="my-6 block text-center text-[clamp(18px,2.2vw,24px)] leading-none opacity-90"
          >
            {n.icone}
          </span>
        );
      case "filet":
        /* ancien `hr.ln-divider` : fin filet de séparation */
        return <span key={i} aria-hidden="true" className="my-[1.4em] block border-t border-line opacity-85" />;
      case "saut":
        return <br key={i} />;
      case "image":
        return (
          // image externe héritée (file.garden) : pas d'optimiseur Next ici
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={n.src}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="mx-auto my-4 block max-w-full rounded-lg"
          />
        );
      case "liste": {
        const classe = `ml-[1.1em] list-outside marker:text-[0.9em] ${
          n.serre ? "leading-[1.35]" : "leading-[1.45]"
        }`;
        const items = n.items.map((item, j) => (
          <li key={j} className={n.serre ? "mt-[0.12em]" : ""}>
            {rendreNoeuds(item)}
          </li>
        ));
        return n.ordonnee ? (
          <ol key={i} className={classe}>
            {items}
          </ol>
        ) : (
          <ul key={i} className={classe}>
            {items}
          </ul>
        );
      }
    }
  });
}

/** Un paragraphe hérité : bloc si nécessaire, sinon `<p>` sémantique. */
export function LnParagraphe({ texte }: { texte: string }) {
  const noeuds = useMemo(() => parserAncienFormat(texte), [texte]);
  if (!noeuds.length) return null;
  const rendu = rendreNoeuds(noeuds);
  return noeuds.some(noeudBloquant) ? (
    <div className="whitespace-pre-line">{rendu}</div>
  ) : (
    <p className="whitespace-pre-line">{rendu}</p>
  );
}
