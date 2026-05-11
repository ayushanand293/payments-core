import type { PropsWithChildren, ReactNode } from "react";
import { cn } from "./utils";

type Props = PropsWithChildren<{
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}>;

export function Card({ title, subtitle, actions, className = "", children }: Props) {
  return (
    <section className={cn("ui-card", className)}>
      {title || subtitle || actions ? (
        <header className="ui-card__header">
          <div>
            {title ? <h3 className="ui-card__title">{title}</h3> : null}
            {subtitle ? <p className="ui-card__subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="ui-card__actions">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function StatCard({ label, value, hint, icon }: { label: ReactNode; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <Card className="ui-stat-card">
      <div className="ui-stat-card__top">
        <span className="ui-stat__label">{label}</span>
        {icon ? <span className="ui-icon-chip">{icon}</span> : null}
      </div>
      <strong className="ui-stat__value">{value}</strong>
      {hint ? <span className="ui-stat__hint">{hint}</span> : null}
    </Card>
  );
}
