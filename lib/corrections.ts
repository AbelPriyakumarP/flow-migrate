/**
 * Feedback-Driven Correction Engine
 *
 * Captures user edits to migrated output, classifies correction patterns,
 * and generates prompt injections so Gemini learns from every migration.
 */

export const CORRECTIONS_STORAGE_KEY = "flowmigrate_corrections_v1";

// ─── Types ───────────────────────────────────────────────────────

export type CorrectionPattern =
  | "wrong-action-type"
  | "wrong-service-mapping"
  | "missing-field"
  | "wrong-expression"
  | "wrong-property-value"
  | "structural-issue";

export interface CorrectionDiff {
  path: string;
  originalValue: unknown;
  correctedValue: unknown;
  changeType: "modified" | "added" | "removed";
}

export interface Correction {
  id: string;
  pattern: CorrectionPattern;
  direction: "aws-to-azure" | "azure-to-aws";
  sourceType: string;
  targetType: string;
  diffs: CorrectionDiff[];
  naturalLanguage: string;
  frequency: number;
  firstSeen: string;
  lastSeen: string;
}

export interface CorrectionStore {
  corrections: Correction[];
  version: number;
}

// ─── Constants ───────────────────────────────────────────────────

const SKIP_PATHS = new Set([
  "$schema",
  "contentVersion",
  "parameters.$connections",
  "parameters.$connections.defaultValue",
]);

const MAX_DEPTH = 12;
const MAX_VALUE_LENGTH = 200;

// Reverse type map: Azure action type → likely AWS source type
const REVERSE_TYPE_MAP: Record<string, string> = {
  Function: "Task",
  Http: "Task",
  ApiConnection: "Task",
  If: "Choice",
  Switch: "Choice",
  Scope: "Parallel",
  Foreach: "Map",
  Select: "Map",
  Compose: "Pass",
  Terminate: "Fail",
};

// Forward type map: AWS state type → likely Azure target type
const FORWARD_TYPE_MAP: Record<string, string> = {
  Task: "Function/Http",
  Choice: "If/Switch",
  Parallel: "Scope",
  Map: "Select/Foreach",
  Pass: "Compose",
  Wait: "Wait",
  Succeed: "Terminate",
  Fail: "Terminate",
};

const PATTERN_LABELS: Record<CorrectionPattern, string> = {
  "wrong-action-type": "Wrong Action Type",
  "wrong-service-mapping": "Wrong Service Mapping",
  "missing-field": "Missing Field",
  "wrong-expression": "Wrong Expression",
  "wrong-property-value": "Wrong Property Value",
  "structural-issue": "Structural Issue",
};

export { PATTERN_LABELS };

// ─── JSON Tree Differ ────────────────────────────────────────────

export function diffJsonTrees(
  original: unknown,
  edited: unknown,
  path: string = "",
  depth: number = 0
): CorrectionDiff[] {
  if (depth > MAX_DEPTH) return [];

  // Skip boilerplate paths
  if (SKIP_PATHS.has(path)) return [];

  // Both are the same primitive
  if (original === edited) return [];

  // Type mismatch — whole subtree changed
  if (typeof original !== typeof edited) {
    return [{
      path: path || "(root)",
      originalValue: truncateValue(original),
      correctedValue: truncateValue(edited),
      changeType: original === undefined ? "added" : edited === undefined ? "removed" : "modified",
    }];
  }

  // Both null
  if (original === null && edited === null) return [];

  // One is null
  if (original === null || edited === null) {
    return [{
      path: path || "(root)",
      originalValue: truncateValue(original),
      correctedValue: truncateValue(edited),
      changeType: original === null ? "added" : "removed",
    }];
  }

  // Both are arrays
  if (Array.isArray(original) && Array.isArray(edited)) {
    const diffs: CorrectionDiff[] = [];
    const maxLen = Math.max(original.length, edited.length);

    for (let i = 0; i < maxLen; i++) {
      const childPath = path ? `${path}[${i}]` : `[${i}]`;
      if (i >= original.length) {
        diffs.push({
          path: childPath,
          originalValue: undefined,
          correctedValue: truncateValue(edited[i]),
          changeType: "added",
        });
      } else if (i >= edited.length) {
        diffs.push({
          path: childPath,
          originalValue: truncateValue(original[i]),
          correctedValue: undefined,
          changeType: "removed",
        });
      } else {
        diffs.push(...diffJsonTrees(original[i], edited[i], childPath, depth + 1));
      }
    }
    return diffs;
  }

  // Both are objects
  if (typeof original === "object" && typeof edited === "object") {
    const diffs: CorrectionDiff[] = [];
    const origObj = original as Record<string, unknown>;
    const editObj = edited as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(origObj), ...Object.keys(editObj)]);

    for (const key of allKeys) {
      const childPath = path ? `${path}.${key}` : key;

      if (SKIP_PATHS.has(childPath)) continue;

      if (!(key in origObj)) {
        diffs.push({
          path: childPath,
          originalValue: undefined,
          correctedValue: truncateValue(editObj[key]),
          changeType: "added",
        });
      } else if (!(key in editObj)) {
        diffs.push({
          path: childPath,
          originalValue: truncateValue(origObj[key]),
          correctedValue: undefined,
          changeType: "removed",
        });
      } else {
        diffs.push(...diffJsonTrees(origObj[key], editObj[key], childPath, depth + 1));
      }
    }
    return diffs;
  }

  // Primitive value changed
  return [{
    path: path || "(root)",
    originalValue: original,
    correctedValue: edited,
    changeType: "modified",
  }];
}

// ─── Diff Classifier ────────────────────────────────────────────

export function classifyDiff(
  diff: CorrectionDiff,
  direction: "aws-to-azure" | "azure-to-aws",
  originalJson: Record<string, unknown>,
  editedJson: Record<string, unknown>
): Pick<Correction, "pattern" | "sourceType" | "targetType" | "naturalLanguage"> {
  const { path, originalValue, correctedValue, changeType } = diff;
  const pathParts = path.split(".");
  const lastSegment = pathParts[pathParts.length - 1];

  // Rule 1: Action type change
  if (lastSegment === "type" && typeof originalValue === "string" && typeof correctedValue === "string") {
    const sourceType = direction === "aws-to-azure"
      ? (REVERSE_TYPE_MAP[correctedValue as string] || "Unknown")
      : (correctedValue as string);
    const targetType = correctedValue as string;

    return {
      pattern: "wrong-action-type",
      sourceType,
      targetType,
      naturalLanguage: `When migrating, use action type "${correctedValue}" not "${originalValue}".`,
    };
  }

  // Rule 2: Service mapping (path contains service keywords)
  const serviceKeywords = ["lambda", "dynamodb", "sqs", "sns", "s3", "cosmos", "servicebus", "eventgrid"];
  const pathLower = path.toLowerCase();
  const hasServiceContext = serviceKeywords.some(kw => pathLower.includes(kw));

  if (hasServiceContext && (lastSegment === "type" || lastSegment === "uri" || pathLower.includes("host"))) {
    const actionName = extractActionName(path);
    const actionType = lookupActionType(originalJson, actionName) || "Unknown";

    return {
      pattern: "wrong-service-mapping",
      sourceType: actionType,
      targetType: String(correctedValue),
      naturalLanguage: `Service mapping at "${actionName}": use "${correctedValue}" instead of "${originalValue}".`,
    };
  }

  // Rule 3: Missing field (added by user)
  if (changeType === "added") {
    const requiredFields = ["retryPolicy", "runAfter", "expression", "inputs", "type", "kind"];
    const isCriticalField = requiredFields.includes(lastSegment);
    const actionName = extractActionName(path);
    const actionType = lookupActionType(editedJson, actionName) || "Unknown";

    return {
      pattern: "missing-field",
      sourceType: direction === "aws-to-azure" ? (REVERSE_TYPE_MAP[actionType] || "Unknown") : actionType,
      targetType: actionType,
      naturalLanguage: isCriticalField
        ? `"${lastSegment}" must be present on ${actionType} actions; it was missing from the AI output.`
        : `Field "${lastSegment}" was added at "${path}" — include it in future migrations.`,
    };
  }

  // Rule 4: Expression or runAfter change
  if (pathLower.includes("expression") || pathLower.includes("runafter")) {
    const actionName = extractActionName(path);
    const actionType = lookupActionType(originalJson, actionName) || "Unknown";

    return {
      pattern: "wrong-expression",
      sourceType: direction === "aws-to-azure" ? (REVERSE_TYPE_MAP[actionType] || "Unknown") : actionType,
      targetType: actionType,
      naturalLanguage: `The ${lastSegment} at "${actionName}" was corrected from ${summarize(originalValue)} to ${summarize(correctedValue)}.`,
    };
  }

  // Rule 5: Property value change (leaf value)
  if (typeof originalValue !== "object" && typeof correctedValue !== "object" && changeType === "modified") {
    const actionName = extractActionName(path);
    const actionType = lookupActionType(originalJson, actionName) || "Unknown";

    return {
      pattern: "wrong-property-value",
      sourceType: direction === "aws-to-azure" ? (REVERSE_TYPE_MAP[actionType] || "Unknown") : actionType,
      targetType: actionType,
      naturalLanguage: `Property "${lastSegment}" should be "${correctedValue}", not "${originalValue}".`,
    };
  }

  // Rule 6: Structural issue (catch-all)
  const actionName = extractActionName(path);
  return {
    pattern: "structural-issue",
    sourceType: "Unknown",
    targetType: lookupActionType(originalJson, actionName) || "Unknown",
    naturalLanguage: `Structural correction at "${path}": review action placement and scope.`,
  };
}

// ─── Process Corrections ─────────────────────────────────────────

export function processCorrections(
  originalOutput: string,
  editedOutput: string,
  direction: "aws-to-azure" | "azure-to-aws"
): Correction[] {
  try {
    const originalJson = JSON.parse(originalOutput);
    const editedJson = JSON.parse(editedOutput);

    // Normalize both to remove formatting-only differences
    const normalizedOriginal = JSON.parse(JSON.stringify(originalJson));
    const normalizedEdited = JSON.parse(JSON.stringify(editedJson));

    const diffs = diffJsonTrees(normalizedOriginal, normalizedEdited);

    if (diffs.length === 0) return [];

    const corrections: Correction[] = [];
    const now = new Date().toISOString();

    for (const diff of diffs) {
      const classification = classifyDiff(diff, direction, originalJson, editedJson);

      corrections.push({
        id: generateId(),
        pattern: classification.pattern,
        direction,
        sourceType: classification.sourceType,
        targetType: classification.targetType,
        diffs: [diff],
        naturalLanguage: classification.naturalLanguage,
        frequency: 1,
        firstSeen: now,
        lastSeen: now,
      });
    }

    return corrections;
  } catch (e) {
    console.warn("[Corrections] Failed to process corrections:", e);
    return [];
  }
}

// ─── Store Management ────────────────────────────────────────────

export function mergeIntoStore(
  existing: Correction[],
  incoming: Correction[]
): Correction[] {
  const merged = [...existing];
  const now = new Date().toISOString();

  for (const inc of incoming) {
    // Find matching existing correction by pattern + direction + types
    const matchIdx = merged.findIndex(
      (ex) =>
        ex.pattern === inc.pattern &&
        ex.direction === inc.direction &&
        ex.sourceType === inc.sourceType &&
        ex.targetType === inc.targetType
    );

    if (matchIdx !== -1) {
      // Update existing: increment frequency, update timestamp
      merged[matchIdx] = {
        ...merged[matchIdx],
        frequency: merged[matchIdx].frequency + 1,
        lastSeen: now,
        // Keep the best natural language (most recent)
        naturalLanguage: inc.naturalLanguage,
        // Merge diffs (union by path)
        diffs: mergeDiffs(merged[matchIdx].diffs, inc.diffs),
      };
    } else {
      merged.push(inc);
    }
  }

  return merged;
}

function mergeDiffs(existing: CorrectionDiff[], incoming: CorrectionDiff[]): CorrectionDiff[] {
  const byPath = new Map<string, CorrectionDiff>();
  for (const d of existing) byPath.set(d.path, d);
  for (const d of incoming) byPath.set(d.path, d); // latest wins
  return Array.from(byPath.values());
}

// ─── Prompt Generator ────────────────────────────────────────────

export function generateCorrectionsPrompt(
  corrections: Correction[],
  direction: "aws-to-azure" | "azure-to-aws"
): string {
  // Filter to current direction only
  const relevant = corrections
    .filter((c) => c.direction === direction)
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 10); // Top 10 by frequency

  if (relevant.length === 0) return "";

  const lines = relevant.map((c) => {
    const prefix = c.frequency >= 3 ? "CRITICAL: " : "";
    const freqLabel = c.frequency === 1 ? "seen 1 time" : `seen ${c.frequency} times`;
    return `- ${prefix}[${PATTERN_LABELS[c.pattern]}] (${freqLabel}): ${c.naturalLanguage}`;
  });

  return [
    "=== LEARNED CORRECTIONS FROM USER FEEDBACK (apply these rules, they override defaults) ===",
    "",
    ...lines,
    "",
    "=== END CORRECTIONS ===",
  ].join("\n");
}

// ─── Helpers ─────────────────────────────────────────────────────

function truncateValue(value: unknown): unknown {
  if (typeof value === "string" && value.length > MAX_VALUE_LENGTH) {
    return value.slice(0, MAX_VALUE_LENGTH) + "...";
  }
  if (typeof value === "object" && value !== null) {
    const str = JSON.stringify(value);
    if (str.length > MAX_VALUE_LENGTH) {
      return JSON.parse(str.slice(0, MAX_VALUE_LENGTH - 3) + "...");
    }
  }
  return value;
}

function extractActionName(path: string): string {
  // Extract the action name from a dotted path like "actions.Validate_Order.retryPolicy"
  const parts = path.split(".");
  if (parts[0] === "actions" && parts.length >= 2) {
    return parts[1];
  }
  // Try nested: "actions.Is_In_Stock.actions.Process_Payment.type"
  for (let i = parts.length - 2; i >= 0; i--) {
    if (parts[i] === "actions" && parts[i + 1]) {
      return parts[i + 1];
    }
  }
  return parts[0] || "root";
}

function lookupActionType(json: Record<string, unknown>, actionName: string): string | null {
  const actions = json.actions as Record<string, Record<string, unknown>> | undefined;
  if (!actions) return null;

  // Direct lookup
  if (actions[actionName]?.type) {
    return actions[actionName].type as string;
  }

  // Search nested actions
  for (const action of Object.values(actions)) {
    if (action.actions) {
      const nested = action.actions as Record<string, Record<string, unknown>>;
      if (nested[actionName]?.type) return nested[actionName].type as string;
    }
    if (action.else) {
      const elseActions = (action.else as Record<string, unknown>).actions as Record<string, Record<string, unknown>> | undefined;
      if (elseActions?.[actionName]?.type) return elseActions[actionName].type as string;
    }
    if (action.cases) {
      for (const caseBlock of Object.values(action.cases as Record<string, Record<string, unknown>>)) {
        const caseActions = caseBlock.actions as Record<string, Record<string, unknown>> | undefined;
        if (caseActions?.[actionName]?.type) return caseActions[actionName].type as string;
      }
    }
  }

  // Check States (for AWS ASL)
  const states = json.States as Record<string, Record<string, unknown>> | undefined;
  if (states?.[actionName]?.Type) {
    return states[actionName].Type as string;
  }

  return null;
}

function summarize(value: unknown): string {
  if (value === undefined) return "(empty)";
  if (value === null) return "null";
  if (typeof value === "string") return `"${value.slice(0, 60)}"`;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const str = JSON.stringify(value);
  return str.length > 60 ? str.slice(0, 57) + "..." : str;
}

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
