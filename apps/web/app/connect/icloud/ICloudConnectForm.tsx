"use client";

import { useActionState, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { connectICloud, type ICloudFormState } from "./actions";

/** "aBcD EfGh..." → "abcd-efgh-ijkl-mnop" while the user types or pastes. */
function formatAppPassword(raw: string): string {
  const letters = raw.toLowerCase().replace(/[^a-z]/g, "").slice(0, 16);
  return letters.replace(/(.{4})(?=.)/g, "$1-");
}

export function ICloudConnectForm() {
  const [state, formAction, pending] = useActionState<ICloudFormState, FormData>(
    connectICloud,
    {},
  );
  const [password, setPassword] = useState("");

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="icloud-email">Primary iCloud address (sign-in)</Label>
        <Input
          id="icloud-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@icloud.com"
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Your @icloud.com, @me.com, or @mac.com address — Apple only accepts sign-ins with the
          primary address, even for mail on a custom domain.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="icloud-password">App-specific password</Label>
        <Input
          id="icloud-password"
          name="password"
          type="text"
          required
          value={password}
          onChange={(e) => setPassword(formatAppPassword(e.target.value))}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="xxxx-xxxx-xxxx-xxxx"
          className="font-mono tracking-[0.15em] placeholder:tracking-normal"
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Paste it however Apple shows it — we&apos;ll format it. This is <strong>not</strong>{" "}
          your Apple Account password.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="icloud-addresses">
          Custom domain &amp; alias addresses{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="icloud-addresses"
          name="addresses"
          type="text"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="you@yourdomain.com, support@yourdomain.com"
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          iCloud+ custom-domain and alias addresses share one mailbox, so they all use this same
          sign-in. Each address you list becomes its own LifeOS account you can send from. Leave
          empty to connect the primary address; include it in the list if you want it too.
        </p>
      </div>

      {state.error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle className="whitespace-normal">{state.error}</AlertTitle>
        </Alert>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Verifying with iCloud…" : "Connect iCloud Mail"}
      </Button>

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        Stored AES-256 encrypted and only ever sent to Apple&apos;s mail servers. Revoke it
        anytime at account.apple.com — LifeOS access stops instantly.
      </p>
    </form>
  );
}
