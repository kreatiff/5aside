import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { Layout } from "./components/Layout";
import { useAuth } from "./contexts/AuthContext";
import { LoginPage } from "./pages/LoginPage";
import { MfaPage } from "./pages/MfaPage";
import { DashboardPage } from "./pages/DashboardPage";
import { PlayersPage } from "./pages/PlayersPage";
import { PlayerDetailPage } from "./pages/PlayerDetailPage";
import { GamesPage } from "./pages/GamesPage";
import { GameDetailPage } from "./pages/GameDetailPage";
import { ImportsPage } from "./pages/ImportsPage";
import { ReconciliationPage } from "./pages/ReconciliationPage";
import { SettingsPage } from "./pages/SettingsPage";

// eslint-disable-next-line react-refresh/only-export-components
const ProtectedRoute = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          background: "var(--bg-base)",
        }}
      >
        <p style={{ color: "var(--text-secondary)" }}>Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Layout>
      <Outlet />
    </Layout>
  );
};

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/login/mfa",
    element: <MfaPage />,
  },
  {
    path: "/",
    element: <ProtectedRoute />,
    children: [
      { path: "/", element: <Navigate to="/dashboard" replace /> },
      { path: "/dashboard", element: <DashboardPage /> },
      { path: "/players", element: <PlayersPage /> },
      { path: "/players/:id", element: <PlayerDetailPage /> },
      { path: "/games", element: <GamesPage /> },
      { path: "/games/:id", element: <GameDetailPage /> },
      { path: "/imports", element: <ImportsPage /> },
      { path: "/reconciliation", element: <ReconciliationPage /> },
      { path: "/settings", element: <SettingsPage /> },
    ],
  },
]);
