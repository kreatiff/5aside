import type { ReactNode } from "react";

type StatusBadgeProps = {
  variant: "success" | "warning" | "danger" | "info" | "neutral";
  children: ReactNode;
  dot?: boolean;
  pulse?: boolean;
  size?: "sm" | "md";
};

export const StatusBadge = ({ variant, children, dot, pulse, size = "sm" }: StatusBadgeProps) => (
  <span className={`badge badge-${variant} ${size === "md" ? "badge-md" : ""}`}>
    {dot && <span className={`badge-dot ${pulse ? "pulse" : ""}`} />}
    {children}
  </span>
);
