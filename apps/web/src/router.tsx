import { createHashRouter, Navigate, Outlet } from "react-router-dom";
import { Layout } from "./components/Layout";
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
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
};

export const router = createHashRouter([
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
