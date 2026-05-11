import { Slot } from "@radix-ui/react-slot";
import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { cn } from "./utils";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

type Props = PropsWithChildren<{
  variant?: ButtonVariant;
  loading?: boolean;
  asChild?: boolean;
}> &
  ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ children, variant = "secondary", loading = false, disabled, className = "", asChild = false, ...props }: Props) {
  const Comp = asChild ? Slot : "button";
  const classes = cn("ui-button", `ui-button--${variant}`, loading && "is-loading", className);
  return (
    <Comp {...props} disabled={disabled || loading} className={classes}>
      {loading ? <span className="ui-spinner ui-spinner--inline" aria-hidden="true" /> : null}
      <span>{children}</span>
    </Comp>
  );
}
