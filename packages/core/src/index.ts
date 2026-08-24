export * from "./types";
export * from "./oauth";
export { GmailProvider } from "./providers/gmail";
export { OutlookProvider } from "./providers/outlook";

import { EmailProvider, Provider } from "./types";
import { GmailProvider } from "./providers/gmail";
import { OutlookProvider } from "./providers/outlook";

export function createProvider(
  provider: Provider,
  email: string,
  getAccessToken: () => Promise<string>,
): EmailProvider {
  return provider === "gmail"
    ? new GmailProvider(email, getAccessToken)
    : new OutlookProvider(email, getAccessToken);
}
