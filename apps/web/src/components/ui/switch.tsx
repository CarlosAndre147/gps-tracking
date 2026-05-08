import { cn } from "@/lib/utils";

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  className,
  id,
}: {
  checked: boolean;
  onCheckedChange?: (v: boolean) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onCheckedChange?.(!checked)}
      className={cn(
        "relative h-8 w-14 rounded-full border border-layout-border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-primary",
        checked ? "bg-brand-primary" : "bg-layout-border/80",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <span
        className={cn(
          "absolute top-1 left-1 block h-6 w-6 rounded-full bg-white transition-transform",
          checked && "translate-x-6",
        )}
      />
    </button>
  );
}
