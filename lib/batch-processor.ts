/**
 * Batch Migration Processor
 *
 * Sequential queue with 500ms delay between requests for rate limiting.
 * Supports abort via AbortController.
 */

import { detectPlatform, type Platform } from "@/lib/detect-platform";

export interface BatchFile {
  id: string;
  name: string;
  content: string;
  detectedPlatform: Platform | "unknown";
}

export interface BatchResult {
  id: string;
  name: string;
  status: "success" | "error" | "skipped" | "aborted";
  outputCode?: string;
  outputFilename?: string;
  error?: string;
  direction?: "aws-to-azure" | "azure-to-aws";
  migrationLog?: string[];
}

export interface BatchProgress {
  current: number;
  total: number;
  currentFile: string;
  results: BatchResult[];
}

const DELAY_BETWEEN_REQUESTS = 500;

export async function processBatch(
  files: BatchFile[],
  targetPlatform: Platform,
  onProgress: (progress: BatchProgress) => void,
  signal?: AbortSignal
): Promise<BatchResult[]> {
  const results: BatchResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    // Check for abort between items
    if (signal?.aborted) {
      // Mark remaining as aborted
      for (let j = i; j < files.length; j++) {
        results.push({
          id: files[j].id,
          name: files[j].name,
          status: "aborted",
          error: "Migration cancelled",
        });
      }
      break;
    }

    onProgress({
      current: i + 1,
      total: files.length,
      currentFile: file.name,
      results: [...results],
    });

    // Skip files with undetectable platform or same as target
    if (file.detectedPlatform === "unknown") {
      results.push({
        id: file.id,
        name: file.name,
        status: "skipped",
        error: "Could not detect workflow platform",
      });
      continue;
    }

    if (file.detectedPlatform === targetPlatform) {
      results.push({
        id: file.id,
        name: file.name,
        status: "skipped",
        error: `Already in ${targetPlatform === "aws-step-functions" ? "AWS" : "Azure"} format`,
      });
      continue;
    }

    try {
      const res = await fetch("/api/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceCode: file.content,
          targetPlatform,
        }),
        signal,
      });

      const data = await res.json();

      if (!res.ok) {
        results.push({
          id: file.id,
          name: file.name,
          status: "error",
          error: data.error || "Migration failed",
        });
      } else {
        const ext = file.name.endsWith(".json") ? "" : ".json";
        const baseName = file.name.replace(/\.[^.]+$/, "");
        const targetLabel = targetPlatform === "aws-step-functions" ? "aws" : "azure";

        results.push({
          id: file.id,
          name: file.name,
          status: "success",
          outputCode: data.outputCode,
          outputFilename: `${baseName}.migrated-${targetLabel}${ext || ".json"}`,
          direction: data.direction,
          migrationLog: data.migrationLog,
        });
      }
    } catch (err) {
      if (signal?.aborted) {
        results.push({
          id: file.id,
          name: file.name,
          status: "aborted",
          error: "Migration cancelled",
        });
        // Mark remaining as aborted
        for (let j = i + 1; j < files.length; j++) {
          results.push({
            id: files[j].id,
            name: files[j].name,
            status: "aborted",
            error: "Migration cancelled",
          });
        }
        break;
      }
      results.push({
        id: file.id,
        name: file.name,
        status: "error",
        error: err instanceof Error ? err.message : "Network error",
      });
    }

    // Delay between requests (not after last)
    if (i < files.length - 1 && !signal?.aborted) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
    }
  }

  // Final progress update
  onProgress({
    current: files.length,
    total: files.length,
    currentFile: "",
    results,
  });

  return results;
}

export function parseUploadedFiles(fileList: FileList): Promise<BatchFile[]> {
  const promises = Array.from(fileList).map(
    (file) =>
      new Promise<BatchFile>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          const detected = detectPlatform(content);
          resolve({
            id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            content,
            detectedPlatform: detected.platform,
          });
        };
        reader.onerror = () => {
          resolve({
            id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            content: "",
            detectedPlatform: "unknown",
          });
        };
        reader.readAsText(file);
      })
  );
  return Promise.all(promises);
}

export async function downloadResultsAsZip(results: BatchResult[]): Promise<void> {
  const successful = results.filter((r) => r.status === "success" && r.outputCode);
  if (successful.length === 0) return;

  // Dynamic import to keep bundle lean
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  for (const result of successful) {
    zip.file(result.outputFilename || `${result.name}.migrated.json`, result.outputCode!);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `flowmigrate-batch-${new Date().toISOString().slice(0, 10)}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
