"use client";

import { useState, useTransition } from "react";
import { createApiKey, deleteApiKey } from "@/app/dashboard/actions";
import { CopyButton } from "./CopyButton";

interface KeyRow {
  _id: string;
  name: string;
  prefix: string;
  createdAt: number;
}

export function KeyManager({ keys }: { keys: KeyRow[] }) {
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <form
        className="flex gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const { key } = await createApiKey(name);
            setNewKey(key);
            setName("");
          });
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Key name (e.g. laptop CLI)"
          className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm placeholder:text-zinc-500 focus:border-indigo-400/50 focus:outline-none"
        />
        <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
          {pending ? "Creating…" : "Create key"}
        </button>
      </form>

      {newKey && (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4">
          <p className="mb-2 text-xs font-medium text-emerald-300">
            Copy this key now — it won&apos;t be shown again.
          </p>
          <div className="flex items-center justify-between gap-3">
            <code className="break-all font-mono text-sm text-emerald-200">{newKey}</code>
            <CopyButton value={newKey} />
          </div>
        </div>
      )}

      {keys.length > 0 && (
        <ul className="divide-y divide-white/5">
          {keys.map((k) => (
            <li key={k._id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium">{k.name}</p>
                <p className="font-mono text-xs text-zinc-500">
                  {k.prefix}… · created {new Date(k.createdAt).toLocaleDateString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => startTransition(() => deleteApiKey(k._id))}
                className="text-xs text-zinc-500 transition hover:text-red-400"
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
