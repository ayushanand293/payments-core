import type { PropsWithChildren } from "react";

type Variant = "success" | "error" | "info";

type Props = PropsWithChildren<{
  variant?: Variant;
}>;

export function Notice({ variant = "info", children }: Props) {
  return <div className={`ui-notice ui-notice--${variant}`}>{children}</div>;
}
