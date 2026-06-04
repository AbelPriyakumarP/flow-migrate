"use client";

import { useEffect, useRef } from "react";
import type { ShortcutDisplay } from "@/hooks/useKeyboardShortcuts";

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  shortcuts: ShortcutDisplay[];
}

export default function KeyboardShortcutsModal({
  isOpen,
  onClose,
  shortcuts,
}: KeyboardShortcutsModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  // Focus trap
  useEffect(() => {
    if (!isOpen || !panelRef.current) return;
    const firstFocusable = panelRef.current.querySelector<HTMLElement>(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
    );
    firstFocusable?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="relative w-full max-w-[440px] overflow-hidden rounded-2xl border border-[var(--card-border)] shadow-2xl animate-scaleIn"
        style={{ background: "var(--card)" }}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard Shortcuts"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--card-border)] px-5 py-4" style={{ background: "var(--subtle-bg)" }}>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgb(79,70,229)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M6 8h.001" />
                <path d="M10 8h.001" />
                <path d="M14 8h.001" />
                <path d="M18 8h.001" />
                <path d="M8 12h.001" />
                <path d="M12 12h.001" />
                <path d="M16 12h.001" />
                <path d="M7 16h10" />
              </svg>
            </div>
            <div>
              <h3 className="text-[14px] font-bold" style={{ color: "var(--foreground)" }}>
                Keyboard Shortcuts
              </h3>
              <p className="text-[11px]" style={{ color: "var(--muted)" }}>
                Quick actions for power users
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 transition-colors hover:opacity-70"
            style={{ color: "var(--muted)" }}
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Shortcuts List */}
        <div className="divide-y" style={{ borderColor: "var(--divider)" }}>
          {shortcuts.map((shortcut) => (
            <div
              key={shortcut.keys}
              className="flex items-center justify-between px-5 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold" style={{ color: "var(--foreground)" }}>
                  {shortcut.label}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--muted)" }}>
                  {shortcut.description}
                </p>
              </div>
              <kbd
                className="ml-4 flex-shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-mono font-bold"
                style={{
                  borderColor: "var(--card-border)",
                  background: "var(--subtle-bg)",
                  color: "var(--foreground)",
                }}
              >
                {shortcut.keys}
              </kbd>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t px-5 py-3" style={{ borderColor: "var(--card-border)", background: "var(--subtle-bg)" }}>
          <p className="text-[10px] text-center" style={{ color: "var(--muted)" }}>
            Press <kbd className="rounded border px-1 py-0.5 text-[9px] font-mono" style={{ borderColor: "var(--card-border)" }}>?</kbd> to toggle this panel
          </p>
        </div>
      </div>
    </div>
  );
}
