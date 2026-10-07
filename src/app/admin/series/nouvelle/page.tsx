import { redirect } from "next/navigation";

/**
 * La création d'une série est réservée à l'espace Gérant : les liens et
 * favoris existants continuent donc de fonctionner, redirigés.
 */
export default function AdminNouvelleSeriePage() {
  redirect("/admin/series");
}
