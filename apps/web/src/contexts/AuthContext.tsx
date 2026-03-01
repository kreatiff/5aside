import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import type { ReactNode } from "react";
import { api, setAccessToken } from "../lib/api";
import { LoginSchema, MfaVerifySchema } from "@fiveaside/contracts";
import { z } from "zod";

type AdminInfo = {
  id: string;
  email: string;
  role: string;
};

type LoginCredentials = z.infer<typeof LoginSchema>;
type MfaCredentials = z.infer<typeof MfaVerifySchema>;

type AuthContextType = {
  admin: AdminInfo | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<{
    success: boolean;
    mfaRequired?: boolean;
    mfaToken?: string;
    error?: string;
  }>;
  verifyMfa: (
    credentials: MfaCredentials,
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [admin, setAdmin] = useState<AdminInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const initAuth = useCallback(async () => {
    setIsLoading(true);
    try {
      // Attempt silent refresh on startup
      const { data } = await api.post<{ accessToken: string }>("/auth/refresh");
      setAccessToken(data.accessToken);
      // We don't have a /me endpoint, but we can extract info from JWT
      // Actually, if we get token, let's decode it safely
      const payloadBase64 = data.accessToken.split(".")[1];
      if (payloadBase64) {
        const payloadStr = atob(payloadBase64);
        const payload = JSON.parse(payloadStr);
        setAdmin({ id: payload.sub, email: payload.email, role: payload.role });
      }
    } catch (err) {
      setAccessToken(null);
      setAdmin(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  useEffect(() => {
    const handleUnauthorized = () => setAdmin(null);
    window.addEventListener("unauthorized", handleUnauthorized);
    return () => window.removeEventListener("unauthorized", handleUnauthorized);
  }, []);

  const login = async (credentials: LoginCredentials) => {
    try {
      const { data } = await api.post("/auth/login", credentials);
      if (data.mfaRequired) {
        return { success: true, mfaRequired: true, mfaToken: data.mfaToken };
      }

      setAccessToken(data.accessToken);
      const payload = JSON.parse(atob(data.accessToken.split(".")[1]));
      setAdmin({ id: payload.sub, email: payload.email, role: payload.role });

      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err.response?.data?.error || "Login failed",
      };
    }
  };

  const verifyMfa = async (credentials: MfaCredentials) => {
    try {
      const { data } = await api.post("/auth/mfa/verify", credentials);
      setAccessToken(data.accessToken);
      const payload = JSON.parse(atob(data.accessToken.split(".")[1]));
      setAdmin({ id: payload.sub, email: payload.email, role: payload.role });
      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err.response?.data?.error || "MFA verification failed",
      };
    }
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      setAccessToken(null);
      setAdmin(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        admin,
        isAuthenticated: !!admin,
        isLoading,
        login,
        logout,
        verifyMfa,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
