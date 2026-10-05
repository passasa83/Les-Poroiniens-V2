"use client";

import clsx from "clsx";
import { History, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { Badge } from "@/components/ui/kit";
import { SERIES_STATUT_LABELS, SERIES_TYPE_LABELS } from "@/lib/types";

type Result = {
  id: string;
  slug: string;
  titre: string;
  couverture: string;
  type: keyof typeof SERIES_TYPE_LABELS;
  statut: keyof typeof SERIES_STATUT_LABELS;
  classification: "all" | "adult";
};

/** Historique des 10 dernières recherches (§6.4), stocké localement. */
const HISTORY_KEY = "poroiniens:historique-recherche";
const HISTORY_MAX = 10;

function readHistory(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((v) => typeof v === "string").slice(0, HISTORY_MAX) : [];
  } catch {
    return [];
  }
}

function writeHistory(values: string[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(values.slice(0, HISTORY_MAX)));
  } catch {
    /* stockage indisponible : l'historique reste simplement vide. */
  }
}

/**
 * Champ de recherche à résultats instantanés (§6.4) : mini-couverture, titre,
 * type et statut ; historique local quand le champ est vide. Le formulaire
 * reste un GET classique vers `/recherche`, utilisable sans JavaScript.
 */
export function SearchBox({
  className,
  inputRef,
  initialQuery = "",
  autoFocus = false,
}: {
  className?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  initialQuery?: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const localRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? localRef;

  const [value, setValue] = useState(initialQuery);
  const [previousInitial, setPreviousInitial] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const [limited, setLimited] = useState(false);

  /* L'URL fait foi (retour/avant du navigateur) : ajustement pendant le rendu. */
  if (initialQuery !== previousInitial) {
    setPreviousInitial(initialQuery);
    setValue(initialQuery);
  }

  /* Résultats instantanés : requête débouncée et annulable (250 ms). */
  useEffect(() => {
    if (!open || value.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/catalogue/search?q=${encodeURIComponent(value.trim())}`,
          { signal: controller.signal },
        );
        if (res.status === 429) {
          setLimited(true);
          setResults([]);
          return;
        }
        const data: unknown = await res.json();
        setLimited(false);
        setResults(Array.isArray(data) ? (data as Result[]) : []);
        setActive(-1);
      } catch {
        /* annulation ou réseau indisponible : on conserve l'état courant. */
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, open]);

  function remember(query: string) {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    const next = [trimmed, ...history.filter((v) => v !== trimmed)].slice(0, HISTORY_MAX);
    setHistory(next);
    writeHistory(next);
  }

  function goTo(href: string) {
    setOpen(false);
    router.push(href);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const query = value.trim();
    if (!query) {
      event.preventDefault();
      ref.current?.focus();
      return;
    }
    event.preventDefault();
    remember(query);
    goTo(`/recherche?q=${encodeURIComponent(query)}`);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    const max = open ? (value.trim().length < 2 ? history.length : results.length) : 0;
    if (!max) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % max);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i <= 0 ? max - 1 : i - 1));
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      if (value.trim().length < 2) {
        const query = history[active];
        if (query) {
          setValue(query);
          remember(query);
          goTo(`/recherche?q=${encodeURIComponent(query)}`);
        }
      } else if (results[active]) {
        remember(value);
        goTo(`/serie/${results[active].slug}`);
      }
    }
  }

  const showHistory = open && value.trim().length < 2 && history.length > 0;
  const showResults = open && value.trim().length >= 2;
  const optionId = (index: number) => `recherche-option-${index}`;
  /* L'index actif peut devenir obsolète quand la liste change sous le curseur. */
  const maxItems = showHistory ? history.length : showResults ? results.length : 0;
  const safeActive = active >= 0 && active < maxItems ? active : -1;

  return (
    <div className={clsx("relative", className)}>
      <form action="/recherche" method="get" onSubmit={onSubmit} role="search">
        <div className="relative w-full">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            ref={ref}
            type="search"
            name="q"
            value={value}
            autoFocus={autoFocus}
            placeholder="Rechercher par titre ou auteur"
            aria-label="Rechercher par titre ou auteur"
            role="combobox"
            aria-expanded={showHistory || showResults}
            aria-controls="recherche-instantanee"
            aria-autocomplete="list"
            aria-activedescendant={safeActive >= 0 ? optionId(safeActive) : undefined}
            autoComplete="off"
            onChange={(event) => {
              setValue(event.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              setOpen(true);
              setHistory(readHistory());
            }}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
            className="input w-full min-h-10 pl-9"
          />
        </div>
      </form>

      {(showHistory || showResults) && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-y-auto rounded-lg border border-line bg-surface shadow-xl">
          <ul
            id="recherche-instantanee"
            role="listbox"
            aria-label={
              showHistory ? "Historique des recherches" : "Résultats de recherche"
            }
            className="max-h-80 py-1"
          >
            {showHistory &&
              history.map((query, index) => (
                <li
                  key={query}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === active}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setValue(query);
                    remember(query);
                    goTo(`/recherche?q=${encodeURIComponent(query)}`);
                  }}
                  className={clsx(
                    "flex cursor-pointer items-center gap-3 px-3 py-2",
                    index === active ? "bg-surface2" : "hover:bg-surface2",
                  )}
                >
                  <History aria-hidden className="size-4 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">{query}</span>
                </li>
              ))}

            {showResults &&
              results.map((serie, index) => (
                <li
                  key={serie.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === active}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    remember(value);
                    goTo(`/serie/${serie.slug}`);
                  }}
                  className={clsx(
                    "flex cursor-pointer items-center gap-3 px-3 py-2",
                    index === active ? "bg-surface2" : "hover:bg-surface2",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={serie.couverture}
                    alt=""
                    width={32}
                    height={48}
                    loading="lazy"
                    className="h-12 w-8 shrink-0 rounded border border-line object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">
                      {serie.titre}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {SERIES_TYPE_LABELS[serie.type]} ·{" "}
                      {SERIES_STATUT_LABELS[serie.statut]}
                    </span>
                  </span>
                  {serie.classification === "adult" && <Badge tone="adult">+18</Badge>}
                </li>
              ))}

            {showResults && results.length === 0 && !limited && (
              <li className="px-3 py-3 text-sm text-muted">Aucun résultat</li>
            )}
            {limited && (
              <li className="px-3 py-3 text-sm text-muted">
                Trop de recherches : réessayez dans quelques secondes.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
