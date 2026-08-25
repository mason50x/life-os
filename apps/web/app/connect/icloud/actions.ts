"use server";

import { redirect } from "next/navigation";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { connectIcloudAccount, parseAddresses } from "@/lib/icloudConnect";

export interface ICloudFormState {
  error?: string;
}

export async function connectICloud(
  _prev: ICloudFormState,
  formData: FormData,
): Promise<ICloudFormState> {
  const { user } = await withAuth({ ensureSignedIn: true });

  const result = await connectIcloudAccount(user.id, {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    sendAs: parseAddresses(String(formData.get("addresses") ?? "")),
  });
  if ("error" in result) return result;

  redirect(`/dashboard?connected=${encodeURIComponent(result.addresses.join(", "))}`);
}
