"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { PencilSquareIcon } from "@heroicons/react/24/outline";
import { renameAccountAction } from "@/app/dashboard/actions";
import { Input } from "@/components/ui/input";

/**
 * The account's name, renamed in place. Click the name — or the pencil that
 * appears alongside it — and it becomes the field it already looked like:
 * Enter saves, Escape cancels, and an empty box hands the account back its
 * default name rather than reading as an error.
 */
export function AccountName({
  id,
  name,
  nickname,
  defaultName,
  maxLength,
}: {
  id: string;
  /** What the account currently reads as, collisions already resolved. */
  name: string;
  /** The name the user set, if any — what the field starts out holding. */
  nickname?: string;
  /** Shown as the placeholder: what clearing the field would leave behind. */
  defaultName: string;
  maxLength: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(nickname ?? "");
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const open = () => {
    setDraft(nickname ?? "");
    setEditing(true);
  };

  const save = () => {
    if (draft.trim() === (nickname ?? "")) return setEditing(false);
    startTransition(async () => {
      await renameAccountAction(id, draft);
      setEditing(false);
    });
  };

  if (editing) {
    return (
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Input
          ref={input}
          value={draft}
          autoFocus
          disabled={pending}
          maxLength={maxLength}
          aria-label={`Name for ${defaultName}`}
          placeholder={defaultName}
          className="h-7 max-w-56"
          onChange={(e) => setDraft(e.target.value)}
          // Clicking anywhere else is a save, not a cancel — the same thing
          // Enter does, so a half-typed name isn't lost by looking away.
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {pending ? "Saving…" : "Enter to save · Esc to cancel"}
        </span>
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      className="flex min-w-0 max-w-full items-center gap-1.5 rounded-sm text-sm transition-colors hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      title="Rename"
    >
      <span className="min-w-0 truncate">{name}</span>
      <PencilSquareIcon
        className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
    </button>
  );
}
