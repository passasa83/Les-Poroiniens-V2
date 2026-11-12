import Link from "next/link";
import { MonitorSmartphone, Settings, Shield, SlidersHorizontal, User } from "lucide-react";
import type { SectionKey } from "../sections";

const TABS: Array<{ key: SectionKey; label: string; icon: typeof User }> = [
  { key: "profil", label: "Profil", icon: User },
  { key: "preferences", label: "Préférences", icon: SlidersHorizontal },
  { key: "confidentialite", label: "Confidentialité", icon: Shield },
  { key: "sessions", label: "Sessions", icon: MonitorSmartphone },
  { key: "compte", label: "Compte", icon: Settings },
];

/** Onglets du compte : de vrais liens `?section=`, utilisables sans JavaScript. */
export function CompteOnglets({ section }: { section: SectionKey }) {
  return (
    <nav aria-label="Sections du compte" className="flex flex-wrap gap-2">
      {TABS.map(({ key, label, icon: Icon }) => (
        <Link
          key={key}
          href={`/compte?section=${key}`}
          aria-current={section === key ? "page" : undefined}
          className={`btn text-sm ${section === key ? "btn-primary" : "btn-ghost"}`}
        >
          <Icon className="size-4" aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );
}
