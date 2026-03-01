import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import {
  LayoutDashboard,
  Users,
  Calendar,
  Download,
  ArrowRightLeft,
  Settings,
  LogOut,
} from "lucide-react";
import "../styles/index.css";

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

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo-icon">5</div>
          <h2>5-a-Side</h2>
        </div>

        <nav className="sidebar-nav">
          {routes.map((route) => {
            const Icon = route.icon;
            const isActive = location.pathname.startsWith(route.path);
            return (
              <Link
                key={route.path}
                to={route.path}
                className={`nav-item ${isActive ? "active" : ""}`}
              >
                <Icon size={20} />
                <span>{route.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="admin-info">
            <span className="admin-email">{admin?.email}</span>
            <span className="admin-role">{admin?.role}</span>
          </div>
          <button className="nav-item logout-btn" onClick={logout}>
            <LogOut size={20} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="main-content">{children}</main>
    </div>
  );
};
