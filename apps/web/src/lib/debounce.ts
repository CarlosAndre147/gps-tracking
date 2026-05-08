import { useEffect, useMemo, useRef, useState } from "react";

export function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  ms: number,
): (...args: Parameters<T>) => void {
  let t: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      fn(...args);
    }, ms);
  };
}

/** Valor que só muda após `ms` sem novas atualizações. */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** Callback estável com debounce (recria quando `ms` muda). */
export function useDebouncedCallback(fn: (...args: unknown[]) => void, ms: number): (...args: unknown[]) => void {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  return useMemo(
    () =>
      debounce((...args: unknown[]) => {
        fnRef.current(...args);
      }, ms),
    [ms],
  );
}
