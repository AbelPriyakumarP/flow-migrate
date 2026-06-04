"use client";

import { useEffect, useMemo } from "react";

export interface ShortcutConfig {
  /** Key name (lowercase), e.g. "enter", "s", "z" */
  key: string;
  /** Require Meta (Cmd on Mac) or Ctrl (Windows/Linux) */
  metaOrCtrl?: boolean;
  /** Require Shift */
  shift?: boolean;
  /** Action to perform */
  action: () => void;
  /** Human-readable label for the shortcut */
  label: string;
  /** Human-readable description */
  description: string;
  /** Whether this shortcut is currently enabled */
  enabled?: boolean;
}

export interface ShortcutDisplay {
  keys: string;
  label: string;
  description: string;
}

function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

function formatKeys(config: ShortcutConfig): string {
  const mod = isMac() ? "⌘" : "Ctrl";
  const parts: string[] = [];
  if (config.metaOrCtrl) parts.push(mod);
  if (config.shift) parts.push("Shift");
  parts.push(config.key === "enter" ? "↵" : config.key.toUpperCase());
  return parts.join(" + ");
}

export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't fire inside input/textarea unless metaOrCtrl is used
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      for (const s of shortcuts) {
        if (s.enabled === false) continue;

        const keyMatch = e.key.toLowerCase() === s.key.toLowerCase();
        const metaMatch = s.metaOrCtrl ? (e.metaKey || e.ctrlKey) : (!e.metaKey && !e.ctrlKey);
        const shiftMatch = s.shift ? e.shiftKey : !e.shiftKey;

        if (keyMatch && metaMatch && shiftMatch) {
          // For non-modifier shortcuts (like "?"), skip if in input
          if (!s.metaOrCtrl && isInput) continue;

          e.preventDefault();
          s.action();
          return;
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [shortcuts]);

  const shortcutList: ShortcutDisplay[] = useMemo(
    () =>
      shortcuts
        .filter((s) => s.enabled !== false)
        .map((s) => ({
          keys: formatKeys(s),
          label: s.label,
          description: s.description,
        })),
    [shortcuts]
  );

  return { shortcutList };
}
