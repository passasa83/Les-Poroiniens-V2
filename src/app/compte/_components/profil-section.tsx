"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Image as ImageIcon } from "lucide-react";
import { Button, Field, Input, Textarea } from "@/components/ui/kit";
import type { Profile } from "@/lib/types";
import { apiJson, jsonInit } from "../_lib/api";
import { toWebpBlob } from "../_lib/avatar";
import { Notice, useNotice } from "./notice";

export function ProfilSection({ profile }: { profile: Profile }) {
  const router = useRouter();
  const { notice, ok, fail, clear } = useNotice();
  const [pseudo, setPseudo] = useState(profile.pseudo);
  const [bio, setBio] = useState(profile.bio);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatar = profile.avatar;

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await apiJson<{ ok: boolean }>(
      "/api/account/profile",
      jsonInit("PATCH", { pseudo, bio }),
    );
    if (!result.ok) return fail(result.error);
    ok("Profil enregistré.");
    router.refresh();
  }

  async function pickAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setAvatarBusy(true);
    clear();
    try {
      const blob = await toWebpBlob(file);
      const form = new FormData();
      form.append("file", blob, "avatar.webp");
      const result = await apiJson<{ ok: boolean; avatar: string }>("/api/account/avatar", {
        method: "POST",
        body: form,
      });
      if (!result.ok) return fail(result.error);
      ok("Avatar mis à jour.");
      // L'en-tête (rendu serveur) affiche le nouvel avatar après rafraîchissement.
      router.refresh();
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "size") fail("Image trop lourde : 800 Ko maximum après redimensionnement.");
      else if (code === "webp") fail("Votre navigateur ne sait pas produire de fichier WebP.");
      else fail("Impossible de lire cette image.");
    } finally {
      setAvatarBusy(false);
    }
  }

  return (
    <>
      <Notice notice={notice} />
      <section className="card space-y-5 p-6" aria-label="Profil">
        <div className="space-y-2">
          <label className="btn-secondary cursor-pointer text-sm">
            <ImageIcon className="size-4" aria-hidden />
            {avatarBusy ? "Envoi…" : avatar ? "Changer l’avatar" : "Ajouter un avatar"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={avatarBusy}
              onChange={(e) => void pickAvatar(e)}
            />
          </label>
          <p className="text-xs text-muted">
            L’avatar est affiché en tête de votre compte et sur votre profil public. Redimensionné
            en WebP 256×256, 800 Ko maximum.
          </p>
        </div>

        <form onSubmit={saveProfile} className="space-y-4">
          <Field label="Pseudo" htmlFor="pseudo" hint="Unique sur le site, 3 à 24 caractères.">
            <Input
              id="pseudo"
              value={pseudo}
              maxLength={24}
              onChange={(e) => setPseudo(e.target.value)}
              autoComplete="username"
            />
          </Field>
          <Field label="Bio" htmlFor="bio" hint="280 caractères maximum.">
            <Textarea
              id="bio"
              value={bio}
              maxLength={280}
              rows={4}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Vos séries préférées, votre rythme de lecture…"
            />
          </Field>
          <Button type="submit" variant="primary">
            Enregistrer le profil
          </Button>
        </form>
      </section>
    </>
  );
}
