"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button, Field, Input, Select } from "@/components/ui/kit";
import type { UserPreferences } from "@/lib/types";
import { apiJson, jsonInit } from "../_lib/api";
import { Notice, useNotice } from "./notice";
import { Toggle } from "./toggle";

const MAX_TAGS = 80;

export function PreferencesSection({ initial }: { initial: UserPreferences }) {
  const router = useRouter();
  const { notice, ok, fail } = useNotice();
  const [prefs, setPrefs] = useState<UserPreferences>(initial);
  const [tag, setTag] = useState("");

  async function savePrefs(next: UserPreferences) {
    setPrefs(next);
    const result = await apiJson<{ ok: boolean }>(
      "/api/account/preferences",
      jsonInit("PATCH", next),
    );
    if (!result.ok) return fail(result.error);
    ok("Préférences enregistrées.");
    router.refresh();
  }

  function addTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = tag.trim();
    if (!value) return;
    if (prefs.tagsMasques.some((t) => t.toLowerCase() === value.toLowerCase())) {
      return fail("Ce tag est déjà masqué.");
    }
    if (prefs.tagsMasques.length >= MAX_TAGS) {
      return fail(`80 tags masqués au maximum.`);
    }
    setTag("");
    void savePrefs({ ...prefs, tagsMasques: [...prefs.tagsMasques, value].slice(0, MAX_TAGS) });
  }

  return (
    <>
      <Notice notice={notice} />
      <section className="card space-y-5 p-6" aria-label="Préférences">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Thème" htmlFor="theme">
            <Select
              id="theme"
              value={prefs.theme}
              onChange={(e) =>
                void savePrefs({ ...prefs, theme: e.target.value as UserPreferences["theme"] })
              }
            >
              <option value="dark">Sombre</option>
              <option value="light">Clair</option>
              <option value="system">Système</option>
            </Select>
          </Field>

          <Field label="Langue" htmlFor="langue">
            <Select
              id="langue"
              value={prefs.langue}
              onChange={(e) => void savePrefs({ ...prefs, langue: e.target.value })}
            >
              <option value="fr">Français</option>
              <option value="en">English</option>
              <option value="ja">日本語</option>
            </Select>
          </Field>

          <Field label="Sens de lecture" htmlFor="sens">
            <Select
              id="sens"
              value={prefs.sens_lecture}
              onChange={(e) =>
                void savePrefs({
                  ...prefs,
                  sens_lecture: e.target.value as UserPreferences["sens_lecture"],
                })
              }
            >
              <option value="rtl">De droite à gauche (manga)</option>
              <option value="ltr">De gauche à droite</option>
            </Select>
          </Field>

          <Field label="Mode de lecture par défaut" htmlFor="mode">
            <Select
              id="mode"
              value={prefs.mode_lecture}
              onChange={(e) =>
                void savePrefs({
                  ...prefs,
                  mode_lecture: e.target.value as UserPreferences["mode_lecture"],
                })
              }
            >
              <option value="vertical">Défilement vertical</option>
              <option value="single">Page unique</option>
              <option value="double">Double page</option>
            </Select>
          </Field>
        </div>

        <div className="divider" />

        <div className="space-y-3">
          <Toggle
            label="Notifications in-app"
            hint="Nouveaux contenus des séries suivies et mentions."
            checked={prefs.notifications}
            onChange={(v) => void savePrefs({ ...prefs, notifications: v })}
          />
          <Toggle
            label="Afficher le contenu +18"
            hint="Retire le flou du catalogue classé adulte."
            checked={prefs.adult_ok}
            onChange={(v) => void savePrefs({ ...prefs, adult_ok: v })}
          />
        </div>

        <div className="divider" />

        <div className="space-y-3">
          <div>
            <p className="label">Tags masqués</p>
            <p className="text-xs text-muted">
              {prefs.tagsMasques.length}/{MAX_TAGS} tags — les séries portant ces tags seront
              masquées côté serveur.
            </p>
          </div>

          <form onSubmit={addTag} className="flex gap-2">
            <Input
              value={tag}
              maxLength={60}
              onChange={(e) => setTag(e.target.value)}
              placeholder="Ajouter un tag (ex. harem)"
              aria-label="Nouveau tag à masquer"
            />
            <Button type="submit" variant="secondary">
              <Plus className="size-4" />
              Ajouter
            </Button>
          </form>

          {prefs.tagsMasques.length === 0 ? (
            <p className="rounded-xl border border-line bg-surface2 px-3 py-2 text-xs text-muted">
              Aucun tag masqué pour l&apos;instant.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {prefs.tagsMasques.map((item) => (
                <li key={item}>
                  <span className="chip chip-active">
                    {item}
                    <button
                      type="button"
                      aria-label={`Retirer le tag ${item}`}
                      className="ml-1 rounded-full hover:text-adult"
                      onClick={() =>
                        void savePrefs({
                          ...prefs,
                          tagsMasques: prefs.tagsMasques.filter((t) => t !== item),
                        })
                      }
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
