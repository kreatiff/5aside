import { useState, useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import {
  LayoutDashboard,
  Users,
  Calendar,
  Download,
  ArrowRightLeft,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { getInitials } from "../utils/format";

const routes = [
  { path: "/dashboard", name: "Dashboard", icon: LayoutDashboard },
  { path: "/players", name: "Players", icon: Users },
  { path: "/games", name: "Games", icon: Calendar },
  { path: "/imports", name: "Imports", icon: Download },
  { path: "/reconciliation", name: "Reconciliation", icon: ArrowRightLeft },
  { path: "/settings", name: "Settings", icon: Settings },
];

export const Layout = ({ children }: { children: ReactNode }) => {
  const { admin, logout } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("sidebar-collapsed") === "true"; }
    catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem("sidebar-collapsed", String(collapsed)); }
    catch { /* noop */ }
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

        <div className="sidebar-header">
          <div className="logo-icon">5</div>
          <h2>5-a-Side</h2>
        </div>

        <nav className="sidebar-nav">
          {routes.map((route) => {
            const Icon = route.icon;
            const isActive = location.pathname.startsWith(route.path);
            const badge = route.path === "/reconciliation" && reconCount > 0 ? reconCount : null;
            return (
              <Link
                key={route.path}
                to={route.path}
                className={`nav-item ${isActive ? "active" : ""}`}
                title={collapsed ? route.name : undefined}
              >
                <Icon size={20} />
                <span>{route.name}</span>
                {badge !== null && <span className="nav-badge">{badge > 99 ? "99+" : badge}</span>}
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
              <span className="admin-version">v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'}</span>
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
