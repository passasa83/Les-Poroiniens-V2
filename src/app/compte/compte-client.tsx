"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Download,
  Image as ImageIcon,
  Plus,
  Settings,
  Shield,
  SlidersHorizontal,
  Trash2,
  User,
  X,
} from "lucide-react";
import { Badge, Button, Field, Input, Select, Textarea } from "@/components/ui/kit";
import { Modal } from "@/components/ui/modal";
import { ROLE_LABELS } from "@/lib/roles";
import type { CurrentUser, Profile, UserPreferences } from "@/lib/types";

const MAX_AVATAR_BYTES = 800 * 1024;
const MAX_TAGS = 80;

type TabKey = "profil" | "preferences" | "confidentialite" | "compte";

type ApiReply = { error?: string; message?: string };

async function apiJson<T>(path: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(path, init);
    const data = (await res.json().catch(() => ({}))) as T & ApiReply;
    if (!res.ok) return { ok: false, error: data.error || "Une erreur est survenue." };
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Impossible de contacter le serveur." };
  }
}

/** Redimensionne en 256×256 WebP côté client (§14.5), ≤ 800 Ko. */
async function toWebpBlob(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  ctx.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height);
  bitmap.close?.();

  for (const quality of [0.85, 0.6, 0.4]) {
    const dataUrl = canvas.toDataURL("image/webp", quality);
    if (!dataUrl.startsWith("data:image/webp")) throw new Error("webp");
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: "image/webp" });
    if (blob.size <= MAX_AVATAR_BYTES) return blob;
  }
  throw new Error("size");
}

export function CompteClient({ user, profile }: { user: CurrentUser; profile: Profile }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("profil");
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  // Profil
  const [pseudo, setPseudo] = useState(profile.pseudo);
  const [bio, setBio] = useState(profile.bio);
  const [avatar, setAvatar] = useState<string | null>(profile.avatar);
  const [avatarBusy, setAvatarBusy] = useState(false);

  // Préférences
  const [prefs, setPrefs] = useState<UserPreferences>(profile.preferences);
  const [tag, setTag] = useState("");

  // Confidentialité
  const [conf, setConf] = useState(profile.confidentialite);

  // Compte
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function fail(text: string) {
    setNotice({ tone: "error", text });
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await apiJson<{ ok: boolean }>("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pseudo, bio }),
    });
    if (!result.ok) return fail(result.error);
    setNotice({ tone: "ok", text: "Profil enregistré." });
    router.refresh();
  }

  async function pickAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setAvatarBusy(true);
    setNotice(null);
    try {
      const blob = await toWebpBlob(file);
      const form = new FormData();
      form.append("file", blob, "avatar.webp");
      const result = await apiJson<{ ok: boolean; avatar: string }>("/api/account/avatar", {
        method: "POST",
        body: form,
      });
      if (!result.ok) return fail(result.error);
      setAvatar(result.data.avatar);
      setNotice({ tone: "ok", text: "Avatar mis à jour." });
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

  async function savePrefs(next: UserPreferences) {
    setPrefs(next);
    const result = await apiJson<{ ok: boolean }>("/api/account/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    if (!result.ok) return fail(result.error);
    setNotice({ tone: "ok", text: "Préférences enregistrées." });
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

  async function saveConfidentialite(next: Profile["confidentialite"]) {
    setConf(next);
    const result = await apiJson<{ ok: boolean }>("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confidentialite: next }),
    });
    if (!result.ok) return fail(result.error);
    setNotice({ tone: "ok", text: "Confidentialité enregistrée." });
    router.refresh();
  }

  async function deleteAccount() {
    setDeleting(true);
    const result = await apiJson<{ ok: boolean }>("/api/account", { method: "DELETE" });
    if (!result.ok) {
      setDeleting(false);
      setConfirmOpen(false);
      return fail(result.error);
    }
    router.push("/");
    router.refresh();
  }

  const tabs: Array<{ key: TabKey; label: string; icon: typeof User }> = [
    { key: "profil", label: "Profil", icon: User },
    { key: "preferences", label: "Préférences", icon: SlidersHorizontal },
    { key: "confidentialite", label: "Confidentialité", icon: Shield },
    { key: "compte", label: "Compte", icon: Settings },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-fg">Mon compte</h1>
          <p className="text-sm text-muted">
            {user.email} ·{" "}
            <Badge tone={user.role === "membre" ? "neutral" : "primary"}>
              {ROLE_LABELS[user.role]}
            </Badge>
          </p>
        </div>
        <Link href={`/profil/${encodeURIComponent(profile.pseudo)}`} className="btn-secondary text-sm">
          Voir mon profil public
        </Link>
      </header>

      <nav role="tablist" aria-label="Sections du compte" className="flex flex-wrap gap-2">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => {
              setTab(key);
              setNotice(null);
            }}
            className={`btn text-sm ${tab === key ? "btn-primary" : "btn-ghost"}`}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </nav>

      {notice && (
        <p
          role="status"
          className={`rounded-xl border px-3 py-2 text-sm ${
            notice.tone === "ok"
              ? "border-ok/40 bg-ok/10 text-ok"
              : "border-adult/40 bg-adult/10 text-adult"
          }`}
        >
          {notice.text}
        </p>
      )}

      {/* ── Profil ─────────────────────────────────────────────────── */}
      {tab === "profil" && (
        <section className="card space-y-5 p-6" aria-label="Profil">
          <div className="flex items-center gap-4">
            <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-surface2 text-lg font-bold text-primary">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatar}
                  alt={`Avatar de ${profile.pseudo}`}
                  className="size-20 object-cover"
                />
              ) : (
                profile.pseudo.slice(0, 2).toUpperCase()
              )}
            </div>
            <div className="min-w-0 space-y-2">
              <label className="btn-secondary cursor-pointer text-sm">
                <ImageIcon className="size-4" />
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
                Redimensionné en WebP 256×256, 800 Ko maximum (§14.5).
              </p>
            </div>
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
      )}

      {/* ── Préférences ────────────────────────────────────────────── */}
      {tab === "preferences" && (
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
              hint="Nouveaux chapitres des séries suivies et mentions."
              checked={prefs.notifications}
              onChange={(v) => void savePrefs({ ...prefs, notifications: v })}
            />
            <Toggle
              label="Afficher le contenu +18"
              hint="Retire le flou du catalogue classé adulte (§11)."
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
      )}

      {/* ── Confidentialité ────────────────────────────────────────── */}
      {tab === "confidentialite" && (
        <section className="card space-y-5 p-6" aria-label="Confidentialité">
          <p className="text-sm text-muted">
            Ces réglages décident de ce que les visiteurs voient sur votre{" "}
            <Link href={`/profil/${encodeURIComponent(profile.pseudo)}`} className="link-muted underline">
              profil public
            </Link>
            .
          </p>
          <Toggle
            label="Bibliothèque publique"
            hint="Vos séries suivies sont visibles par tous."
            checked={conf.bibliothequePublique}
            onChange={(v) => void saveConfidentialite({ ...conf, bibliothequePublique: v })}
          />
          <Toggle
            label="Statistiques publiques"
            hint="Vos chiffres de lecture apparaissent sur votre profil."
            checked={conf.statsPubliques}
            onChange={(v) => void saveConfidentialite({ ...conf, statsPubliques: v })}
          />
        </section>
      )}

      {/* ── Compte ─────────────────────────────────────────────────── */}
      {tab === "compte" && (
        <section className="card space-y-5 p-6" aria-label="Compte">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="label">Adresse e-mail</dt>
              <dd className="text-fg">{user.email}</dd>
            </div>
            <div>
              <dt className="label">Rôle</dt>
              <dd>
                <Badge tone={user.role === "membre" ? "neutral" : "primary"}>
                  {ROLE_LABELS[user.role]}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="label">Date d&apos;inscription</dt>
              <dd className="text-fg">
                {new Date(profile.date_inscription).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </dd>
            </div>
            <div>
              <dt className="label">Identifiant</dt>
              <dd className="truncate font-mono text-xs text-muted">{user.id}</dd>
            </div>
          </dl>

          <div className="divider" />

          <div className="space-y-3">
            <p className="section-title">Données personnelles (RGPD)</p>
            <p className="text-sm text-muted">
              Vous pouvez exporter l&apos;intégralité de vos données ou supprimer définitivement
              votre compte.
            </p>
            <div className="flex flex-wrap gap-2">
              <a className="btn-secondary" href="/api/account/export" download>
                <Download className="size-4" />
                Exporter mes données (JSON)
              </a>
              <button type="button" className="btn-danger" onClick={() => setConfirmOpen(true)}>
                <Trash2 className="size-4" />
                Supprimer mon compte
              </button>
            </div>
          </div>
        </section>
      )}

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Supprimer mon compte">
        <div className="space-y-4 text-sm">
          <p className="text-muted">
            Cette action est <strong className="text-adult">définitive</strong> : profil,
            bibliothèque, historique et statistiques seront effacés, vos commentaires seront
            anonymisés et votre session sera détruite.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setConfirmOpen(false)}
              disabled={deleting}
            >
              Annuler
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={() => void deleteAccount()}
              disabled={deleting}
            >
              {deleting ? "Suppression…" : "Supprimer définitivement"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-line bg-surface2 px-4 py-3">
      <span>
        <span className="block text-sm font-semibold text-fg">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-4 shrink-0 accent-[var(--primary)]"
      />
    </label>
  );
}
