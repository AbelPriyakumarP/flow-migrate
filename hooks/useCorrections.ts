"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CORRECTIONS_STORAGE_KEY,
  mergeIntoStore,
  generateCorrectionsPrompt,
  type Correction,
  type CorrectionStore,
} from "@/lib/corrections";

const EMPTY_STORE: CorrectionStore = { corrections: [], version: 1 };

export function useCorrections() {
  const [corrections, setCorrections] = useState<Correction[]>([]);

  // Load from localStorage on mount (in useEffect to avoid SSR mismatch)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CORRECTIONS_STORAGE_KEY);
      if (raw) {
        const store: CorrectionStore = JSON.parse(raw);
        if (store.corrections && Array.isArray(store.corrections)) {
          setCorrections(store.corrections);
        }
      }
    } catch (e) {
      console.warn("[Corrections] Failed to load from localStorage:", e);
    }
  }, []);

  // Persist to localStorage whenever corrections change
  const persist = useCallback((updated: Correction[]) => {
    try {
      const store: CorrectionStore = { corrections: updated, version: 1 };
      localStorage.setItem(CORRECTIONS_STORAGE_KEY, JSON.stringify(store));
    } catch (e) {
      console.warn("[Corrections] Failed to save to localStorage:", e);
    }
  }, []);

  const addCorrections = useCallback(
    (incoming: Correction[]) => {
      setCorrections((prev) => {
        const merged = mergeIntoStore(prev, incoming);
        persist(merged);
        return merged;
      });
    },
    [persist]
  );

  const removeCorrection = useCallback(
    (id: string) => {
      setCorrections((prev) => {
        const updated = prev.filter((c) => c.id !== id);
        persist(updated);
        return updated;
      });
    },
    [persist]
  );

  const clearCorrections = useCallback(() => {
    setCorrections([]);
    try {
      localStorage.removeItem(CORRECTIONS_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const getPromptBlock = useCallback(
    (direction: "aws-to-azure" | "azure-to-aws"): string => {
      return generateCorrectionsPrompt(corrections, direction);
    },
    [corrections]
  );

  const correctionCount = corrections.length;
  const activeCount = (direction: "aws-to-azure" | "azure-to-aws") =>
    corrections.filter((c) => c.direction === direction).length;

  return {
    corrections,
    correctionCount,
    activeCount,
    addCorrections,
    removeCorrection,
    clearCorrections,
    getPromptBlock,
  };
}
