"use client";

import { useState, type FormEvent } from "react";
import { FileImage, Images, Loader2, RefreshCw } from "lucide-react";
import { Badge, Button, Card, Field, Input } from "@/components/ui/kit";
import { ImportForm } from "./import-form";
import { formatBytes, getJson, type ImgInfo, type ImgPost } from "./types";
import type { ImportTarget } from "./use-import-target";
import type { SingleImport } from "./use-single-import";

/** Onglet ImgChest : un album = une unité de lecture, servie par le CDN d'ImgChest. */
export function ImgchestTab({
  target,
  single,
  imgchestList,
}: {
  target: ImportTarget;
  single: SingleImport;
  /** Vrai si `IMG_CHEST_USERNAME` est renseignée (liste des albums). */
  imgchestList: boolean;
}) {
  const [imgPosts, setImgPosts] = useState<ImgPost[]>([]);
  const [imgPage, setImgPage] = useState(1);
  const [imgMore, setImgMore] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);
  const [imgManual, setImgManual] = useState("");
  const [imgSelected, setImgSelected] = useState<string | null>(null);
  const [imgInfo, setImgInfo] = useState<ImgInfo | null>(null);

  /** Albums récents du compte : une page = 24 albums. */
  async function loadImgPosts(page = 1) {
    setImgBusy(true);
    setImgError(null);
    try {
      const { res, data } = await getJson<{ posts?: ImgPost[]; hasMore?: boolean }>(
        `/api/owner/imgchest/posts?page=${page}`,
      );
      if (!res.ok) {
        setImgError(data?.error ?? "Liste des albums impossible.");
        if (page === 1) setImgPosts([]);
        return;
      }
      const posts = Array.isArray(data?.posts) ? data.posts : [];
      setImgPosts((prev) => (page === 1 ? posts : [...prev, ...posts]));
      setImgPage(page);
      setImgMore(Boolean(data?.hasMore));
    } catch {
      setImgError("Erreur réseau : réessayez.");
    } finally {
      setImgBusy(false);
    }
  }

  /** Retient un album : le nombre de pages est vérifié avant l'import. */
  async function selectImgPost(id: string) {
    const wanted = id.trim();
    if (!wanted) {
      setImgError("Saisissez un identifiant d'album.");
      return;
    }
    setImgBusy(true);
    setImgError(null);
    try {
      const { res, data } = await getJson<{
        id?: string;
        title?: string;
        count?: number;
        bytes?: number;
        views?: number;
        nsfw?: boolean;
      }>(`/api/owner/imgchest/post?id=${encodeURIComponent(wanted)}`);
      if (!res.ok || typeof data?.count !== "number") {
        setImgError(data?.error ?? "Album introuvable.");
        setImgInfo(null);
        setImgSelected(null);
        return;
      }
      const albumId = data.id ?? wanted;
      setImgInfo({
        id: albumId,
        title: data.title ?? "Sans titre",
        count: data.count,
        bytes: data.bytes ?? 0,
        views: data.views ?? 0,
        nsfw: Boolean(data.nsfw),
      });
      setImgSelected(albumId);
      setImgManual(albumId);
    } catch {
      setImgError("Erreur réseau : réessayez.");
    } finally {
      setImgBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!imgSelected) {
      single.setError("Sélectionnez un album ImgChest (ou saisissez son identifiant).");
      return;
    }
    const ok = await single.submit({ source: "imgchest", imgchest_post: imgSelected });
    if (ok) {
      setImgSelected(null);
      setImgInfo(null);
    }
  }

  return (
    <Card className="space-y-5 p-5">
      <div>
        <h2 className="section-title flex items-center gap-2">
          <Images className="size-4 text-primary" /> Albums ImgChest
        </h2>
        <p className="mt-1 text-xs text-muted">
          Un album = un {target.sing}. Les images restent sur le CDN d&apos;ImgChest : seul
          l&apos;index des pages est enregistré en base, la lecture n&apos;appelle jamais ImgChest.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Field label="Identifiant d'album" htmlFor="i-imgchest" hint="Ex. : qe4gwgozq7j">
          <Input
            id="i-imgchest"
            value={imgManual}
            onChange={(e) => setImgManual(e.target.value)}
            placeholder="qe4gwgozq7j"
            className="max-w-[16rem]"
          />
        </Field>
        <Button type="button" onClick={() => void selectImgPost(imgManual)} disabled={imgBusy}>
          {imgBusy ? <Loader2 className="size-4 animate-spin" /> : <FileImage className="size-4" />}
          Vérifier l&apos;album
        </Button>
        {imgchestList && (
          <Button type="button" onClick={() => void loadImgPosts(1)} disabled={imgBusy}>
            <RefreshCw className="size-4" />
            Albums récents
          </Button>
        )}
      </div>

      {!imgchestList && (
        <p className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          La liste automatique est désactivée : renseignez la variable{" "}
          <code className="font-mono">IMG_CHEST_USERNAME</code> (compte qui héberge les scans) puis
          redéployez. La saisie manuelle d&apos;identifiant fonctionne déjà.
        </p>
      )}

      {imgError && <p className="text-sm text-adult">{imgError}</p>}

      {imgPosts.length > 0 && (
        <ul className="max-h-80 overflow-auto rounded-xl border border-line divide-y divide-line">
          {imgPosts.map((post) => (
            <li key={post.id}>
              <button
                type="button"
                aria-pressed={imgSelected === post.id}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${
                  imgSelected === post.id ? "bg-surface2" : "hover:bg-surface2"
                }`}
                onClick={() => void selectImgPost(post.id)}
              >
                {post.thumbnail ? (
                  // CDN externe d'ImgChest : miniatures 40px, non optimisables par next/image.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={post.thumbnail}
                    alt=""
                    width={40}
                    height={40}
                    loading="lazy"
                    className="size-10 shrink-0 rounded-md border border-line object-cover"
                  />
                ) : (
                  <Images className="size-5 shrink-0 text-muted" />
                )}
                <span className="truncate text-fg">{post.title}</span>
                {post.nsfw && <Badge tone="adult">+18</Badge>}
                <span className="ml-auto shrink-0 text-xs tabular-nums text-muted">
                  {post.views.toLocaleString("fr-FR")} vues
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {imgMore && (
        <div>
          <Button type="button" onClick={() => void loadImgPosts(imgPage + 1)} disabled={imgBusy}>
            <RefreshCw className="size-4" /> Albums suivants
          </Button>
        </div>
      )}

      {imgInfo && (
        <p className="rounded-xl border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok">
          Album retenu : <span className="font-semibold text-fg">{imgInfo.title}</span> —{" "}
          {imgInfo.count} pages · {formatBytes(imgInfo.bytes)}
          {imgInfo.nsfw ? " · +18" : ""}
        </p>
      )}

      <ImportForm {...single.formProps("imgchest", submit)} />
    </Card>
  );
}
