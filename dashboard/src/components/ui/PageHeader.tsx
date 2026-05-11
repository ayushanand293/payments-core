import type { ReactNode } from "react";

type Props = {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, actions }: Props) {
  return (
    <header className="ui-page-header">
      <div>
        {eyebrow ? <span className="ui-kicker">{eyebrow}</span> : null}
        <h2>{title}</h2>
        {description ? <p className="ui-subtitle">{description}</p> : null}
      </div>
      {actions ? <div className="ui-page-header__actions">{actions}</div> : null}
    </header>
  );
}
