import { useState, useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import {
  LayoutDashboard,
  Users,
  Grid3X3,
  Download,
  Banknote,
  ArrowRightLeft,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { getInitials } from "../utils/format";

const SoccerBall = ({ size = 20 }: { size?: number }) => (
  <svg
    id="Soccer-Ball--Streamline-Streamline-3.0"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    height={size}
    width={size}
  >
    <desc>Soccer Ball Streamline Icon: https://streamlinehq.com</desc>
    <defs></defs>
    <title>soccer-ball</title>
    <path
      d="M12 0.75A11.25 11.25 0 1 0 23.25 12 11.25 11.25 0 0 0 12 0.75Z"
      fill="none"
      stroke="#000000"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
    ></path>
    <path
      d="m8.895 16.754 -1.91 -5.9L12 7.208l5.015 3.646 -1.91 5.9 -6.21 0z"
      fill="none"
      stroke="#000000"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
    ></path>
    <path
      d="M16.301 1.601 12 4.5 7.699 1.601"
      fill="none"
      stroke="#000000"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
    ></path>
    <path
      d="m14.599 22.948 2.139 -4.366 4.884 -0.75"
      fill="none"
      stroke="#000000"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
    ></path>
    <path
      d="m23.214 12.909 -3.427 -3.413 0.735 -4.839"
      fill="none"
      stroke="#000000"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
    ></path>
    <path
      d="m12 4.5 0 2.708"
      fill="none"
      stroke="#000000"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
    ></path>
    <path
      d="m17.015 10.854 2.772 -1.358"
      fill="none"
      stroke="#000000"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
    ></path>
    <path
      d="m0.786 12.909 3.427 -3.413 -0.735 -4.839"
      fill="none"
      stroke="#000000"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
    ></path>
    <path
      d="M6.985 10.854 4.213 9.496"
      fill="none"
      stroke="#000000"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
    ></path>
    <path
      d="m15.105 16.754 1.633 1.828"
      fill="none"
      stroke="#000000"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
    ></path>
    <path
      d="m9.401 22.948 -2.139 -4.366 -4.884 -0.75"
      fill="none"
      stroke="#000000"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
    ></path>
    <path
      d="m8.895 16.754 -1.633 1.828"
      fill="none"
      stroke="#000000"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
    ></path>
  </svg>
);

const routes = [
  { path: "/dashboard", name: "Dashboard", icon: LayoutDashboard },
  { path: "/players", name: "Players", icon: Users },
  { path: "/games", name: "Games", icon: SoccerBall },
  { path: "/payments", name: "Matrix", icon: Grid3X3 },
  { path: "/imports", name: "Imports", icon: Download },
  { path: "/transactions", name: "Transactions", icon: Banknote },
  { path: "/reconciliation", name: "Reconciliation", icon: ArrowRightLeft },
  { path: "/settings", name: "Settings", icon: Settings },
];

export const Layout = ({ children }: { children: ReactNode }) => {
  const { admin, logout } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("sidebar-collapsed", String(collapsed));
    } catch {
      /* noop */
    }
  }, [collapsed]);

  const { data: reconData } = useQuery({
    queryKey: ["recon-queue-count"],
    queryFn: async () => {
      const { data } = await api.get("/reconciliation-queue?limit=100");
      return data as { items: unknown[]; total: number };
    },
    refetchInterval: 60000,
  });

  const reconCount = reconData?.total ?? 0;
  const initials = admin?.email ? getInitials(admin.email.split("@")[0]) : "?";

  return (
    <div className="app-layout">
      <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <div
          className="sidebar-header"
          style={{
            flexDirection: "column",
            alignItems: "flex-start",
            gap: "1.5rem",
            marginBottom: "2rem",
          }}
        >
          <div
            style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}
          >
            <div
              className="logo-icon"
              style={{ width: "40px", height: "40px" }}
            >
              5
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {routes.map((route) => {
            const Icon = route.icon;
            const isActive = location.pathname.startsWith(route.path);
            const badge =
              route.path === "/reconciliation" && reconCount > 0
                ? reconCount
                : null;
            return (
              <Link
                key={route.path}
                to={route.path}
                className={`nav-item ${isActive ? "active" : ""}`}
                title={collapsed ? route.name : undefined}
              >
                <Icon size={20} />
                <span>{route.name}</span>
                {badge !== null && (
                  <span className="nav-badge">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="admin-info">
            <div className="admin-avatar">{initials}</div>
            <div className="admin-details">
              <span className="admin-email">{admin?.email}</span>
              <span className="admin-role">{admin?.role}</span>
              <span className="admin-version">
                v
                {typeof __APP_VERSION__ !== "undefined"
                  ? __APP_VERSION__
                  : "0.0.0"}
              </span>
            </div>
          </div>
          <button className="nav-item logout-btn" onClick={logout}>
            <LogOut size={20} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <div className="main-content-inner">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};
