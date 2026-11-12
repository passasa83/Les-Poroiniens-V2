import "server-only";
import { getDb, TABLES } from "@/server/db";
import { cached, invalidate } from "@/server/cache";
import { idDeDemo } from "@/lib/demo-gate";
import { newId } from "@/lib/ids";
import type { AuditEntry, ImportJob, Report } from "@/lib/types";

/* ── Signalements ────────────────────────────────────────── */

export async function createReport(
  input: Omit<Report, "id" | "statut" | "handled_by" | "created_at">,
): Promise<Report> {
  const report: Report = {
    ...input,
    id: newId("r"),
    statut: "ouvert",
    handled_by: null,
    created_at: new Date().toISOString(),
  };
  await getDb().create(TABLES.reports, report.id, report);
  return report;
}

export async function listReports(statut?: Report["statut"]): Promise<Report[]> {
  const { items } = await getDb().list(TABLES.reports, {
    filters: statut ? [{ field: "statut", op: "eq", value: statut }] : undefined,
    order: { field: "created_at", dir: "desc" },
    limit: 200,
  });
  /* Signalement de la graine — ou visant un contenu de la graine : la file de
     modération ne doit pas exposer le jeu de démonstration en production. */
  return items.filter((r) => !idDeDemo(r.id) && !idDeDemo(r.target_id));
}

export async function handleReport(
  id: string,
  statut: Report["statut"],
  handlerId: string,
): Promise<void> {
  await getDb().update(TABLES.reports, id, { statut, handled_by: handlerId });
}

/* ── Journal d'audit ──────────────────────────────────────────── */

export async function audit(entry: {
  actorId: string;
  actorPseudo: string;
  action: string;
  cible: string;
  avant?: unknown;
  apres?: unknown;
  ip?: string;
}): Promise<void> {
  const row: AuditEntry = {
    id: newId("a"),
    actor_id: entry.actorId,
    actor_pseudo: entry.actorPseudo,
    action: entry.action,
    cible: entry.cible,
    avant: entry.avant === undefined ? null : JSON.stringify(entry.avant).slice(0, 4000),
    apres: entry.apres === undefined ? null : JSON.stringify(entry.apres).slice(0, 4000),
    ip: entry.ip ?? "local",
    created_at: new Date().toISOString(),
  };
  await getDb().create(TABLES.audit, row.id, row);
}

/** L'écriture est possible par tous les rôles autorisés, la lecture complète
 *  est réservée au Gérant ; les admins n'en voient qu'une version tronquée. */
export async function listAudit(opts: { full: boolean; limit?: number }): Promise<AuditEntry[]> {
  const { items } = await getDb().list(TABLES.audit, {
    order: { field: "created_at", dir: "desc" },
    limit: opts.full ? (opts.limit ?? 200) : 30,
  });
  return opts.full ? items : items.map((a) => ({ ...a, avant: null, apres: null, ip: "—" }));
}

/* ── Paramètres du site (Gérant) ─────────────────────────────────────── */

export async function getSettings(): Promise<Record<string, string>> {
  /* Paramètres lus à CHAQUE page (l'en-tête en dépend) : un cache court évite
     un aller-retour vers le backend à chaque rendu. Écritures invalidées par
     `setSetting` — l'admin voit sa valeur immédiatement après enregistrement. */
  return cached("settings:tout", 60_000, async () => {
    const { items } = await getDb().list(TABLES.settings, { limit: 200 });
    return Object.fromEntries(items.map((s) => [s.cle, s.valeur]));
  });
}

export async function setSetting(cle: string, valeur: string): Promise<void> {
  const db = getDb();
  const existing = await db.get(TABLES.settings, cle);
  if (existing) await db.update(TABLES.settings, cle, { valeur });
  else await db.create(TABLES.settings, cle, { cle, valeur });
  invalidate("settings:");
}

/* ── Jobs d'import (espace Gérant) ───────────────────────────────────── */

export async function listImportJobs(limit = 50): Promise<ImportJob[]> {
  const { items } = await getDb().list(TABLES.importJobs, {
    order: { field: "created_at", dir: "desc" },
    limit,
  });
  return items;
}

export async function createImportJob(
  job: Omit<ImportJob, "id" | "created_at">,
): Promise<ImportJob> {
  const row: ImportJob = { ...job, id: newId("job"), created_at: new Date().toISOString() };
  await getDb().create(TABLES.importJobs, row.id, row);
  return row;
}

export async function updateImportJob(id: string, patch: Partial<ImportJob>): Promise<void> {
  await getDb().update(TABLES.importJobs, id, patch as Record<string, unknown>);
}
