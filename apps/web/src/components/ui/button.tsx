import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

export function Button({
  className,
  variant = "default",
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost" | "destructive";
  size?: "sm" | "md" | "lg";
}) {
  const variants = {
    default:
      "bg-brand-primary text-text-inverted hover:bg-brand-primary-dark disabled:opacity-50",
    outline:
      "border border-layout-border bg-layout-card text-text-main hover:bg-layout-body",
    ghost: "bg-transparent text-text-main hover:bg-layout-border/40",
    destructive: "bg-feedback-error text-text-inverted hover:brightness-95",
  };
  const sizes = {
    sm: "h-8 px-3 text-sm",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-6 text-base",
  };
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
