export * from "./types";
export * from "./oauth";
export { GmailProvider } from "./providers/gmail";
export { OutlookProvider } from "./providers/outlook";

import { EmailProvider, Provider } from "./types";
import { GmailProvider } from "./providers/gmail";
import { OutlookProvider } from "./providers/outlook";

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
