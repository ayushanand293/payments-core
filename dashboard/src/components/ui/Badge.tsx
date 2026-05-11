import type { PropsWithChildren } from "react";
import { cn } from "./utils";

type Variant = "neutral" | "success" | "warning" | "danger" | "info";

type Props = PropsWithChildren<{
  variant?: Variant;
}>;

export function Badge({ children, variant = "neutral" }: Props) {
  return <span className={cn("ui-badge", `ui-badge--${variant}`)}>{children}</span>;
}

export const StatusBadge = Badge;

export function statusVariant(status: string): Variant {
  const normalized = status.toUpperCase();
  if (normalized === "PROCESSED" || normalized === "CAPTURED" || normalized === "POSTED") return "success";
  if (normalized === "DLQ" || normalized === "FAILED" || normalized === "EXPIRED") return "danger";
  if (normalized === "PROCESSING" || normalized === "AUTHORIZED") return "warning";
  if (normalized === "RECEIVED") return "info";
  return "neutral";
}
