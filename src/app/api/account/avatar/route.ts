import { NextResponse } from "next/server";
import { adminClient, avatarBucket, storage } from "@/lib/appwrite";
import { getCurrentUser } from "@/lib/auth";
import { dataMode } from "@/lib/db";
import { updateProfile } from "@/lib/data/users";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { InputFile } from "node-appwrite/file";

const MAX_BYTES = 800 * 1024; // poids maximal de l'avatar
const DEMO_MAX_BYTES = 200 * 1024; // data-URL stockée dans le profil

/** En-tête réel du fichier : `RIFF....WEBP` (pas seulement le Content-Type envoyé). */
function isWebp(buf: Buffer): boolean {
  return (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  );
}

function fromDataUrl(value: string): Buffer | null {
  const match = /^data:image\/webp;base64,([A-Za-z0-9+/=\s]+)$/.exec(value.trim());
  if (!match) return null;
  return Buffer.from(match[1].replace(/\s/g, ""), "base64");
}

/**
 * POST /api/account/avatar — reçu en FormData, redimensionné côté client en
 * WebP 256×256. Le serveur revérifie la signature binaire et la taille, puis :
 *  - mode Appwrite → bucket `avatars`, fichier `avatars/{userId}.webp`,
 *    l'URL enregistrée porte un `?v=` horodaté pour invalider le cache CDN ;
 *  - mode démo → data-URL conservée dans `profiles.avatar`.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentification requise.", code: "unauthorized" },
      { status: 401 },
    );
  }

  const limit = rateLimit(`account:avatar:${user.id}:${clientIp(request)}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Trop d'envois d'avatar. Réessayez dans un instant.", code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Requête invalide.", code: "bad_request" }, { status: 400 });
  }

  const field = form.get("file");
  let buffer: Buffer | null = null;
  if (typeof field === "string") {
    buffer = field.startsWith("data:image/webp") ? fromDataUrl(field) : null;
  } else if (field && typeof field === "object" && "arrayBuffer" in field) {
    buffer = Buffer.from(await field.arrayBuffer());
  }

  if (!buffer || !isWebp(buffer)) {
    return NextResponse.json(
      { error: "Fichier WebP attendu.", code: "invalid_type" },
      { status: 400 },
    );
  }
  if (buffer.length > MAX_BYTES) {
    return NextResponse.json(
      { error: "Avatar trop volumineux (800 Ko maximum).", code: "too_large" },
      { status: 400 },
    );
  }

  if (dataMode() === "demo") {
    if (buffer.length > DEMO_MAX_BYTES) {
      return NextResponse.json(
        { error: "Avatar trop volumineux (200 Ko maximum en mode démonstration).", code: "too_large" },
        { status: 400 },
      );
    }
    const dataUrl = `data:image/webp;base64,${buffer.toString("base64")}`;
    await updateProfile(user.id, { avatar: dataUrl });
    return NextResponse.json({ ok: true, avatar: dataUrl });
  }

  const bytes: Buffer = buffer;
  const bucket = avatarBucket();
  const svc = storage(adminClient());
  const put = async (fileId: string): Promise<boolean> => {
    try {
      await svc.deleteFile({ bucketId: bucket, fileId }); // remplacement d'un avatar précédent
    } catch {
      /* le fichier peut ne pas exister : on continue */
    }
    try {
      await svc.createFile({
        bucketId: bucket,
        fileId,
        file: InputFile.fromBuffer(bytes, `${user.id}.webp`),
      });
      return true;
    } catch {
      return false;
    }
  };

  // Identifiant fixe par utilisateur, avec repli si l'instance
  // Appwrite refuse les « / » dans les identifiants de fichiers.
  let fileId = `avatars/${user.id}.webp`;
  if (!(await put(fileId))) {
    fileId = `${user.id}.webp`;
    if (!(await put(fileId))) {
      return NextResponse.json(
        { error: "Impossible d'enregistrer l'avatar.", code: "upload_failed" },
        { status: 500 },
      );
    }
  }

  const endpoint = (process.env.APPWRITE_ENDPOINT || "").replace(/\/$/, "");
  const project = process.env.APPWRITE_PROJECT_ID || "";
  const avatar = `${endpoint}/storage/buckets/${bucket}/files/${encodeURIComponent(fileId)}/preview?project=${project}&v=${Date.now()}`;
  await updateProfile(user.id, { avatar });

  return NextResponse.json({ ok: true, avatar });
}
