"use client";

import { useState, useEffect, useCallback } from "react";
import {
  listSnapshots,
  saveSnapshot as dbSave,
  deleteSnapshot as dbDelete,
  clearAllSnapshots as dbClear,
  type MigrationSnapshot,
} from "@/lib/version-store";

export type { MigrationSnapshot } from "@/lib/version-store";

export function useVersionHistory() {
  const [snapshots, setSnapshots] = useState<MigrationSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load on mount
  useEffect(() => {
    let cancelled = false;
    listSnapshots()
      .then((list) => {
        if (!cancelled) setSnapshots(list);
      })
      .catch(() => {
        // IndexedDB unavailable — silent fail
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const saveSnapshotFromMigration = useCallback(
    async (params: {
      direction: "aws-to-azure" | "azure-to-aws";
      sourceCode: string;
      outputCode: string;
      migrationLog: string[];
      validationIssues: MigrationSnapshot["validationIssues"];
    }) => {
      const snap: MigrationSnapshot = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        label: `Migration #${snapshots.length + 1}`,
        direction: params.direction,
        sourceCode: params.sourceCode,
        outputCode: params.outputCode,
        migrationLog: params.migrationLog,
        validationIssues: params.validationIssues,
      };

      try {
        await dbSave(snap);
        setSnapshots((prev) => [snap, ...prev]);
      } catch {
        // Silent fail
      }
    },
    [snapshots.length]
  );

  const removeSnapshot = useCallback(async (id: string) => {
    try {
      await dbDelete(id);
      setSnapshots((prev) => prev.filter((s) => s.id !== id));
    } catch {
      // Silent fail
    }
  }, []);

  const clearAll = useCallback(async () => {
    try {
      await dbClear();
      setSnapshots([]);
    } catch {
      // Silent fail
    }
  }, []);

  return {
    snapshots,
    isLoading,
    saveSnapshot: saveSnapshotFromMigration,
    removeSnapshot,
    clearAll,
    count: snapshots.length,
  };
}
