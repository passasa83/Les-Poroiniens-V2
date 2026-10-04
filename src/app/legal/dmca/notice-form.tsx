"use client";

import { Send } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, Field, Input, Textarea } from "@/components/ui/kit";

type Status = "idle" | "sending" | "sent" | "limited" | "invalid" | "error";

/**
 * Formulaire de signalement (notice & takedown) → POST /api/legal/notice.
 * L'API répond de façon identique quel que soit le résultat du traitement.
 */
export function NoticeForm() {
  const [status, setStatus] = useState<Status>("idle");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") return;

    const form = event.currentTarget;
    const data = new FormData(form);
    const body = {
      serie: String(data.get("serie") ?? ""),
      chapitre: String(data.get("chapitre") ?? ""),
      emplacement: String(data.get("emplacement") ?? ""),
      droits: String(data.get("droits") ?? ""),
      email: String(data.get("email") ?? ""),
      nom: String(data.get("nom") ?? ""),
    };

    setStatus("sending");
    try {
      const res = await fetch("/api/legal/notice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 429) setStatus("limited");
      else if (res.status === 400) setStatus("invalid");
      else if (!res.ok) setStatus("error");
      else {
        setStatus("sent");
        form.reset();
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <form
      className="rounded-2xl border border-line bg-surface2 p-5 sm:p-6"
      onSubmit={onSubmit}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Série ou œuvre concernée" htmlFor="serie" hint="Titre exact ou slug de la série.">
            <Input id="serie" name="serie" required minLength={2} maxLength={200} autoComplete="off" />
          </Field>
        </div>
        <Field label="Chapitre ou page concerné (facultatif)" htmlFor="chapitre">
          <Input id="chapitre" name="chapitre" maxLength={100} autoComplete="off" placeholder="Ex. chapitre 12, page 4" />
        </Field>
        <Field label="Votre e-mail de contact" htmlFor="email" hint="Pour vous répondre si besoin.">
          <Input id="email" name="email" type="email" required maxLength={200} autoComplete="email" />
        </Field>
        <div className="sm:col-span-2">
          <Field
            label="Description de l'emplacement"
            htmlFor="emplacement"
            hint="URL complète, titre du chapitre, position dans la page…"
          >
            <Textarea id="emplacement" name="emplacement" required minLength={5} maxLength={1000} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field
            label="Justification de vos droits"
            htmlFor="droits"
            hint="Précisez la qualité dont vous vous prévaluez et le fondement de votre demande."
          >
            <Textarea id="droits" name="droits" required minLength={10} maxLength={3000} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Nom ou organisation (facultatif)" htmlFor="nom">
            <Input id="nom" name="nom" maxLength={200} autoComplete="organization" />
          </Field>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" variant="primary" disabled={status === "sending"}>
          <Send className="size-4" aria-hidden />
          {status === "sending" ? "Envoi en cours…" : "Envoyer le signalement"}
        </Button>
        <p className="text-xs text-muted">
          Trois envois maximum par heure et par adresse IP.
        </p>
      </div>

      {status !== "idle" && <div className="divider my-4" />}
      <div aria-live="polite" className="space-y-3">
        {status === "sent" && (
          <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-fg">
            Votre signalement a bien été enregistré. Il sera examiné par l&apos;équipe et traité
            dans les meilleurs délais.
          </p>
        )}
        {status === "limited" && (
          <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-fg">
            Trop de signalements envoyés depuis votre adresse pour le moment. Réessayez plus tard.
          </p>
        )}
        {status === "invalid" && (
          <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-fg">
            Le formulaire est incomplet ou contient des informations invalides. Vérifiez les champs
            et réessayez.
          </p>
        )}
        {status === "error" && (
          <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-fg">
            Une erreur est survenue pendant l&apos;envoi. Réessayez dans un instant.
          </p>
        )}
      </div>
    </form>
  );
}
