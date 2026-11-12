import "server-only";
import { dataMode } from "@/server/db";
import { DEMO_ACCOUNTS } from "@/server/db/seed";
import type { DemoAccount } from "@/components/auth/connexion-form";

/**
 * Comptes de démonstration proposés uniquement quand Appwrite n'est pas
 * configuré (mode démo). Partagés par la page `/connexion` et la modale
 * d'authentification pour rester identiques partout.
 */
export function demoAccounts(): DemoAccount[] {
  if (dataMode() !== "demo") return [];
  return DEMO_ACCOUNTS.map(({ email, password, pseudo, role }) => ({
    email,
    password,
    pseudo,
    role,
  }));
}
