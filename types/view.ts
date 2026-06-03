import type { Role } from "@/types/domain";

export interface UserView {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  createdAt: string | Date;
  updatedAt: string | Date;
}
