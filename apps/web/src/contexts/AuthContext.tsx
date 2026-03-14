import {
  createContext,
  useContext,
} from "react";
import type { ReactNode } from "react";

type AdminInfo = {
  id: string;
  email: string;
  role: string;
};

type AuthContextType = {
  admin: AdminInfo | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => Promise<{ success: boolean }>;
  verifyMfa: () => Promise<{ success: boolean }>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const admin: AdminInfo = {
    id: "00000000-0000-0000-0000-000000000000",
    email: "admin@5aside.internal",
    role: "admin",
  };

  const login = async () => ({ success: true });
  const verifyMfa = async () => ({ success: true });
  const logout = async () => {};

  return (
    <AuthContext.Provider
      value={{
        admin,
        isAuthenticated: true,
        isLoading: false,
        login,
        logout,
        verifyMfa,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
