import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

type Props = PropsWithChildren<{
  variant?: ButtonVariant;
  loading?: boolean;
}> &
  ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ children, variant = "secondary", loading = false, disabled, className = "", ...props }: Props) {
  const classes = ["ui-button", `ui-button--${variant}`, loading ? "is-loading" : "", className].filter(Boolean).join(" ");
  return (
    <button {...props} disabled={disabled || loading} className={classes}>
      {loading ? <span className="ui-spinner ui-spinner--inline" aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
  );
}
