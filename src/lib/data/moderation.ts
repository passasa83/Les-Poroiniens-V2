import "server-only";
import { getDb, TABLES } from "@/lib/db";
import { idDeDemo } from "@/lib/demo-gate";
import type { AuditEntry, ImportJob, Notification, Report, SiteSetting } from "@/lib/types";

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/* ── Signalements (§8 / §9.4) ────────────────────────────────────────── */

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
  await getDb().create<Report>(TABLES.reports, report.id, report as unknown as Record<string, unknown>);
  return report;
}

export async function listReports(statut?: Report["statut"]): Promise<Report[]> {
  const { items } = await getDb().list<Report>(TABLES.reports, {
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
  await getDb().update<Report>(TABLES.reports, id, { statut, handled_by: handlerId });
}

/* ── Journal d'audit (§9.5) ──────────────────────────────────────────── */

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
  await getDb().create<AuditEntry>(TABLES.audit, row.id, row as unknown as Record<string, unknown>);
}

/** L'écriture est possible par tous les rôles autorisés, la lecture complète
 *  est réservée au Gérant ; les admins n'en voient qu'une version tronquée. */
export async function listAudit(opts: { full: boolean; limit?: number }): Promise<AuditEntry[]> {
  const { items } = await getDb().list<AuditEntry>(TABLES.audit, {
    order: { field: "created_at", dir: "desc" },
    limit: opts.full ? (opts.limit ?? 200) : 30,
  });
  return opts.full ? items : items.map((a) => ({ ...a, avant: null, apres: null, ip: "—" }));
}

/* ── Paramètres du site (Gérant) ─────────────────────────────────────── */

export async function getSettings(): Promise<Record<string, string>> {
  const { items } = await getDb().list<SiteSetting>(TABLES.settings, { limit: 200 });
  return Object.fromEntries(items.map((s) => [s.cle, s.valeur]));
}

export async function setSetting(cle: string, valeur: string): Promise<void> {
  const db = getDb();
  const existing = await db.get<SiteSetting>(TABLES.settings, cle);
  if (existing) await db.update<SiteSetting>(TABLES.settings, cle, { valeur });
  else await db.create<SiteSetting>(TABLES.settings, cle, { cle, valeur });
}

/* ── Jobs d'import (espace Gérant) ───────────────────────────────────── */

export async function listImportJobs(limit = 50): Promise<ImportJob[]> {
  const { items } = await getDb().list<ImportJob>(TABLES.importJobs, {
    order: { field: "created_at", dir: "desc" },
    limit,
  });
  return items;
}

export async function createImportJob(
  job: Omit<ImportJob, "id" | "created_at">,
): Promise<ImportJob> {
  const row: ImportJob = { ...job, id: newId("job"), created_at: new Date().toISOString() };
  await getDb().create<ImportJob>(TABLES.importJobs, row.id, row as unknown as Record<string, unknown>);
  return row;
}

export async function updateImportJob(id: string, patch: Partial<ImportJob>): Promise<void> {
  await getDb().update<ImportJob>(TABLES.importJobs, id, patch as Record<string, unknown>);
}

/* ── Notifications in-app (§7.3) ─────────────────────────────────────── */

export async function listNotifications(userId: string): Promise<Notification[]> {
  const { items } = await getDb().list<Notification>(TABLES.notifications, {
    filters: [{ field: "user_id", op: "eq", value: userId }],
    order: { field: "created_at", dir: "desc" },
    limit: 50,
  });
  return items;
}

export async function notify(userId: string, type: Notification["type"], payload: Record<string, unknown>) {
  const n: Notification = {
    id: newId("n"),
    user_id: userId,
    type,
    payload,
    lu: false,
    created_at: new Date().toISOString(),
  };
  await getDb().create<Notification>(TABLES.notifications, n.id, n as unknown as Record<string, unknown>);
}

export async function markNotificationsRead(userId: string): Promise<void> {
  const items = await listNotifications(userId);
  for (const n of items.filter((x) => !x.lu)) {
    await getDb().update<Notification>(TABLES.notifications, n.id, { lu: true });
  }
}
