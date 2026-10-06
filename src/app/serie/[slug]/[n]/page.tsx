import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { AdultGate } from "@/components/adult/adult-gate";
import { CommentsSection } from "@/components/comments/comments-section";
import { Reader } from "@/components/reader/reader";
import { SeriesGrid } from "@/components/series/series-card";
import { ChapitreIndisponible } from "./chapitre-indisponible";
import { adultGateAccepted, getCurrentUser } from "@/lib/auth";
import { getChapter, getReaderContext, recordView } from "@/lib/data/chapters";
import { listHistory } from "@/lib/data/library";
import {
  activeRecommendations,
  getSeriesById,
  getSeriesBySlug,
  similarSeries,
} from "@/lib/data/series";
import { publishDueChaptersOnDemand } from "@/lib/publishing";
import { can } from "@/lib/roles";
import type { Series } from "@/lib/types";

type Params = Promise<{ slug: string; n: string }>;

/**
 * Segment dynamique `[n]` réécrit depuis l'URL publique `/chapitre-{n}`
 * (voir `rewrites()` dans `next.config.ts`). On tolère les deux formes.
 * Les numéros décimaux (`chapitre-8.5`) sont routables : `numero` est un
 * `double` en base (migration `scripts/migrate-numero-double.mts`).
 */
function parseNumero(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = raw.replace(/^chapitre-/i, "");
  const numero = Number(value);
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

function chapterHref(slug: string, numero: number): string {
  return `/serie/${slug}/chapitre-${numero}`;
}

/** Ressource absente : `notFound()` est lancé dans une réponse streamée
 *  (loading.tsx) et laisse un statut 200 — on exclut donc la page des
 *  index (atténuation officielle Next, §11.2 « pas d'indexation parasite »). */
const INCOUVERT: Metadata = {
  title: "Chapitre introuvable",
  robots: { index: false, follow: false },
};

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, n } = await params;
  const numero = parseNumero(n);
  const series = await getSeriesBySlug(slug);
  if (!series || !numero) return INCOUVERT;

  const chapter = await getChapter(series.id, numero);
  // Chapitre inexistant : on renvoie le même titre que la page 404.
  if (!chapter) return INCOUVERT;

  const isAdult = series.classification === "adult" || chapter.classification === "adult";
  const title = `${series.titre} — Chapitre ${numero}`;
  const description = chapter?.titre ? `${title} : ${chapter.titre}` : title;

  return {
    title,
    description,
    // Contenu +18 : noindex + meta rating (§11.2)
    robots: isAdult ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      title,
      description,
      type: "article",
      ...(isAdult ? {} : { images: [{ url: series.couverture, alt: series.titre }] }),
    },
  };
}

export default async function ChapitrePage({ params }: { params: Params }) {
  const { slug, n } = await params;
  const numero = parseNumero(n);
  const series = await getSeriesBySlug(slug);
  if (!series || !numero) notFound();

  // Un lien direct vers un chapitre programmé mais déjà échu doit fonctionner
  // sans attendre le cron quotidien (limite du plan Hobby).
  await publishDueChaptersOnDemand();

  const [user, gateOk] = await Promise.all([getCurrentUser(), adultGateAccepted()]);
  // Aperçu des brouillons réservé au Gérant (§5.1, étape 4) : les pages sont
  // alors servies avec des URLs signées à 10 minutes.
  const allowDraft = Boolean(user && can(user.role, "publish_chapter"));

  const context = await getReaderContext(series, numero, { allowDraft });
  if (!context) notFound();

  const isAdult = series.classification === "adult" || context.chapter.classification === "adult";
  const needsGate = isAdult && !gateOk;

  const href = chapterHref(series.slug, context.chapter.numero);

  if (!needsGate && !context.preview) {
    await recordView(context.chapter);
  }

  let initialPage = 1;
  if (user) {
    const history = await listHistory(user.id, 500);
    const entry = history.find((h) => h.chapter_id === context.chapter.id);
    if (entry && entry.page > 0) initialPage = entry.page;
  }

  const prevHref = context.prev ? chapterHref(series.slug, context.prev.numero) : null;
  const nextHref = context.next ? chapterHref(series.slug, context.next.numero) : null;

  /* Fin de chapitre (§6.6) : recommandations éditoriales « end_chapter »,
     repli sur les séries similaires (jamais bloquant). */
  const adultOk = !isAdult || gateOk;
  const recommandees = needsGate
    ? []
    : await endOfChapterRecommendations(series, adultOk);

  const chapitres = context.chapters.map((c) => ({
    numero: c.numero,
    href: chapterHref(series.slug, c.numero),
  }));

  /* §6.12 « chapitre indisponible » : le chapitre existe mais aucune page ne
     se charge → message précis + Réessayer / Signaler, sans le lecteur. */
  const indisponible = !needsGate && context.pages.length === 0;

  const navigation = (
    <div className="container-site flex items-center justify-between gap-2">
      {prevHref ? (
        <Link href={prevHref} className="btn-secondary text-sm">
          <ChevronLeft className="size-4" /> Chapitre précédent
        </Link>
      ) : (
        <span className="btn-secondary text-sm opacity-50">Chapitre précédent</span>
      )}
      <Link href={`/serie/${series.slug}#chapitres`} className="btn-ghost text-sm">
        Tous les chapitres
      </Link>
      {nextHref ? (
        <Link href={nextHref} className="btn-primary text-sm">
          Chapitre suivant <ChevronRight className="size-4" />
        </Link>
      ) : (
        <span className="btn-primary text-sm opacity-50">Dernier chapitre</span>
      )}
    </div>
  );

  return (
    <div className="space-y-6 py-4">
      {isAdult && <meta name="rating" content="adult" />}

      <div className="container-site flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/serie/${series.slug}`} className="link-muted text-sm">
            ← {series.titre}
          </Link>
          <h1 className="mt-1 text-lg font-bold text-fg">
            Chapitre {context.chapter.numero}
            {context.chapter.titre && context.chapter.titre !== `Chapitre ${context.chapter.numero}`
              ? ` — ${context.chapter.titre}`
              : ""}
          </h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          {isAdult && <span className="badge bg-adult/15 text-adult">+18</span>}
          {/* Équipes du chapitre (mêmes pastilles que la fiche, en discret). */}
          {(context.chapter.teams ?? []).map((team) => (
            <span key={team} className="inline-flex items-center gap-1">
              <span aria-hidden className="size-1.5 rounded-full bg-primary" />
              {team}
            </span>
          ))}
          <span>
            {indisponible ? "Pages indisponibles" : `${context.pages.length} pages`}
          </span>
        </div>
      </div>

      {context.preview && (
        <div className="container-site">
          <div className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
            <strong>Aperçu d&apos;un chapitre non publié.</strong> Ce lien n&apos;est visible que
            pour vous (Gérant) et les URLs des pages expirent au bout de 10 minutes.
          </div>
        </div>
      )}

      {needsGate ? (
        <div className="container-site space-y-4">
          <AdultGate open next={href} />
          <div className="card flex flex-col items-center gap-3 p-8 text-center">
            <Lock className="size-8 text-adult" />
            <p className="section-title">Contenu réservé aux adultes</p>
            <p className="max-w-md text-sm text-muted">
              Validez la déclaration d&apos;âge pour afficher les pages de ce chapitre.
            </p>
          </div>
        </div>
      ) : indisponible ? (
        <>
          <ChapitreIndisponible
            chapterId={context.chapter.id}
            chapterNumero={context.chapter.numero}
            serieTitre={series.titre}
          />
          {navigation}

          <div className="container-site">
            <CommentsSection
              targetType="chapter"
              targetId={context.chapter.id}
              canComment={Boolean(user)}
              adultOnly={isAdult}
            />
          </div>
        </>
      ) : (
        <>
          <div className="container-site">
            <Reader
              key={context.chapter.id}
              pages={context.pages}
              chapterId={context.chapter.id}
              chapterNumero={context.chapter.numero}
              serieId={series.id}
              serieSlug={series.slug}
              serieTitre={series.titre}
              chapitres={chapitres}
              initialMode={user?.preferences.mode_lecture}
              initialSens={user?.preferences.sens_lecture}
              initialPage={initialPage}
              canProgress={Boolean(user) && !context.preview}
              canSync={Boolean(user) && !context.preview}
              initialLikes={context.chapter.likes ?? 0}
              prevHref={prevHref}
              nextHref={nextHref}
              nextChapterId={context.next?.id ?? null}
            />
          </div>

          {navigation}

          {/* Fin de chapitre (§6.6) : suite de la lecture ou suggestions. */}
          {recommandees.length > 0 && (
            <section className="container-site" aria-labelledby="recommandees-titre">
              <h2 className="section-title" id="recommandees-titre">
                Séries recommandées
              </h2>
              <div className="mt-4">
                <SeriesGrid series={recommandees} adultAllowed={adultOk} />
              </div>
            </section>
          )}

          <div className="container-site">
            <CommentsSection
              targetType="chapter"
              targetId={context.chapter.id}
              canComment={Boolean(user)}
              adultOnly={isAdult}
            />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Séries proposées en fin de chapitre (§6.6) : recommandations éditoriales
 * placées en « end_chapter », sinon repli sur les séries similaires de la
 * série en cours. Quatre suggestions au maximum, jamais la série elle-même.
 */
async function endOfChapterRecommendations(
  series: Series,
  adultOk: boolean,
): Promise<Series[]> {
  const out: Series[] = [];
  const seen = new Set<string>([series.id]);

  try {
    const recos = await activeRecommendations("end_chapter");
    for (const reco of recos) {
      if (out.length >= 4) break;
      if (seen.has(reco.series_id)) continue;
      const target = await getSeriesById(reco.series_id);
      if (!target || seen.has(target.id)) continue;
      if (target.classification === "adult" && !adultOk) continue;
      seen.add(target.id);
      out.push(target);
    }
  } catch {
    /* recommandations facultatives */
  }

  if (out.length === 0) {
    try {
      const similaires = await similarSeries(series, 4);
      for (const s of similaires) {
        if (out.length >= 4) break;
        if (seen.has(s.id)) continue;
        if (s.classification === "adult" && !adultOk) continue;
        seen.add(s.id);
        out.push(s);
      }
    } catch {
      /* pas de suggestion plutôt qu'une erreur */
    }
  }

  return out;
}
