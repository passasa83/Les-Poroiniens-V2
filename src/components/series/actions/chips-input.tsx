"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/kit";

/* ── Saisie multi-capsules (titres alternatifs, genres, tags, auteurs) ── */

export function ChipsInput({
  id,
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const item = raw.trim();
    if (!item) return;
    if (!value.some((v) => v.toLowerCase() === item.toLowerCase())) {
      onChange([...value, item]);
    }
    setDraft("");
  };

  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
            }
            if (e.key === "Backspace" && !draft && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
        />
        <button
          type="button"
          className="btn-secondary shrink-0"
          onClick={() => add(draft)}
          aria-label={`Ajouter « ${label} »`}
        >
          <Plus className="size-4" />
        </button>
      </div>
      {hint && !value.length && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((item) => (
            <span key={item} className="chip border-primary/50 text-fg">
              {item}
              <button
                type="button"
                className="ml-1.5 text-muted hover:text-adult"
                onClick={() => onChange(value.filter((v) => v !== item))}
                aria-label={`Retirer ${item}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
