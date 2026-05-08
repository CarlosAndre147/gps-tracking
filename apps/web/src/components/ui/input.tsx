import { cn } from "@/lib/utils";
import { forwardRef, type InputHTMLAttributes } from "react";

/** `forwardRef` é necessário para `react-hook-form` `register()` ligar o `ref` ao `<input>` nativo. */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-lg border border-layout-border bg-layout-card px-3 text-sm text-text-main placeholder:text-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-primary",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
