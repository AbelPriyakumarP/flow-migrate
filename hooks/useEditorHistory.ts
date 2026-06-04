"use client";

import { useState, useCallback, useRef } from "react";

const MAX_HISTORY = 100;
const DEBOUNCE_MS = 400;

export function useEditorHistory(externalValue: string) {
  const [history, setHistory] = useState<string[]>([externalValue]);
  const [cursor, setCursor] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPushed = useRef(externalValue);

  const push = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      if (value === lastPushed.current) return;
      lastPushed.current = value;

      setHistory((prev) => {
        // Trim any future entries if we're not at the end
        const trimmed = prev.slice(0, cursor + 1);
        const next = [...trimmed, value];
        // Cap at max
        if (next.length > MAX_HISTORY) next.shift();
        return next;
      });
      setCursor((prev) => {
        const newCursor = Math.min(prev + 1, MAX_HISTORY - 1);
        return newCursor;
      });
    }, DEBOUNCE_MS);
  }, [cursor]);

  const undo = useCallback((): string | null => {
    if (cursor <= 0) return null;
    const newCursor = cursor - 1;
    setCursor(newCursor);
    const value = history[newCursor];
    lastPushed.current = value;
    return value;
  }, [cursor, history]);

  const redo = useCallback((): string | null => {
    if (cursor >= history.length - 1) return null;
    const newCursor = cursor + 1;
    setCursor(newCursor);
    const value = history[newCursor];
    lastPushed.current = value;
    return value;
  }, [cursor, history]);

  const reset = useCallback((value: string) => {
    setHistory([value]);
    setCursor(0);
    lastPushed.current = value;
  }, []);

  return {
    push,
    undo,
    redo,
    reset,
    canUndo: cursor > 0,
    canRedo: cursor < history.length - 1,
  };
}
