import "server-only";
import { DEFAULT_PREFERENCES, type Role } from "@/lib/types";
import { TABLES } from "./driver";

export type DemoDatabase = Record<string, Map<string, Record<string, unknown>>>;

const TABLE_NAMES = Object.values(TABLES) as string[];

const DAY = 86_400_000;

function iso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

type SeedDef = {
  titre: string;
  alt?: string[];
  synopsis: string;
  statut: "en_cours" | "termine" | "hiatus" | "abandonne";
  type: "manga" | "manhwa" | "manhua";
  annee: number;
  classification?: "adult";
  genres: string[];
  tags: string[];
  auteurs: string[];
  chapters: number;
};

const seeds: SeedDef[] = [
  {
    titre: "Les Poroiniens",
    alt: ["Poroinien Chronicles"],
    synopsis:
      "Dans le village enfoui de Poroin, une trouvaille antique réveille des géants de pierre. Kenji, apprenti cartographe, doit apprendre à dialoguer avec eux avant que les armées du Sud ne transforment sa vallée en champ de bataille.",
    statut: "en_cours",
    type: "manga",
    annee: 2024,
    genres: ["Action", "Aventure", "Fantastique"],
    tags: ["géants", "magic", "campagne"],
    auteurs: ["R. Amamiya"],
    chapters: 24,
  },
  {
    titre: "Aurore de Cendres",
    synopsis:
      "Après la chute du soleil artificiel, les cités-flottages s'affrontent par leurs ombres. La révoltée Sera découvre qu'elle est la seule à voir la lumière restante.",
    statut: "en_cours",
    type: "manhwa",
    annee: 2025,
    genres: ["Action", "Science-fiction", "Drame"],
    tags: ["post-apocalyptique", "rébellion"],
    auteurs: ["H. Yeong"],
    chapters: 18,
  },
  {
    titre: "Le Jardin des Miroirs",
    synopsis:
      "Une hôtelière hérite d'un jardin où chaque miroir montre une vie non vécue. Douze arcs pour comprendre qu'on ne revient jamais en arrière sans se perdre.",
    statut: "termine",
    type: "manga",
    annee: 2019,
    genres: ["Drame", "Fantastique", "Romance"],
    tags: ["slice of life", "mystère"],
    auteurs: ["M. Kirishima"],
    chapters: 16,
  },
  {
    titre: "Kitsune Blanc",
    synopsis:
      "Un renard à neuf queues contraint à vivre en apprenti boulanger dans le Kyoto moderne. Chaque queue accordée fait oublier un souvenir.",
    statut: "en_cours",
    type: "manga",
    annee: 2023,
    genres: ["Comédie", "Fantastique", "Slice of life"],
    tags: ["mythologie", "yokai"],
    auteurs: ["N. Sasaki"],
    chapters: 21,
  },
  {
    titre: "Neon District",
    synopsis:
      "Dans le quartier 9, la police n'entre plus. Détective privé, Rin accepte n'importe quelle affaire — jusqu'à celle où la victime est elle-même.",
    statut: "en_cours",
    type: "manhwa",
    annee: 2026,
    genres: ["Thriller", "Science-fiction", "Action"],
    tags: ["cyberpunk", "polar"],
    auteurs: ["J. Dohee"],
    chapters: 12,
  },
  {
    titre: "Saison des Pluies",
    synopsis:
      "Un orchestre de lycée se reforme après la disparition de sa violoncelliste. Trente chapitres de silence, de jalousie et de musique.",
    statut: "hiatus",
    type: "manga",
    annee: 2021,
    genres: ["Drame", "École", "Slice of life"],
    tags: ["musique", "lycée"],
    auteurs: ["A. Fujimoto"],
    chapters: 14,
  },
  {
    titre: "Le Samouraï de Kagurazaka",
    synopsis:
      "Dernier fidèle d'un clan aboli, il ouvre une école d'escrime dans une rue devenu touriste. L'honneur y coûte plus cher qu'un loyer.",
    statut: "termine",
    type: "manga",
    annee: 2017,
    genres: ["Historique", "Action", "Drame"],
    tags: ["samouraï", "épée"],
    auteurs: ["T. Onodera"],
    chapters: 20,
  },
  {
    titre: "Overdrive Academy",
    synopsis:
      "Les étudiants y apprennent à piloter des machines-capitales. Le classement se mesure en vitesse, la survie en dettes.",
    statut: "en_cours",
    type: "manhua",
    annee: 2025,
    genres: ["Action", "École", "Science-fiction"],
    tags: ["mécha", "compétition"],
    auteurs: ["L. Wei"],
    chapters: 15,
  },
  {
    titre: "Cœur d'Obsidienne",
    synopsis:
      "Dans une cité où les désirs se monnayent, une marchande d'ombres prend une commande qu'elle ne pourra pas honnorer.",
    statut: "en_cours",
    type: "manhwa",
    annee: 2024,
    classification: "adult",
    genres: ["Drame", "Romance", "Thriller"],
    tags: ["mature", "fantôme"],
    auteurs: ["S. Mira"],
    chapters: 11,
  },
  {
    titre: "Nuits Blanches à Tokyo",
    synopsis:
      "Deux inconnus se retrouvent chaque nuit sur le même banc, à Shibuya. Rien de ce qu'ils se racontent n'est vrai — sauf les silences.",
    statut: "en_cours",
    type: "manga",
    annee: 2026,
    classification: "adult",
    genres: ["Romance", "Drame"],
    tags: ["mature", "vie nocturne"],
    auteurs: ["K. Aoi"],
    chapters: 9,
  },
];

const USERS: Array<{
  id: string;
  email: string;
  password: string;
  pseudo: string;
  role: Role;
  bio?: string;
}> = [
  {
    id: "user-owner",
    email: "gerant@poroiniens.fr",
    password: "demo1234",
    pseudo: "Pastek",
    role: "owner",
    bio: "Gérant du site. J'importe les chapitres chaque semaine.",
  },
  {
    id: "user-admin",
    email: "admin@poroiniens.fr",
    password: "demo1234",
    pseudo: "Miko",
    role: "admin",
    bio: "Catalogue, fiches séries et recommandations.",
  },
  {
    id: "user-modo",
    email: "modo@poroiniens.fr",
    password: "demo1234",
    pseudo: "Kaz",
    role: "modo",
    bio: "Modération des commentaires.",
  },
  {
    id: "user-membre",
    email: "membre@poroiniens.fr",
    password: "demo1234",
    pseudo: "Yuki",
    role: "membre",
    bio: "Lis tout, note tout.",
  },
];

export const DEMO_ACCOUNTS = USERS.map(({ email, password, pseudo, role }) => ({
  email,
  password,
  pseudo,
  role,
}));

/** Pages par chapitre générées en SVG à la volée côté serveur. */
export function demoPagePath(slug: string, chapter: number, index: number): string {
  return `/api/img/page/${slug}/${chapter}/${index}`;
}

export function coverPath(slug: string): string {
  return `/api/img/cover/${slug}`;
}

function build(): DemoDatabase {
  const db: DemoDatabase = Object.fromEntries(
    TABLE_NAMES.map((t) => [t, new Map<string, Record<string, unknown>>()]),
  );

  // ── Comptes & profils ────────────────────────────────────────────────
  USERS.forEach((u, i) => {
    db[TABLES.users].set(u.id, {
      id: u.id,
      email: u.email,
      password: u.password,
      created_at: iso(-300 * DAY - i * DAY),
    });
    db[TABLES.profiles].set(u.id, {
      id: u.id,
      user_id: u.id,
      pseudo: u.pseudo,
      avatar: null,
      bio: u.bio ?? "",
      role: u.role,
      date_inscription: iso(-300 * DAY - i * DAY),
      adult_ok: u.role === "owner",
      adult_ok_at: u.role === "owner" ? iso(-290 * DAY) : null,
      confidentialite: { bibliothequePublique: true, statsPubliques: true },
      preferences: { ...DEFAULT_PREFERENCES },
      // pas de created_at : la table profiles porte date_inscription
    });
  });

  // ── Catalogue ────────────────────────────────────────────────────────
  seeds.forEach((s, si) => {
    const slug = slugify(s.titre);
    const seriesId = `s-${slug}`;
    const classification = s.classification ?? "all";
    const nbChapters = s.chapters;
    const updatedOffset = -((si % 7) + 1) * DAY;
    const seriesRow = {
      id: seriesId,
      slug,
      titre: s.titre,
      titresAlt: s.alt ?? [],
      synopsis: s.synopsis,
      couverture: coverPath(slug),
      banniere: coverPath(slug),
      statut: s.statut,
      type: s.type,
      annee: s.annee,
      langue: "FR",
      classification,
      genres: s.genres,
      tags: s.tags,
      auteurs: s.auteurs,
      noteMoy: Math.round((7 + ((si * 7) % 30) / 10) * 10) / 10,
      nbVotes: 40 + si * 61,
      vues: 12_000 + si * 3_457,
      populaire: 100 - si * 7,
      created_at: iso(-(400 - si * 10) * DAY),
      updated_at: iso(updatedOffset),
    };
    db[TABLES.series].set(seriesId, seriesRow);

    for (let n = 1; n <= nbChapters; n++) {
      const chapterId = `${seriesId}-c${n}`;
      // les derniers chapitres des 3 premières séries sont très récents
      const ageDays = n === nbChapters && si < 3 ? si : nbChapters - n + 3;
      const published = iso(-ageDays * DAY - n * 3600_000);
      const nbPages = 16 + ((n + si) % 7);
      const chapter = {
        id: chapterId,
        series_id: seriesId,
        numero: n,
        volume: Math.ceil(n / 10),
        titre: `Chapitre ${n}`,
        statut: "published" as const,
        publish_at: published,
        source: "nas" as const,
        nb_pages: nbPages,
        classification,
        vues: Math.max(10, (nbChapters - n + 1) * 137 + si * 41),
        created_by: "user-owner",
        created_at: published,
      };
      db[TABLES.chapters].set(chapterId, chapter);

      for (let p = 0; p < nbPages; p++) {
        const pageId = `${chapterId}-p${p}`;
        db[TABLES.pages].set(pageId, {
          id: pageId,
          chapter_id: chapterId,
          index: p,
          chemin: demoPagePath(slug, n, p),
          largeur: 1200,
          hauteur: 1800,
        });
      }
    }

    // recommandations éditoriales sur le catalogue
    if (si < 4) {
      db[TABLES.recommendations].set(`rec-${si}`, {
        id: `rec-${si}`,
        placement: "home",
        titre: si % 2 === 0 ? "Coup de cœur de la rédaction" : "À découvrir",
        series_id: seriesId,
        ordre: si,
        debut: null,
        fin: null,
        actif: true,
        created_at: iso(-10 * DAY),
      });
    }
  });

  // ── Commentaires ─────────────────────────────────────────────────────
  const comments: Array<[string, string, "series" | "chapter", string, string, number, boolean]> = [
    ["c1", "user-membre", "series", "s-les-poroiniens", "Le start d'arc est incroyable, j'ai relu les 10 premiers chapitres d'un coup.", 14, false],
    ["c2", "user-modo", "series", "s-le-jardin-des-miroirs", "Fin parfaite. Le dernier panneau dit tout sans un mot.", 9, false],
    ["c3", "user-admin", "chapter", "s-les-poroiniens-c24", "Attention spoiler : la révélation du chapitre 24 change tout ce qu'on pensait du village.", 6, true],
    ["c4", "user-membre", "chapter", "s-aurore-de-cendres-c18", "La qualité des planches est réellement au-dessus du commun pour un manhwa.", 5, false],
    ["c5", "user-modo", "series", "s-neon-district", "Le rythme du polar est parfait, à suivre de près.", 3, false],
  ];
  for (const [id, userId, type, target, contenu, likes, spoiler] of comments) {
    db[TABLES.comments].set(id, {
      id,
      target_type: type,
      target_id: target,
      parent_id: null,
      user_id: userId,
      pseudo:
        USERS.find((u) => u.id === userId)?.pseudo ?? "Anonyme",
      contenu,
      spoiler,
      likes,
      dislikes: 0,
      statut: "visible",
      created_at: iso(-((likes % 9) + 1) * DAY),
      updated_at: iso(-((likes % 9) + 1) * DAY),
    });
  }
  // une réponse imbriquée
  db[TABLES.comments].set("c2r", {
    id: "c2r",
    target_type: "series",
    target_id: "s-le-jardin-des-miroirs",
    parent_id: "c2",
    user_id: "user-membre",
    pseudo: "Yuki",
    contenu: "Je n'ai jamais réussi à trancher entre les deux fins possibles.",
    spoiler: false,
    likes: 2,
    dislikes: 0,
    statut: "visible",
    created_at: iso(-12 * 3600_000),
    updated_at: iso(-12 * 3600_000),
  });

  // ── Bibliothèque / historique du compte de démo ──────────────────────
  const memb = "user-membre";
  db[TABLES.library].set(`${memb}-s-les-poroiniens`, {
    id: `${memb}-s-les-poroiniens`,
    user_id: memb,
    series_id: "s-les-poroiniens",
    statut: "en_cours",
    favori: true,
    note: 9,
    last_chapter_id: "s-les-poroiniens-c22",
    last_page: 7,
    updated_at: iso(-2 * DAY),
  });
  db[TABLES.library].set(`${memb}-s-kitsune-blanc`, {
    id: `${memb}-s-kitsune-blanc`,
    user_id: memb,
    series_id: "s-kitsune-blanc",
    statut: "a_lire",
    favori: false,
    note: null,
    last_chapter_id: null,
    last_page: 0,
    updated_at: iso(-5 * DAY),
  });
  db[TABLES.history].set(`${memb}-h1`, {
    id: `${memb}-h1`,
    user_id: memb,
    chapter_id: "s-les-poroiniens-c22",
    series_id: "s-les-poroiniens",
    page: 7,
    completed: false,
    read_at: iso(-2 * DAY),
  });
  db[TABLES.history].set(`${memb}-h2`, {
    id: `${memb}-h2`,
    user_id: memb,
    chapter_id: "s-neon-district-c10",
    series_id: "s-neon-district",
    page: 18,
    completed: true,
    read_at: iso(-6 * DAY),
  });

  // ── Signalements en attente ──────────────────────────────────────────
  db[TABLES.reports].set("r1", {
    id: "r1",
    type: "comment",
    target_id: "c4",
    reporter_id: "user-membre",
    raison: "spoiler_non_masque",
    details: "Le commentaire raconte la fin sans la balise spoiler.",
    statut: "ouvert",
    handled_by: null,
    created_at: iso(-20 * 3600_000),
  });

  // ── Paramètres du site ───────────────────────────────────────────────
  for (const [cle, valeur] of [
    ["site_name", "Les Poroiniens"],
    ["announcement", ""],
    ["maintenance", "0"],
    ["registration_open", "1"],
  ]) {
    db[TABLES.settings].set(cle, { id: cle, cle, valeur });
  }

  return db;
}

let singleton: DemoDatabase | null = null;

export function getDemoStore(): DemoDatabase {
  if (!singleton) singleton = build();
  return singleton;
}

export function buildDemoData(): DemoDatabase {
  return getDemoStore();
}
