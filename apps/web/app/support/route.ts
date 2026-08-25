import { NextResponse } from "next/server";

/**
 * `/support` is the address we hand out in docs and error messages; it just
 * opens a mail composer. A route handler rather than a `next.config` redirect
 * because Next only compiles path-like destinations there, not `mailto:`.
 */
export const GET = () =>
  NextResponse.redirect("mailto:mason@cognify.design", { status: 307 });
