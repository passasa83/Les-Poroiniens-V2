"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, LayoutDashboard, LogOut, Settings, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CurrentUser } from "@/lib/types";
import { can } from "@/lib/roles";

export function UserMenu({ user, unread }: { user: CurrentUser; unread: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="btn-ghost gap-1.5 px-2"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="grid size-7 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">
          {user.pseudo.slice(0, 2).toUpperCase()}
        </span>
        <span className="hidden max-w-24 truncate text-sm sm:inline">{user.pseudo}</span>
        <ChevronDown className="size-3.5 text-muted" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 w-56 space-y-1 rounded-2xl border border-line bg-surface p-2 shadow-xl"
        >
          <Link href={`/profil/${user.pseudo}`} className="block rounded-lg px-3 py-2 text-sm hover:bg-surface2" role="menuitem">
            Mon profil
          </Link>
          <Link href="/compte" className="block rounded-lg px-3 py-2 text-sm hover:bg-surface2" role="menuitem">
            <Settings className="mr-2 inline size-4 text-muted" />
            Paramètres
          </Link>
          <Link href="/notifications" className="block rounded-lg px-3 py-2 text-sm hover:bg-surface2" role="menuitem">
            Notifications
            {unread > 0 && (
              <span className="ml-2 rounded-full bg-adult/20 px-2 py-0.5 text-xs text-adult">
                {unread}
              </span>
            )}
          </Link>
          {can(user.role, "edit_series") && (
            <Link href="/admin" className="block rounded-lg px-3 py-2 text-sm hover:bg-surface2" role="menuitem">
              <LayoutDashboard className="mr-2 inline size-4 text-muted" />
              Administration
            </Link>
          )}
          {can(user.role, "import_chapters") && (
            <Link href="/gerant" className="block rounded-lg px-3 py-2 text-sm hover:bg-surface2" role="menuitem">
              <Upload className="mr-2 inline size-4 text-muted" />
              Espace Gérant
            </Link>
          )}
          <div className="divider my-1" />
          <button
            type="button"
            onClick={logout}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-adult hover:bg-surface2"
            role="menuitem"
          >
            <LogOut className="mr-2 inline size-4" />
            Déconnexion
          </button>
        </div>
      )}
    </div>
  );
}
