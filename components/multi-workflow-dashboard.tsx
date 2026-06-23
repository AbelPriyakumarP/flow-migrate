"use client";

import { useState, useCallback, useMemo } from "react";

type WorkflowStatus = "pending" | "migrating" | "completed" | "failed" | "review";

interface WorkflowEntry {
  id: string;
  name: string;
  source: string;
  status: WorkflowStatus;
  progress: number;
  actionCount: number;
  errorCount: number;
  warningCount: number;
  dependencies: string[];
  lastUpdated: Date;
  duration?: number;
  outputCode?: string;
}

interface MultiWorkflowDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadWorkflow: (source: string, name: string) => void;
}

const STATUS_CONFIG: Record<WorkflowStatus, { color: string; bg: string; label: string }> = {
  pending: { color: "var(--text-muted)", bg: "rgba(107,114,168,0.08)", label: "Pending" },
  migrating: { color: "var(--accent)", bg: "var(--accent-bg)", label: "Migrating" },
  completed: { color: "var(--success)", bg: "var(--success-bg)", label: "Completed" },
  failed: { color: "var(--error)", bg: "var(--danger-bg)", label: "Failed" },
  review: { color: "var(--warning)", bg: "var(--warning-bg)", label: "Review" },
};

export default function MultiWorkflowDashboard({ isOpen, onClose, onLoadWorkflow }: MultiWorkflowDashboardProps) {
  const [workflows, setWorkflows] = useState<WorkflowEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<WorkflowStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "status" | "progress">("name");
  const [dragOver, setDragOver] = useState(false);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.name.endsWith(".json"));
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        try {
          JSON.parse(content);
          const id = `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          let actionCount = 0;
          try {
            const parsed = JSON.parse(content);
            actionCount = Object.keys(parsed.States || parsed.actions || parsed.definition?.actions || {}).length;
          } catch { /* ignore */ }
          setWorkflows((prev) => [...prev, {
            id, name: file.name.replace(".json", ""), source: content, status: "pending",
            progress: 0, actionCount, errorCount: 0, warningCount: 0,
            dependencies: [], lastUpdated: new Date(),
          }]);
        } catch { /* invalid json */ }
      };
      reader.readAsText(file);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) => f.name.endsWith(".json"));
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        try {
          JSON.parse(content);
          const id = `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          let actionCount = 0;
          try {
            const parsed = JSON.parse(content);
            actionCount = Object.keys(parsed.States || parsed.actions || parsed.definition?.actions || {}).length;
          } catch { /* ignore */ }
          setWorkflows((prev) => [...prev, {
            id, name: file.name.replace(".json", ""), source: content, status: "pending",
            progress: 0, actionCount, errorCount: 0, warningCount: 0,
            dependencies: [], lastUpdated: new Date(),
          }]);
        } catch { /* invalid json */ }
      };
      reader.readAsText(file);
    }
    e.target.value = "";
  }, []);

  const handleMigrateSelected = useCallback(async () => {
    const toMigrate = workflows.filter((w) => selectedIds.has(w.id) && w.status !== "migrating");
    for (const wf of toMigrate) {
      setWorkflows((prev) => prev.map((w) => w.id === wf.id ? { ...w, status: "migrating" as WorkflowStatus, progress: 10 } : w));

      try {
        const res = await fetch("/api/migrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceCode: wf.source, targetPlatform: "azure-logic-apps" }),
        });
        const data = await res.json();
        const errorCount = (data.validationIssues || []).filter((i: { severity: string }) => i.severity === "error").length;
        const warningCount = (data.validationIssues || []).filter((i: { severity: string }) => i.severity === "warning").length;
        const status: WorkflowStatus = !res.ok ? "failed" : errorCount > 0 ? "review" : "completed";

        setWorkflows((prev) => prev.map((w) => w.id === wf.id ? {
          ...w, status, progress: 100, errorCount, warningCount,
          outputCode: data.outputCode, lastUpdated: new Date(),
          duration: Date.now() - wf.lastUpdated.getTime(),
        } : w));
      } catch {
        setWorkflows((prev) => prev.map((w) => w.id === wf.id ? { ...w, status: "failed" as WorkflowStatus, progress: 0, lastUpdated: new Date() } : w));
      }
    }
    setSelectedIds(new Set());
  }, [workflows, selectedIds]);

  const handleMigrateAll = useCallback(async () => {
    const pending = workflows.filter((w) => w.status === "pending" || w.status === "failed");
    setSelectedIds(new Set(pending.map((w) => w.id)));
    for (const wf of pending) {
      setWorkflows((prev) => prev.map((w) => w.id === wf.id ? { ...w, status: "migrating" as WorkflowStatus, progress: 10 } : w));
      try {
        const res = await fetch("/api/migrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceCode: wf.source, targetPlatform: "azure-logic-apps" }),
        });
        const data = await res.json();
        const errorCount = (data.validationIssues || []).filter((i: { severity: string }) => i.severity === "error").length;
        const warningCount = (data.validationIssues || []).filter((i: { severity: string }) => i.severity === "warning").length;
        const status: WorkflowStatus = !res.ok ? "failed" : errorCount > 0 ? "review" : "completed";

        setWorkflows((prev) => prev.map((w) => w.id === wf.id ? {
          ...w, status, progress: 100, errorCount, warningCount,
          outputCode: data.outputCode, lastUpdated: new Date(),
        } : w));
      } catch {
        setWorkflows((prev) => prev.map((w) => w.id === wf.id ? { ...w, status: "failed" as WorkflowStatus, progress: 0, lastUpdated: new Date() } : w));
      }
    }
    setSelectedIds(new Set());
  }, [workflows]);

  const handleRemove = useCallback((id: string) => {
    setWorkflows((prev) => prev.filter((w) => w.id !== id));
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredWorkflows.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredWorkflows.map((w) => w.id)));
  }, [selectedIds.size]);

  const filteredWorkflows = useMemo(() => {
    let result = workflows;
    if (filter !== "all") result = result.filter((w) => w.status === filter);
    if (searchQuery) result = result.filter((w) => w.name.toLowerCase().includes(searchQuery.toLowerCase()));
    return result.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "status") return a.status.localeCompare(b.status);
      return b.progress - a.progress;
    });
  }, [workflows, filter, searchQuery, sortBy]);

  const stats = useMemo(() => {
    const s = { total: workflows.length, completed: 0, failed: 0, pending: 0, review: 0, migrating: 0 };
    for (const w of workflows) s[w.status]++;
    return s;
  }, [workflows]);

  const overallProgress = workflows.length > 0 ? Math.round(workflows.reduce((sum, w) => sum + w.progress, 0) / workflows.length) : 0;

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }} onClick={onClose} />
      <div className="fixed inset-4 sm:inset-6 z-50 flex flex-col rounded-2xl overflow-hidden" style={{ background: "var(--bg-primary)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-elevated)" }}>

        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4 shrink-0" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-secondary)" }}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "linear-gradient(135deg, #8b5cf6, #6366f1)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
              </svg>
            </div>
            <div>
              <h2 className="text-[16px] font-bold" style={{ color: "var(--text-bright)" }}>Multi-Workflow Dashboard</h2>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                {stats.total} workflow{stats.total !== 1 ? "s" : ""} — {overallProgress}% complete
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {workflows.some((w) => w.status === "pending" || w.status === "failed") && (
              <button onClick={handleMigrateAll} className="flex items-center gap-2 rounded-xl px-4 py-2 text-[11px] font-bold transition-all" style={{ background: "var(--accent-gradient)", color: "white" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                Migrate All
              </button>
            )}
            <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-[var(--hover-bg)] transition-colors" style={{ color: "var(--text-muted)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" x2="6" y1="6" y2="18" /><line x1="6" x2="18" y1="6" y2="18" /></svg>
            </button>
          </div>
        </div>

        {/* Overall Progress */}
        {workflows.length > 0 && (
          <div className="shrink-0 h-1.5" style={{ background: "var(--border-subtle)" }}>
            <div className="h-full transition-all duration-500" style={{ width: `${overallProgress}%`, background: "var(--accent-gradient)" }} />
          </div>
        )}

        {/* Stats Bar */}
        {workflows.length > 0 && (
          <div className="shrink-0 flex items-center gap-4 border-b px-6 py-3" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-card)" }}>
            {(["completed", "review", "migrating", "pending", "failed"] as WorkflowStatus[]).map((status) => (
              <button key={status} onClick={() => setFilter(filter === status ? "all" : status)} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition-all" style={{ background: filter === status ? STATUS_CONFIG[status].bg : "transparent", border: `1px solid ${filter === status ? `${STATUS_CONFIG[status].color}30` : "transparent"}` }}>
                <div className="h-2 w-2 rounded-full" style={{ background: STATUS_CONFIG[status].color }} />
                <span className="text-[10px] font-bold" style={{ color: STATUS_CONFIG[status].color }}>{stats[status]}</span>
                <span className="text-[10px] font-semibold capitalize" style={{ color: "var(--text-muted)" }}>{status}</span>
              </button>
            ))}
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <div className="relative">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" className="absolute left-2.5 top-1/2 -translate-y-1/2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search..." className="rounded-lg py-1.5 pl-8 pr-3 text-[11px] w-40" style={{ background: "var(--bg-input)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)", outline: "none" }} />
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-5">
          {workflows.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center h-full gap-4 rounded-2xl border-2 border-dashed transition-colors"
              style={{ borderColor: dragOver ? "var(--accent)" : "var(--border-subtle)", background: dragOver ? "var(--accent-bg)" : "transparent" }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleFileDrop}
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: "var(--accent-bg)", border: "1px solid var(--border-primary)" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17,8 12,3 7,8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>
              </div>
              <p className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>Drop workflow files here</p>
              <p className="text-[12px] text-center max-w-md" style={{ color: "var(--text-muted)" }}>
                Drag & drop multiple JSON workflow files to migrate them all at once. Supports ASL and Logic Apps definitions.
              </p>
              <label className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-[12px] font-bold cursor-pointer transition-all hover:shadow-md" style={{ background: "var(--accent-gradient)", color: "white" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17,8 12,3 7,8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>
                Browse Files
                <input type="file" multiple accept=".json" onChange={handleFileSelect} className="hidden" />
              </label>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Table Header */}
              <div className="flex items-center gap-3 px-4 py-2">
                <input type="checkbox" checked={selectedIds.size === filteredWorkflows.length && filteredWorkflows.length > 0} onChange={toggleSelectAll} className="h-3.5 w-3.5 rounded accent-[var(--accent)]" />
                <button onClick={() => setSortBy("name")} className="flex-1 text-[9px] font-bold uppercase tracking-[0.15em] text-left" style={{ color: "var(--text-muted)" }}>Workflow</button>
                <button onClick={() => setSortBy("status")} className="w-24 text-[9px] font-bold uppercase tracking-[0.15em] text-center" style={{ color: "var(--text-muted)" }}>Status</button>
                <button onClick={() => setSortBy("progress")} className="w-32 text-[9px] font-bold uppercase tracking-[0.15em] text-center" style={{ color: "var(--text-muted)" }}>Progress</button>
                <span className="w-16 text-[9px] font-bold uppercase tracking-[0.15em] text-center" style={{ color: "var(--text-muted)" }}>Issues</span>
                <span className="w-20 text-[9px] font-bold uppercase tracking-[0.15em] text-center" style={{ color: "var(--text-muted)" }}>Actions</span>
              </div>

              {/* Workflow Rows */}
              {filteredWorkflows.map((wf) => {
                const sc = STATUS_CONFIG[wf.status];
                const isSelected = selectedIds.has(wf.id);
                return (
                  <div key={wf.id} className="flex items-center gap-3 rounded-xl px-4 py-3 transition-all" style={{ background: isSelected ? "var(--accent-bg)" : "var(--bg-card)", border: `1px solid ${isSelected ? "var(--border-primary)" : "var(--border-subtle)"}` }}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(wf.id)} className="h-3.5 w-3.5 rounded accent-[var(--accent)]" />
                    <div className="flex-1 min-w-0">
                      <span className="text-[12px] font-bold block truncate" style={{ color: "var(--text-bright)" }}>{wf.name}</span>
                      <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>{wf.lastUpdated.toLocaleTimeString()}</span>
                    </div>
                    <div className="w-24 flex justify-center">
                      <span className="rounded-full px-2.5 py-0.5 text-[9px] font-bold" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
                    </div>
                    <div className="w-32">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border-subtle)" }}>
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${wf.progress}%`, background: wf.status === "failed" ? "var(--error)" : wf.status === "completed" ? "var(--success)" : "var(--accent)" }} />
                        </div>
                        <span className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>{wf.progress}%</span>
                      </div>
                    </div>
                    <div className="w-16 flex justify-center gap-1.5">
                      {wf.errorCount > 0 && <span className="text-[10px] font-bold" style={{ color: "var(--error)" }}>{wf.errorCount}E</span>}
                      {wf.warningCount > 0 && <span className="text-[10px] font-bold" style={{ color: "var(--warning)" }}>{wf.warningCount}W</span>}
                      {wf.errorCount === 0 && wf.warningCount === 0 && wf.status === "completed" && <span className="text-[10px]" style={{ color: "var(--success)" }}>Clean</span>}
                      {wf.status === "pending" && <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>—</span>}
                    </div>
                    <div className="w-20 text-center">
                      <span className="text-[11px] font-mono" style={{ color: "var(--text-secondary)" }}>{wf.actionCount}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {wf.status === "completed" && (
                        <button onClick={() => onLoadWorkflow(wf.outputCode || "", wf.name)} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-[var(--hover-bg)] transition-colors" style={{ color: "var(--accent)" }} title="Load into editor">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" /><polyline points="10,17 15,12 10,7" /><line x1="15" x2="3" y1="12" y2="12" /></svg>
                        </button>
                      )}
                      <button onClick={() => handleRemove(wf.id)} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-[var(--hover-bg)] transition-colors" style={{ color: "var(--text-muted)" }} title="Remove">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" x2="6" y1="6" y2="18" /><line x1="6" x2="18" y1="6" y2="18" /></svg>
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Batch Actions */}
              {selectedIds.size > 0 && (
                <div className="sticky bottom-0 flex items-center justify-between rounded-xl px-5 py-3 mt-3" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-primary)", boxShadow: "var(--shadow-elevated)" }}>
                  <span className="text-[12px] font-bold" style={{ color: "var(--text-primary)" }}>{selectedIds.size} selected</span>
                  <div className="flex items-center gap-2">
                    <button onClick={handleMigrateSelected} className="flex items-center gap-2 rounded-lg px-4 py-2 text-[11px] font-bold" style={{ background: "var(--accent-gradient)", color: "white" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                      Migrate Selected
                    </button>
                  </div>
                </div>
              )}

              {/* Add More */}
              <div className="flex justify-center pt-3">
                <label className="flex items-center gap-2 rounded-lg px-4 py-2 text-[11px] font-semibold cursor-pointer transition-all hover:bg-[var(--hover-bg)]" style={{ color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" x2="12" y1="5" y2="19" /><line x1="5" x2="19" y1="12" y2="12" /></svg>
                  Add Workflows
                  <input type="file" multiple accept=".json" onChange={handleFileSelect} className="hidden" />
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
