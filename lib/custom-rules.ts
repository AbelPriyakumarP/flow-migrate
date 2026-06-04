/**
 * Custom Migration Rules Engine
 *
 * Pre-processing rules shape the source JSON before Gemini sees it.
 * Post-processing rules override Gemini output after migration.
 * Applied client-side — the API stays stateless.
 */

export const CUSTOM_RULES_STORAGE_KEY = "flowmigrate_custom_rules_v1";

// ─── Types ───────────────────────────────────────────────────────

export type RuleType = "json-path-replace" | "regex-replace" | "field-rename" | "field-delete";
export type RuleStage = "pre" | "post";

export interface CustomRule {
  id: string;
  name: string;
  type: RuleType;
  stage: RuleStage;
  direction: "aws-to-azure" | "azure-to-aws" | "both";
  enabled: boolean;
  /** JSON path (dot-separated, e.g. "actions.*.type") or regex pattern */
  match: string;
  /** Replacement value or new field name */
  replacement: string;
  createdAt: string;
}

export interface CustomRuleStore {
  rules: CustomRule[];
  version: number;
}

// ─── Rule Type Labels ───────────────────────────────────────────

export const RULE_TYPE_LABELS: Record<RuleType, string> = {
  "json-path-replace": "JSON Path Replace",
  "regex-replace": "Regex Replace",
  "field-rename": "Field Rename",
  "field-delete": "Field Delete",
};

export const RULE_STAGE_LABELS: Record<RuleStage, string> = {
  pre: "Pre-Processing",
  post: "Post-Processing",
};

// ─── Storage ────────────────────────────────────────────────────

export function loadRules(): CustomRule[] {
  try {
    const raw = localStorage.getItem(CUSTOM_RULES_STORAGE_KEY);
    if (!raw) return [];
    const store: CustomRuleStore = JSON.parse(raw);
    return store.rules || [];
  } catch {
    return [];
  }
}

export function saveRules(rules: CustomRule[]): void {
  try {
    const store: CustomRuleStore = { rules, version: 1 };
    localStorage.setItem(CUSTOM_RULES_STORAGE_KEY, JSON.stringify(store));
  } catch (e) {
    console.warn("[CustomRules] Failed to save:", e);
  }
}

// ─── Apply Pre-Rules ────────────────────────────────────────────

export function applyPreRules(
  sourceJson: string,
  rules: CustomRule[],
  direction: "aws-to-azure" | "azure-to-aws"
): string {
  const active = rules.filter(
    (r) => r.enabled && r.stage === "pre" && (r.direction === direction || r.direction === "both")
  );
  if (active.length === 0) return sourceJson;

  let result = sourceJson;

  for (const rule of active) {
    try {
      result = applySingleRule(result, rule);
    } catch (e) {
      console.warn(`[CustomRules] Pre-rule "${rule.name}" failed:`, e);
    }
  }

  return result;
}

// ─── Apply Post-Rules ───────────────────────────────────────────

export function applyPostRules(
  outputJson: string,
  rules: CustomRule[],
  direction: "aws-to-azure" | "azure-to-aws"
): string {
  const active = rules.filter(
    (r) => r.enabled && r.stage === "post" && (r.direction === direction || r.direction === "both")
  );
  if (active.length === 0) return outputJson;

  let result = outputJson;

  for (const rule of active) {
    try {
      result = applySingleRule(result, rule);
    } catch (e) {
      console.warn(`[CustomRules] Post-rule "${rule.name}" failed:`, e);
    }
  }

  return result;
}

// ─── Single Rule Application ────────────────────────────────────

function applySingleRule(jsonStr: string, rule: CustomRule): string {
  switch (rule.type) {
    case "regex-replace":
      return applyRegexReplace(jsonStr, rule);
    case "json-path-replace":
      return applyJsonPathReplace(jsonStr, rule);
    case "field-rename":
      return applyFieldRename(jsonStr, rule);
    case "field-delete":
      return applyFieldDelete(jsonStr, rule);
    default:
      return jsonStr;
  }
}

function applyRegexReplace(jsonStr: string, rule: CustomRule): string {
  const regex = new RegExp(rule.match, "g");
  return jsonStr.replace(regex, rule.replacement);
}

function applyJsonPathReplace(jsonStr: string, rule: CustomRule): string {
  const obj = JSON.parse(jsonStr);
  const pathParts = rule.match.split(".");

  setByPath(obj, pathParts, 0, rule.replacement);

  return JSON.stringify(obj, null, 2);
}

function applyFieldRename(jsonStr: string, rule: CustomRule): string {
  const obj = JSON.parse(jsonStr);
  renameField(obj, rule.match, rule.replacement);
  return JSON.stringify(obj, null, 2);
}

function applyFieldDelete(jsonStr: string, rule: CustomRule): string {
  const obj = JSON.parse(jsonStr);
  deleteField(obj, rule.match);
  return JSON.stringify(obj, null, 2);
}

// ─── Path Traversal Helpers ─────────────────────────────────────

function setByPath(obj: unknown, parts: string[], index: number, value: string): void {
  if (obj === null || typeof obj !== "object") return;

  const key = parts[index];
  const record = obj as Record<string, unknown>;

  if (key === "*") {
    // Wildcard: apply to all children
    for (const childKey of Object.keys(record)) {
      if (index === parts.length - 1) {
        record[childKey] = parseReplacement(value);
      } else {
        setByPath(record[childKey], parts, index + 1, value);
      }
    }
  } else if (index === parts.length - 1) {
    if (key in record) {
      record[key] = parseReplacement(value);
    }
  } else {
    if (record[key] !== undefined) {
      setByPath(record[key], parts, index + 1, value);
    }
  }
}

function renameField(obj: unknown, oldName: string, newName: string): void {
  if (obj === null || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const item of obj) renameField(item, oldName, newName);
    return;
  }
  const record = obj as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key === oldName) {
      record[newName] = record[oldName];
      delete record[oldName];
    }
    if (typeof record[key] === "object" && record[key] !== null) {
      renameField(record[key], oldName, newName);
    }
  }
}

function deleteField(obj: unknown, fieldName: string): void {
  if (obj === null || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const item of obj) deleteField(item, fieldName);
    return;
  }
  const record = obj as Record<string, unknown>;
  if (fieldName in record) {
    delete record[fieldName];
  }
  for (const key of Object.keys(record)) {
    if (typeof record[key] === "object" && record[key] !== null) {
      deleteField(record[key], fieldName);
    }
  }
}

function parseReplacement(value: string): unknown {
  // Try to parse as JSON (numbers, booleans, objects, arrays)
  try {
    return JSON.parse(value);
  } catch {
    return value; // Keep as string
  }
}

// ─── Helpers ────────────────────────────────────────────────────

export function generateRuleId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyRule(stage: RuleStage = "post"): CustomRule {
  return {
    id: generateRuleId(),
    name: "",
    type: "regex-replace",
    stage,
    direction: "both",
    enabled: true,
    match: "",
    replacement: "",
    createdAt: new Date().toISOString(),
  };
}

export function getActiveRuleCount(
  rules: CustomRule[],
  direction: "aws-to-azure" | "azure-to-aws"
): number {
  return rules.filter(
    (r) => r.enabled && (r.direction === direction || r.direction === "both")
  ).length;
}
