export * from "./types";
export * from "./oauth";
export { GmailProvider } from "./providers/gmail";
export { OutlookProvider } from "./providers/outlook";
export { GoogleCalendarProvider } from "./providers/googleCalendar";

import { CalendarProvider, EmailProvider, Provider, ProviderApiError } from "./types";
import { GmailProvider } from "./providers/gmail";
import { OutlookProvider } from "./providers/outlook";
import { GoogleCalendarProvider } from "./providers/googleCalendar";

/**
 * `getSecret` returns the credential the provider authenticates with: an OAuth
 * access token for Gmail/Outlook, the app-specific password for iCloud.
 *
 * The iCloud provider (and its imapflow/mailparser/nodemailer dependency tree)
 * is loaded on demand — import it from `@lifeos/core/icloud` when constructing
 * it directly — so Gmail/Outlook-only code paths never pay its startup cost.
 */
export async function createProvider(
  provider: Provider,
  email: string,
  getSecret: () => Promise<string>,
): Promise<EmailProvider> {
  switch (provider) {
    case "gmail":
      return new GmailProvider(email, getSecret);
    case "outlook":
      return new OutlookProvider(email, getSecret);
    case "icloud": {
      const { IcloudProvider } = await import("./providers/icloud");
      return new IcloudProvider(email, getSecret);
    }
  }
}

/**
 * The calendar half of the same account. `getSecret` is the identical closure
 * `createProvider` takes — one connected account, one credential, two surfaces.
 *
 * The iCloud CalDAV client is loaded on demand for the same reason its IMAP
 * sibling is; import it from `@lifeos/core/icloud-calendar` to construct it
 * directly.
 */
export async function createCalendarProvider(
  provider: Provider,
  email: string,
  getSecret: () => Promise<string>,
  opts: { loginEmail?: string } = {},
): Promise<CalendarProvider> {
  switch (provider) {
    case "gmail":
      return new GoogleCalendarProvider(email, getSecret);
    case "icloud": {
      const { IcloudCalendarProvider } = await import("./providers/icloudCalendar");
      return new IcloudCalendarProvider(email, getSecret, opts.loginEmail ?? email);
    }
    case "outlook":
      throw new ProviderApiError(
        "outlook",
        501,
        "LifeOS doesn't do Outlook calendars yet — only Google and Apple. The account's mail still works.",
      );
  }
}
