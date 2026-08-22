import { createContext } from "react";

import type { AuthenticatedUserData } from "../../shared/api/generated/types.gen";

export type AuthStatus = "bootstrapping" | "anonymous" | "authenticated";

export interface AuthContextValue {
  changePassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  status: AuthStatus;
  user: AuthenticatedUserData | null;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
