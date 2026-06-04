"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  createEmptyRule,
  RULE_TYPE_LABELS,
  RULE_STAGE_LABELS,
  type CustomRule,
  type RuleType,
  type RuleStage,
} from "@/lib/custom-rules";

interface CustomRulesPanelProps {
  rules: CustomRule[];
  onAdd: (rule: CustomRule) => void;
  onUpdate: (id: string, changes: Partial<CustomRule>) => void;
  onRemove: (id: string) => void;
  onToggle: (id: string) => void;
  onClearAll: () => void;
  activeCount: number;
}

export default function CustomRulesPanel({
  rules,
  onAdd,
  onUpdate,
  onRemove,
  onToggle,
  onClearAll,
  activeCount,
}: CustomRulesPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CustomRule | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setEditingRule(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setEditingRule(null);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen]);

  const handleAddNew = useCallback(() => {
    setEditingRule(createEmptyRule());
  }, []);

  const handleSaveRule = useCallback(() => {
    if (!editingRule || !editingRule.name.trim() || !editingRule.match.trim()) return;
    const existing = rules.find((r) => r.id === editingRule.id);
    if (existing) {
      onUpdate(editingRule.id, editingRule);
    } else {
      onAdd(editingRule);
    }
    setEditingRule(null);
  }, [editingRule, rules, onAdd, onUpdate]);

  return (
    <div className="relative" ref={panelRef}>
      {/* Trigger Button */}
      <button
        onClick={() => { setIsOpen(!isOpen); setEditingRule(null); }}
        className="btn-press card-premium relative flex items-center gap-2 px-3.5 py-2.5 text-[11px] font-semibold transition-all hover:shadow-md"
        style={{ color: "var(--muted)" }}
        title="Custom Migration Rules"
        aria-label="Custom migration rules"
        aria-expanded={isOpen}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        Rules
        {activeCount > 0 && (
          <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-gradient-to-r from-violet-500 to-purple-500 text-[9px] font-bold text-white shadow-sm">
            {activeCount}
          </span>
        )}
      </button>

      {/* Popover Panel */}
      {isOpen && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-[460px] animate-scaleIn overflow-hidden rounded-xl border shadow-xl"
          style={{ borderColor: "var(--card-border)", background: "var(--card)" }}
          role="dialog"
          aria-label="Custom migration rules"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--card-border)", background: "var(--subtle-bg)" }}>
            <div className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <span className="text-[13px] font-bold" style={{ color: "var(--foreground)" }}>Custom Rules</span>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "var(--primary-light)", color: "var(--primary)" }}>
                {rules.length}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {rules.length > 0 && (
                <button
                  onClick={onClearAll}
                  className="rounded-md px-2 py-1 text-[10px] font-semibold transition-colors hover:bg-red-50 hover:text-red-600"
                  style={{ color: "var(--muted)" }}
                >
                  Clear All
                </button>
              )}
              <button
                onClick={handleAddNew}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm transition-all hover:shadow-md"
                style={{ background: "var(--primary)" }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add Rule
              </button>
            </div>
          </div>

          {/* Rule Editor */}
          {editingRule && (
            <RuleEditor
              rule={editingRule}
              onChange={setEditingRule}
              onSave={handleSaveRule}
              onCancel={() => setEditingRule(null)}
            />
          )}

          {/* Rules List */}
          <div className="max-h-[320px] overflow-y-auto scrollbar-thin">
            {rules.length === 0 && !editingRule && (
              <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
                <div className="rounded-xl p-3" style={{ background: "var(--subtle-bg)" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                </div>
                <p className="text-[13px] font-semibold" style={{ color: "var(--muted)" }}>No custom rules yet</p>
                <p className="text-[11px]" style={{ color: "var(--muted)", opacity: 0.7 }}>
                  Add pre or post-processing rules to customize how migrations transform your workflows
                </p>
              </div>
            )}

            {rules.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                onEdit={() => setEditingRule({ ...rule })}
                onToggle={() => onToggle(rule.id)}
                onRemove={() => onRemove(rule.id)}
              />
            ))}
          </div>

          {/* Footer hint */}
          {rules.length > 0 && (
            <div className="border-t px-4 py-2" style={{ borderColor: "var(--card-border)" }}>
              <p className="text-[10px]" style={{ color: "var(--muted)", opacity: 0.6 }}>
                Pre-rules modify input before AI • Post-rules override AI output
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Rule Row ───────────────────────────────────────────────────

function RuleRow({
  rule,
  onEdit,
  onToggle,
  onRemove,
}: {
  rule: CustomRule;
  onEdit: () => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const stageBg = rule.stage === "pre" ? "bg-blue-50 text-blue-600 border-blue-200/50" : "bg-purple-50 text-purple-600 border-purple-200/50";

  return (
    <div
      className={`flex items-center gap-3 border-b px-4 py-2.5 transition-colors ${rule.enabled ? "" : "opacity-50"}`}
      style={{ borderColor: "var(--card-border)" }}
    >
      {/* Toggle */}
      <button
        onClick={onToggle}
        className="shrink-0"
        aria-label={rule.enabled ? "Disable rule" : "Enable rule"}
      >
        <div
          className={`h-4 w-8 rounded-full transition-colors ${rule.enabled ? "bg-emerald-400" : ""}`}
          style={!rule.enabled ? { background: "var(--card-border)" } : undefined}
        >
          <div
            className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${rule.enabled ? "translate-x-4" : "translate-x-0"}`}
          />
        </div>
      </button>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-bold truncate" style={{ color: "var(--foreground)" }}>
            {rule.name || "Untitled Rule"}
          </span>
          <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase ${stageBg}`}>
            {rule.stage}
          </span>
          <span className="rounded-md border px-1.5 py-0.5 text-[9px] font-semibold" style={{ borderColor: "var(--card-border)", color: "var(--muted)" }}>
            {RULE_TYPE_LABELS[rule.type].split(" ")[0]}
          </span>
        </div>
        <p className="mt-0.5 text-[10px] truncate" style={{ color: "var(--muted)" }}>
          {rule.match}
          {rule.type !== "field-delete" && <> → {rule.replacement}</>}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={onEdit}
          className="rounded-md p-1.5 transition-colors"
          style={{ color: "var(--muted)" }}
          title="Edit rule"
          aria-label="Edit rule"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
          </svg>
        </button>
        <button
          onClick={onRemove}
          className="rounded-md p-1.5 text-red-400 transition-colors hover:text-red-600 hover:bg-red-50"
          title="Delete rule"
          aria-label="Delete rule"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="3,6 5,6 21,6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Rule Editor ────────────────────────────────────────────────

function RuleEditor({
  rule,
  onChange,
  onSave,
  onCancel,
}: {
  rule: CustomRule;
  onChange: (rule: CustomRule) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const update = (changes: Partial<CustomRule>) => {
    onChange({ ...rule, ...changes });
  };

  const inputStyle = {
    background: "var(--subtle-bg)",
    color: "var(--foreground)",
    borderColor: "var(--card-border)",
  };

  const canSave = rule.name.trim() && rule.match.trim();

  return (
    <div className="border-b p-4 space-y-3" style={{ borderColor: "var(--card-border)", background: "var(--subtle-bg)" }}>
      {/* Row 1: Name */}
      <div>
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          Rule Name
        </label>
        <input
          ref={nameRef}
          type="text"
          value={rule.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="e.g. Fix Lambda ARN format"
          className="w-full rounded-lg border px-3 py-2 text-[12px] outline-none transition-colors focus:border-[var(--primary)]"
          style={inputStyle}
        />
      </div>

      {/* Row 2: Type + Stage + Direction */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            Type
          </label>
          <select
            value={rule.type}
            onChange={(e) => update({ type: e.target.value as RuleType })}
            className="w-full rounded-lg border px-2 py-2 text-[11px] outline-none"
            style={inputStyle}
          >
            {(Object.entries(RULE_TYPE_LABELS) as [RuleType, string][]).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            Stage
          </label>
          <select
            value={rule.stage}
            onChange={(e) => update({ stage: e.target.value as RuleStage })}
            className="w-full rounded-lg border px-2 py-2 text-[11px] outline-none"
            style={inputStyle}
          >
            {(Object.entries(RULE_STAGE_LABELS) as [RuleStage, string][]).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            Direction
          </label>
          <select
            value={rule.direction}
            onChange={(e) => update({ direction: e.target.value as CustomRule["direction"] })}
            className="w-full rounded-lg border px-2 py-2 text-[11px] outline-none"
            style={inputStyle}
          >
            <option value="both">Both</option>
            <option value="aws-to-azure">AWS → Azure</option>
            <option value="azure-to-aws">Azure → AWS</option>
          </select>
        </div>
      </div>

      {/* Row 3: Match */}
      <div>
        <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          {rule.type === "regex-replace" ? "Regex Pattern" : rule.type === "json-path-replace" ? "JSON Path (dot-separated, * for wildcard)" : rule.type === "field-rename" ? "Old Field Name" : "Field Name to Delete"}
        </label>
        <input
          type="text"
          value={rule.match}
          onChange={(e) => update({ match: e.target.value })}
          placeholder={
            rule.type === "regex-replace" ? "e.g. arn:aws:lambda:[^\"]*"
              : rule.type === "json-path-replace" ? "e.g. actions.*.inputs.host"
              : rule.type === "field-rename" ? "e.g. oldFieldName"
              : "e.g. deprecatedField"
          }
          className="w-full rounded-lg border px-3 py-2 font-mono text-[11px] outline-none transition-colors focus:border-[var(--primary)]"
          style={inputStyle}
        />
      </div>

      {/* Row 4: Replacement (not for field-delete) */}
      {rule.type !== "field-delete" && (
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            {rule.type === "field-rename" ? "New Field Name" : "Replacement"}
          </label>
          <input
            type="text"
            value={rule.replacement}
            onChange={(e) => update({ replacement: e.target.value })}
            placeholder={
              rule.type === "field-rename" ? "e.g. newFieldName"
                : rule.type === "regex-replace" ? "e.g. arn:aws:lambda:us-east-1:123:function:$1"
                : "e.g. new-value (JSON values auto-parsed)"
            }
            className="w-full rounded-lg border px-3 py-2 font-mono text-[11px] outline-none transition-colors focus:border-[var(--primary)]"
            style={inputStyle}
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-[11px] font-semibold transition-colors"
          style={{ color: "var(--muted)" }}
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={!canSave}
          className="rounded-lg px-4 py-2 text-[11px] font-bold text-white shadow-sm transition-all hover:shadow-md disabled:opacity-40"
          style={{ background: canSave ? "var(--primary)" : "var(--muted)" }}
        >
          Save Rule
        </button>
      </div>
    </div>
  );
}
