import type { LifeOsClient } from "../lib/api.js";
import type { LiveClient } from "../lib/live.js";

export interface ScreenProps {
  client: LifeOsClient;
  /**
   * Live subscriptions, when this session can have them (see connectLive).
   * Absent or null means HTTP-only: screens load once and refresh after
   * their own writes, exactly as before live existed.
   */
  live?: LiveClient | null;
  /** Whether the content pane has focus; screens ignore input when it doesn't. */
  focused: boolean;
  /** Rows available to the screen, for windowing long lists. */
  height: number;
  /** Tell the shell something changed, so sidebar counts stay honest. */
  onChanged?: () => void;
}
