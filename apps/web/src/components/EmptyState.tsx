import type { ReactNode } from "react";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
};

export const EmptyState = ({ icon, title, description, action }: EmptyStateProps) => (
  <div className="empty-state">
    {icon && <div className="empty-state__icon">{icon}</div>}
    <div className="empty-state__title">{title}</div>
    {description && <div className="empty-state__description">{description}</div>}
    {action}
  </div>
);
