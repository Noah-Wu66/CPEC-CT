import type { UserDoc } from "@/types/domain";

export function sanitizeUser(user: UserDoc) {
  return {
    id: user._id.toString(),
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}
