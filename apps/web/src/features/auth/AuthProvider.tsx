import { useEffect, useRef, useState, type PropsWithChildren } from "react";

import type {
  AuthenticatedUserData,
  UserProfileData,
} from "../../shared/api/generated/types.gen";
import {
  setAccessToken,
  setRefreshAccessTokenHandler,
} from "../../shared/api/client";
import {
  getProfileRequest,
  changePasswordRequest,
  loginRequest,
  logoutRequest,
  refreshAccessToken,
} from "./authApi";
import {
  AuthContext,
  type AuthContextValue,
  type AuthStatus,
} from "./AuthContext";

function profileToUser(profile: UserProfileData): AuthenticatedUserData {
  return {
    email: profile.email,
    id: profile.id,
    nickname: profile.nickname,
    avatar_url: profile.avatar_url,
    phone_e164: profile.phone_e164,
    role: profile.role,
    status: profile.status,
    username: profile.username,
    must_change_password: profile.must_change_password,
  };
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>("bootstrapping");
  const [user, setUser] = useState<AuthenticatedUserData | null>(null);
  const restored = useRef(false);

  useEffect(() => {
    const handleRefresh = async () => {
      try {
        const token = await refreshAccessToken();
        setAccessToken(token);
        return token;
      } catch {
        setAccessToken(null);
        setUser(null);
        setStatus("anonymous");
        return null;
      }
    };
    setRefreshAccessTokenHandler(handleRefresh);
    return () => setRefreshAccessTokenHandler(undefined);
  }, []);

  useEffect(() => {
    if (restored.current) {
      return;
    }
    restored.current = true;
    void (async () => {
      try {
        const token = await refreshAccessToken();
        setAccessToken(token);
        const profile = await getProfileRequest();
        setUser(profileToUser(profile));
        setStatus("authenticated");
      } catch {
        setAccessToken(null);
        setUser(null);
        setStatus("anonymous");
      }
    })();
  }, []);

  const value: AuthContextValue = {
    changePassword: async (currentPassword, newPassword) => {
      const result = await changePasswordRequest({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setAccessToken(result.access_token);
      setUser(profileToUser(result.user));
    },
    status,
    user,
    login: async (identifier, password) => {
      const result = await loginRequest({ identifier, password });
      setAccessToken(result.accessToken);
      setUser(result.user);
      setStatus("authenticated");
    },
    logout: async () => {
      try {
        await logoutRequest();
      } catch {
        // Local authentication state must still be cleared.
      } finally {
        setAccessToken(null);
        setUser(null);
        setStatus("anonymous");
      }
    },
    refreshProfile: async () => {
      const profile = await getProfileRequest();
      setUser(profileToUser(profile));
      return profile;
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
