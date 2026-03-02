import type { ReactNode } from "react";
import { Breadcrumbs, type Crumb } from "./Breadcrumbs";

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumbs?: Crumb[];
};

export const PageHeader = ({ title, description, actions, breadcrumbs }: PageHeaderProps) => (
  <div>
    {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
    <div className="page-header">
      <div className="page-header__left">
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </div>
  </div>
);
