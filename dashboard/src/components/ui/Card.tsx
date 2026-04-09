import type { PropsWithChildren, ReactNode } from "react";

type Props = PropsWithChildren<{
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}>;

export function Card({ title, subtitle, actions, className = "", children }: Props) {
  return (
    <section className={["ui-card", className].filter(Boolean).join(" ")}>
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
