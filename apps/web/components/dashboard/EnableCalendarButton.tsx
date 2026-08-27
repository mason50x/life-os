"use client";

import { useFormStatus } from "react-dom";
import { CalendarDaysIcon } from "@heroicons/react/24/outline";
import { enableCalendarAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * Adds calendar to an account that was connected for mail — no password, no
 * consent screen, in the common case. The work is a live round trip to Apple
 * or Google with the credential already on file, so the button has to show
 * that it's busy or it reads as a dead one.
 */
export function EnableCalendarButton({ id }: { id: string }) {
  return (
    <form action={enableCalendarAction.bind(null, id)}>
      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <CalendarDaysIcon data-icon="inline-start" />
      )}
      {pending ? "Checking…" : "Enable calendar"}
    </Button>
  );
}
