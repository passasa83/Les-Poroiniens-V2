"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/server/auth";
import { removeLibraryEntry } from "@/lib/data/library";
import { atLeast } from "@/lib/roles";

/** Retire la ligne de sa bibliothèque : l'identité vient de la session. */
export async function retirerAction(formData: FormData) {
  const user = await getCurrentUser();
  const seriesId = String(formData.get("seriesId") ?? "");
  if (!user || !seriesId || !atLeast(user.role, "membre")) return;
  await removeLibraryEntry(user.id, seriesId);
  revalidatePath("/bibliotheque");
}
