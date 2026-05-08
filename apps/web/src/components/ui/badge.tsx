import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function Badge({
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: "default" | "success" | "muted" }) {
  const v = {
    default: "bg-brand-secondary/15 text-brand-secondary",
    success: "bg-feedback-success/20 text-brand-secondary",
    muted: "bg-layout-border/50 text-text-secondary",
  };
  return (
    <span
      className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", v[variant], className)}
      {...props}
    />
  );
}
