import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { motion } from "framer-motion";
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
import { TransactionsPage } from "./pages/TransactionsPage";
import { PaymentMatrixPage } from "./pages/PaymentMatrixPage";

// eslint-disable-next-line react-refresh/only-export-components
const ProtectedRoute = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="auth-loading">
        <motion.div
          animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        >
          <div
            className="logo-icon"
            style={{
              width: 56,
              height: 56,
              fontSize: "1.75rem",
              borderRadius: 14,
            }}
          >
            5
          </div>
        </motion.div>
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
      { path: "/payments", element: <PaymentMatrixPage /> },
      { path: "/imports", element: <ImportsPage /> },
      { path: "/transactions", element: <TransactionsPage /> },
      { path: "/reconciliation", element: <ReconciliationPage /> },
      { path: "/settings", element: <SettingsPage /> },
    ],
  },
]);
