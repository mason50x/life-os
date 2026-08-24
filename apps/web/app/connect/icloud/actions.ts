"use server";

import { redirect } from "next/navigation";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { ProviderApiError } from "@lifeos/core";
import { api, convex, serviceKey } from "@/lib/convex";
import { encryptSecret } from "@/lib/crypto";

export interface ICloudFormState {
  error?: string;
}

export async function connectICloud(
  _prev: ICloudFormState,
  formData: FormData,
): Promise<ICloudFormState> {
  const { user } = await withAuth({ ensureSignedIn: true });

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "")
    .trim()
    .toLowerCase();
  // Optional custom-domain / alias send-as addresses (comma, space, or
  // newline separated). They all live in the primary account's mailbox.
  const sendAs = [
    ...new Set(
      String(formData.get("addresses") ?? "")
        .toLowerCase()
        .split(/[\s,;]+/)
        .filter(Boolean),
    ),
  ];

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!validEmail.test(email)) {
    return { error: "Enter your primary iCloud Mail email address." };
  }
  const badAddress = sendAs.find((a) => !validEmail.test(a));
  if (badAddress) {
    return { error: `"${badAddress}" doesn't look like an email address.` };
  }
  if (!/^[a-z]{4}-[a-z]{4}-[a-z]{4}-[a-z]{4}$/.test(password)) {
    return {
      error:
        "That doesn't look like an app-specific password — it has the form xxxx-xxxx-xxxx-xxxx. (It's not your Apple Account password.)",
    };
  }

  try {
    // Live IMAP login against Apple before storing anything. Lazy import keeps
    // the IMAP stack out of every other route's cold start.
    const { IcloudProvider } = await import("@lifeos/core/icloud");
    await IcloudProvider.verify(email, password);
  } catch (e) {
    if (e instanceof ProviderApiError && e.status === 401) {
      return {
        error:
          "iCloud rejected the sign-in. Double-check the email address and the app-specific password — it may have been revoked, or the address may not be your primary iCloud Mail address.",
      };
    }
    console.error("iCloud verification failed:", e);
    return { error: "Couldn't reach iCloud Mail to verify. Try again in a moment." };
  }

  // One connected account per address: the primary (unless the user only
  // listed custom addresses) plus each send-as address, all sharing the same
  // credential and mailbox.
  const addresses = sendAs.length > 0 ? sendAs : [email];
  for (const address of addresses) {
    await convex().mutation(api.accounts.upsert, {
      serviceKey: serviceKey(),
      userId: user.id,
      provider: "icloud",
      email: address,
      ...(address !== email ? { loginEmail: email } : {}),
      accessTokenEnc: encryptSecret(password),
      // App-specific passwords don't expire, so there is no refresh flow.
      accessTokenExpiresAt: Number.MAX_SAFE_INTEGER,
    });
  }

  redirect(`/dashboard?connected=${encodeURIComponent(addresses.join(", "))}`);
}
