import type { LifeOsClient } from "../lib/api.js";

export interface ScreenProps {
  client: LifeOsClient;
  /** Whether the content pane has focus; screens ignore input when it doesn't. */
  focused: boolean;
  /** Rows available to the screen, for windowing long lists. */
  height: number;
  /** Tell the shell something changed, so sidebar counts stay honest. */
  onChanged?: () => void;
}
