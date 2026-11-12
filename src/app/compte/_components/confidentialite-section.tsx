"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Profile } from "@/lib/types";
import { apiJson, jsonInit } from "../_lib/api";
import { Notice, useNotice } from "./notice";
import { Toggle } from "./toggle";

export function ConfidentialiteSection({ profile }: { profile: Profile }) {
  const router = useRouter();
  const { notice, ok, fail } = useNotice();
  const [conf, setConf] = useState(profile.confidentialite);

  async function saveConfidentialite(next: Profile["confidentialite"]) {
    setConf(next);
    const result = await apiJson<{ ok: boolean }>(
      "/api/account/profile",
      jsonInit("PATCH", { confidentialite: next }),
    );
    if (!result.ok) return fail(result.error);
    ok("Confidentialité enregistrée.");
    router.refresh();
  }

  return (
    <>
      <Notice notice={notice} />
      <section className="card space-y-5 p-6" aria-label="Confidentialité">
        <p className="text-sm text-muted">
          Ces réglages décident de ce que les visiteurs voient sur votre{" "}
          <Link
            href={`/profil/${encodeURIComponent(profile.pseudo)}`}
            className="link-muted underline"
          >
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
    </>
  );
}
