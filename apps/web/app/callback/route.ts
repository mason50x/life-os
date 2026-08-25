import { handleAuth } from "@workos-inc/authkit-nextjs";
import { connectFromSignIn } from "@/lib/connect";

// Google's own tokens ride along in this response and nowhere else, so a
// sign-in with a Gmail-scoped grant is adopted as a connected account here.
export const GET = handleAuth({
  returnPathname: "/dashboard",
  onSuccess: ({ user, oauthTokens }) => connectFromSignIn(user.id, oauthTokens),
});
