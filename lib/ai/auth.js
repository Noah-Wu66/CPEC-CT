import { getCurrentUserFromCookies } from "@/lib/auth";

function toAuthPayload(current) {
  if (!current?.user?._id) {
    return null;
  }

  return {
    userId: current.user._id.toString(),
    email: current.user.email,
    role: current.user.role,
  };
}

export async function getAuthPayload() {
  const current = await getCurrentUserFromCookies();
  return toAuthPayload(current);
}
