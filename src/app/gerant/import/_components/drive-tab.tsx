"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Loader2, RefreshCw } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui/kit";

/** Onglet Google Drive : ressources de séries (couvertures, métadonnées), jamais les scans. */
export function DriveTab({ driveConfigured }: { driveConfigured: boolean }) {
  const router = useRouter();
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveMessage, setDriveMessage] = useState<string | null>(null);
  const [driveTone, setDriveTone] = useState<"ok" | "adult">("ok");

  async function launchDriveSync() {
    setDriveBusy(true);
    setDriveMessage(null);
    try {
      const res = await fetch("/api/owner/drive/sync", { method: "POST" });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        job?: { id: string; message: string };
      } | null;
      if (!res.ok) {
        setDriveTone("adult");
        setDriveMessage(data?.error ?? "Synchronisation impossible.");
        return;
      }
      setDriveTone("ok");
      setDriveMessage(
        data?.job ? `Job ${data.job.id} créé : ${data.job.message}` : "Synchronisation lancée.",
      );
      router.refresh();
    } catch {
      setDriveTone("adult");
      setDriveMessage("Erreur réseau : réessayez.");
    } finally {
      setDriveBusy(false);
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <h2 className="section-title flex items-center gap-2">
        <Archive className="size-4 text-primary" /> Google Drive — ressources de séries
      </h2>
      <ul className="space-y-2 text-sm text-muted">
        <li>• Drive ne contient que les couvertures, bannières et métadonnées des séries.</li>
        <li>• Les pages de scans ne transitent jamais par Drive : elles restent sur le NAS.</li>
        <li>• Connexion par compte de service, en lecture seule, côté serveur uniquement.</li>
        <li>• Aucun lien Drive n&apos;est exposé au client.</li>
      </ul>

      <div className="rounded-xl border border-line bg-surface2 px-4 py-3 text-sm">
        <span className="text-muted">État de la connexion : </span>
        {driveConfigured ? (
          <Badge tone="ok">Compte de service configuré</Badge>
        ) : (
          <Badge tone="warn">Non connecté</Badge>
        )}
        {!driveConfigured && (
          <p className="mt-2 text-xs text-muted">
            Renseignez <code className="font-mono">GOOGLE_DRIVE_SERVICE_ACCOUNT</code> (JSON du
            compte de service) et, si nécessaire,{" "}
            <code className="font-mono">GOOGLE_DRIVE_FOLDER_ID</code>.
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" variant="primary" onClick={launchDriveSync} disabled={driveBusy}>
          {driveBusy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Lancer une synchronisation
        </Button>
      </div>

      {driveMessage && (
        <p
          className={`rounded-xl border px-4 py-3 text-sm ${
            driveTone === "adult"
              ? "border-adult/40 bg-adult/10 text-adult"
              : "border-ok/40 bg-ok/10 text-ok"
          }`}
        >
          {driveMessage}
        </p>
      )}
    </Card>
  );
}
