"use client";

import { useState, useTransition } from "react";
import { KeyIcon } from "@heroicons/react/24/outline";
import { createApiKey, deleteApiKey } from "@/app/dashboard/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
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
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const { key } = await createApiKey(name);
            setNewKey(key);
            setName("");
          });
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Key name (e.g. laptop CLI)"
          aria-label="Key name"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create key"}
        </Button>
      </form>

      {newKey && (
        <Alert>
          <KeyIcon />
          <AlertTitle>Copy this key now — it won&apos;t be shown again.</AlertTitle>
          <AlertDescription>
            <div className="flex w-full items-center justify-between gap-3">
              <code className="break-all font-mono">{newKey}</code>
              <CopyButton value={newKey} />
            </div>
          </AlertDescription>
        </Alert>
      )}

      {keys.length > 0 && (
        <ItemGroup>
          {keys.map((k, i) => (
            <div key={k._id}>
              {i > 0 && <ItemSeparator />}
              <Item size="sm" className="px-0">
                <ItemContent>
                  <ItemTitle>{k.name}</ItemTitle>
                  <ItemDescription className="font-mono">
                    {k.prefix}… · created {new Date(k.createdAt).toLocaleDateString()}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => startTransition(() => deleteApiKey(k._id))}
                  >
                    Revoke
                  </Button>
                </ItemActions>
              </Item>
            </div>
          ))}
        </ItemGroup>
      )}
    </div>
  );
}
