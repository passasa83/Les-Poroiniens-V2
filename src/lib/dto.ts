/**
 * Types échangés entre les routes serveur et les composants clients de
 * l'accueil. Volontairement réduits au strict nécessaire : ni les
 * chapitres complets ni les objets séries ne quittent le serveur.
 */
import type { Classification, SeriesType } from "@/lib/types";

export type ReleaseDto = {
  id: string;
  numero: number;
  publishAt: string | null;
  classification: Classification;
  series: {
    slug: string;
    titre: string;
    couverture: string;
    type: SeriesType;
    classification: Classification;
  };
};
