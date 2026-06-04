"use client";

import { useState, useEffect, useCallback } from "react";
import {
  loadRules,
  saveRules,
  getActiveRuleCount,
  type CustomRule,
} from "@/lib/custom-rules";

export function useCustomRules() {
  const [rules, setRules] = useState<CustomRule[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    setRules(loadRules());
  }, []);

  const persist = useCallback((updated: CustomRule[]) => {
    saveRules(updated);
  }, []);

  const addRule = useCallback(
    (rule: CustomRule) => {
      setRules((prev) => {
        const updated = [...prev, rule];
        persist(updated);
        return updated;
      });
    },
    [persist]
  );

  const updateRule = useCallback(
    (id: string, changes: Partial<CustomRule>) => {
      setRules((prev) => {
        const updated = prev.map((r) => (r.id === id ? { ...r, ...changes } : r));
        persist(updated);
        return updated;
      });
    },
    [persist]
  );

  const removeRule = useCallback(
    (id: string) => {
      setRules((prev) => {
        const updated = prev.filter((r) => r.id !== id);
        persist(updated);
        return updated;
      });
    },
    [persist]
  );

  const toggleRule = useCallback(
    (id: string) => {
      setRules((prev) => {
        const updated = prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
        persist(updated);
        return updated;
      });
    },
    [persist]
  );

  const clearAll = useCallback(() => {
    setRules([]);
    persist([]);
  }, [persist]);

  const activeCount = useCallback(
    (direction: "aws-to-azure" | "azure-to-aws") => {
      return getActiveRuleCount(rules, direction);
    },
    [rules]
  );

  return {
    rules,
    addRule,
    updateRule,
    removeRule,
    toggleRule,
    clearAll,
    activeCount,
    totalCount: rules.length,
  };
}
