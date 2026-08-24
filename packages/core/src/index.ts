export * from "./types";
export * from "./oauth";
export { GmailProvider } from "./providers/gmail";
export { OutlookProvider } from "./providers/outlook";
export { IcloudProvider } from "./providers/icloud";

import { EmailProvider, Provider } from "./types";
import { GmailProvider } from "./providers/gmail";
import { OutlookProvider } from "./providers/outlook";
import { IcloudProvider } from "./providers/icloud";

/**
 * `getSecret` returns the credential the provider authenticates with: an OAuth
 * access token for Gmail/Outlook, the app-specific password for iCloud.
 */
export function createProvider(
  provider: Provider,
  email: string,
  getSecret: () => Promise<string>,
): EmailProvider {
  switch (provider) {
    case "gmail":
      return new GmailProvider(email, getSecret);
    case "outlook":
      return new OutlookProvider(email, getSecret);
    case "icloud":
      return new IcloudProvider(email, getSecret);
  }
}
