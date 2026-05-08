import { cn } from "@/lib/utils";
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";

type TooltipSide = "top" | "bottom" | "left" | "right";

type TooltipCtx = {
  open: boolean;
  setOpen: (value: boolean) => void;
  triggerElement: HTMLElement | null;
  setTriggerElement: (element: HTMLElement | null) => void;
  openNow: () => void;
  closeSoon: () => void;
  cancelClose: () => void;
};

const TooltipContext = createContext<TooltipCtx | null>(null);

function useTooltipContext(): TooltipCtx {
  const ctx = useContext(TooltipContext);
  if (!ctx) {
    throw new Error("Tooltip components must be used inside <Tooltip>");
  }
  return ctx;
}

export function TooltipProvider({
  children,
}: {
  children: React.ReactNode;
  delayDuration?: number;
}) {
  return <>{children}</>;
}

export function Tooltip({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [triggerElement, setTriggerElement] = useState<HTMLElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (!closeTimerRef.current) return;
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };

  const openNow = () => {
    cancelClose();
    setOpen(true);
  };

  const closeSoon = () => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, 120);
  };

  useEffect(() => {
    return () => cancelClose();
  }, []);

  const value = useMemo(
    () => ({ open, setOpen, triggerElement, setTriggerElement, openNow, closeSoon, cancelClose }),
    [open, triggerElement],
  );
  return (
    <TooltipContext.Provider value={value}>
      <span className="relative inline-flex">{children}</span>
    </TooltipContext.Provider>
  );
}

export function TooltipTrigger({
  asChild,
  children,
}: {
  asChild?: boolean;
  children: React.ReactNode;
}) {
  const { setOpen, setTriggerElement, openNow, closeSoon } = useTooltipContext();

  if (asChild && isValidElement(children)) {
    const only = Children.only(children) as ReactElement<Record<string, unknown>>;
    const existingOnMouseEnter = only.props.onMouseEnter as ((event: MouseEvent) => void) | undefined;
    const existingOnMouseLeave = only.props.onMouseLeave as ((event: MouseEvent) => void) | undefined;
    const existingOnFocus = only.props.onFocus as ((event: FocusEvent) => void) | undefined;
    const existingOnBlur = only.props.onBlur as ((event: FocusEvent) => void) | undefined;
    return cloneElement(only, {
      ...(only.props ?? {}),
      onMouseEnter: (event: MouseEvent) => {
        setTriggerElement(event.currentTarget as unknown as HTMLElement);
        existingOnMouseEnter?.(event);
        openNow();
      },
      onMouseLeave: (event: MouseEvent) => {
        existingOnMouseLeave?.(event);
        closeSoon();
      },
      onFocus: (event: FocusEvent) => {
        setTriggerElement(event.currentTarget as unknown as HTMLElement);
        existingOnFocus?.(event);
        openNow();
      },
      onBlur: (event: FocusEvent) => {
        existingOnBlur?.(event);
        setOpen(false);
      },
    });
  }

  return (
    <span
      tabIndex={0}
      onMouseEnter={() => openNow()}
      onMouseLeave={() => closeSoon()}
      onFocus={() => openNow()}
      onBlur={() => setOpen(false)}
    >
      {children}
    </span>
  );
}

export function TooltipContent({
  children,
  className,
  side = "top",
  sideOffset = 8,
}: {
  children: React.ReactNode;
  className?: string;
  side?: TooltipSide;
  sideOffset?: number;
}) {
  const { open, triggerElement, openNow, closeSoon } = useTooltipContext();
  const [style, setStyle] = useState<React.CSSProperties>({ left: -9999, top: -9999 });

  useEffect(() => {
    if (!open || !triggerElement) return;
    const rect = triggerElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    if (side === "bottom") {
      setStyle({ position: "fixed", left: centerX, top: rect.bottom + sideOffset, transform: "translateX(-50%)" });
      return;
    }
    if (side === "left") {
      setStyle({ position: "fixed", left: rect.left - sideOffset, top: centerY, transform: "translate(-100%, -50%)" });
      return;
    }
    if (side === "right") {
      setStyle({ position: "fixed", left: rect.right + sideOffset, top: centerY, transform: "translateY(-50%)" });
      return;
    }
    setStyle({ position: "fixed", left: centerX, top: rect.top - sideOffset, transform: "translate(-50%, -100%)" });
  }, [open, side, sideOffset, triggerElement]);

  if (!open) return null;

  return createPortal(
    <div
      role="tooltip"
      onMouseEnter={openNow}
      onMouseLeave={closeSoon}
      className={cn(
        "pointer-events-auto z-[1100] max-w-[280px] rounded-md border border-layout-border bg-layout-card px-2.5 py-1.5 text-xs text-text-main shadow-md",
        className,
      )}
      style={style}
    >
      {children}
    </div>,
    document.body,
  );
}
