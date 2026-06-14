/**
 * Workflow Graph Parser
 *
 * Transforms AWS Step Functions (ASL) and Azure Logic Apps JSON
 * into React Flow nodes and edges for visual rendering.
 */

import type { Node, Edge } from "@xyflow/react";

// ─── Types ───────────────────────────────────────────────────────

export interface WorkflowNode extends Node {
  data: {
    label: string;
    type: string;
    platform: "aws" | "azure";
    status?: "green" | "amber" | "red";
    isStart?: boolean;
    isEnd?: boolean;
    isBranch?: boolean;
    isError?: boolean;
    resource?: string;
    hasRetry?: boolean;
    hasCatch?: boolean;
    needsManualConfig?: boolean;
    children?: number;
  };
}

export interface WorkflowEdge extends Edge {
  data?: {
    label?: string;
    isError?: boolean;
    isBranch?: boolean;
    isDefault?: boolean;
  };
}

export interface ParsedGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

// ─── Node Type Config ────────────────────────────────────────────

const AWS_TYPE_ICONS: Record<string, string> = {
  Task: "T",
  Choice: "?",
  Parallel: "||",
  Map: "M",
  Pass: "→",
  Wait: "⏱",
  Succeed: "✓",
  Fail: "✗",
};

const AZURE_TYPE_ICONS: Record<string, string> = {
  Function: "ƒ",
  Http: "H",
  ApiConnection: "A",
  If: "?",
  Switch: "⇋",
  Scope: "{ }",
  Foreach: "∀",
  Select: "S",
  Compose: "C",
  Terminate: "✗",
  Request: "▶",
};

// ─── Placeholder / manual-config detection ──────────────────────
// Flags a step that still contains values the user must fill in before
// deploying (so the flow graph itself highlights manual work).
const PLACEHOLDER_RE =
  /ACCOUNT_ID|TODO|REPLACE|CHANGE_ME|YOUR[_-]|<[^>]+>|\$connections|sub-id|PENDING|GAP_NOTICE|example\.com|placeholder/i;

function stepNeedsManualConfig(obj: unknown): boolean {
  try {
    return PLACEHOLDER_RE.test(JSON.stringify(obj));
  } catch {
    return false;
  }
}

// ─── AWS Step Functions Parser ──────────────────────────────────

export function parseAWSStepFunctions(json: Record<string, unknown>): ParsedGraph {
  const statesOrUndef = json.States as Record<string, Record<string, unknown>> | undefined;
  const startAt = json.StartAt as string | undefined;

  if (!statesOrUndef) return { nodes: [], edges: [] };

  const states = statesOrUndef;
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];
  const stateNames = Object.keys(states);

  // Layout: vertical flow
  const X_CENTER = 250;
  const Y_SPACING = 100;
  const X_BRANCH_OFFSET = 200;

  // Add start terminal
  nodes.push({
    id: "__start__",
    type: "terminalNode",
    position: { x: X_CENTER, y: 0 },
    data: { label: "Start", type: "Start", platform: "aws", isStart: true },
  });

  // Build adjacency for topological ordering
  const visited = new Set<string>();
  const ordered: string[] = [];

  function visit(name: string) {
    if (visited.has(name) || !states[name]) return;
    visited.add(name);
    const state = states[name];
    if (state.Next) visit(state.Next as string);
    if (state.Default) visit(state.Default as string);
    if (state.Choices) {
      for (const choice of state.Choices as Record<string, unknown>[]) {
        if (choice.Next) visit(choice.Next as string);
      }
    }
    ordered.unshift(name);
  }

  if (startAt) visit(startAt);
  // Add any unvisited states
  for (const name of stateNames) {
    if (!visited.has(name)) {
      visit(name);
    }
  }

  // Reorder to follow natural flow from StartAt
  const finalOrder: string[] = [];
  const placed = new Set<string>();

  function placeState(name: string) {
    if (placed.has(name) || !states[name]) return;
    placed.add(name);
    finalOrder.push(name);
    const state = states[name];
    if (state.Next) placeState(state.Next as string);
    if (state.Default) placeState(state.Default as string);
    if (state.Choices) {
      for (const choice of state.Choices as Record<string, unknown>[]) {
        if (choice.Next) placeState(choice.Next as string);
      }
    }
    if (state.Catch) {
      for (const c of state.Catch as Record<string, unknown>[]) {
        if (c.Next) placeState(c.Next as string);
      }
    }
  }

  if (startAt) placeState(startAt);
  for (const name of stateNames) {
    if (!placed.has(name)) {
      placed.add(name);
      finalOrder.push(name);
    }
  }

  // Create nodes
  finalOrder.forEach((name, index) => {
    const state = states[name];
    const stateType = state.Type as string;
    const isEnd = !!state.End || stateType === "Succeed" || stateType === "Fail";
    const isError = stateType === "Fail";
    const resource = state.Resource as string | undefined;

    let shortResource: string | undefined;
    if (resource) {
      if (resource.includes("lambda")) {
        const fnName = resource.split("/").pop();
        shortResource = `λ ${fnName}`;
      } else if (resource.includes("dynamodb")) {
        shortResource = "DynamoDB";
      } else if (resource.includes("sns")) {
        shortResource = "SNS";
      } else if (resource.includes("sqs")) {
        shortResource = "SQS";
      } else if (resource.includes("s3")) {
        shortResource = "S3";
      } else {
        shortResource = resource.split(":").pop();
      }
    }

    nodes.push({
      id: name,
      type: "workflowNode",
      position: { x: X_CENTER, y: (index + 1) * Y_SPACING },
      data: {
        label: name,
        type: stateType,
        platform: "aws",
        isEnd,
        isError,
        isBranch: stateType === "Choice" || stateType === "Parallel",
        resource: shortResource,
        hasRetry: !!state.Retry,
        hasCatch: !!state.Catch,
        needsManualConfig: stepNeedsManualConfig(state),
      },
    });
  });

  // Add end terminal
  const endY = (finalOrder.length + 1) * Y_SPACING;
  nodes.push({
    id: "__end__",
    type: "terminalNode",
    position: { x: X_CENTER, y: endY },
    data: { label: "End", type: "End", platform: "aws", isEnd: true },
  });

  // Connect start to first state
  if (startAt) {
    edges.push({
      id: `__start__->${startAt}`,
      source: "__start__",
      target: startAt,
      type: "smoothstep",
      animated: true,
      style: { stroke: "#94a3b8", strokeWidth: 1.5 },
    });
  }

  // Create edges
  for (const name of finalOrder) {
    const state = states[name];
    const stateType = state.Type as string;

    if (state.Next) {
      edges.push({
        id: `${name}->${state.Next}`,
        source: name,
        target: state.Next as string,
        type: "smoothstep",
        style: { stroke: "#94a3b8", strokeWidth: 1.5 },
      });
    }

    if (stateType === "Choice") {
      const choices = state.Choices as Record<string, unknown>[] | undefined;
      if (choices) {
        choices.forEach((choice, ci) => {
          if (choice.Next) {
            edges.push({
              id: `${name}->choice_${ci}_${choice.Next}`,
              source: name,
              target: choice.Next as string,
              type: "smoothstep",
              label: getChoiceLabel(choice),
              labelStyle: { fontSize: 9, fill: "#64748b" },
              style: { stroke: "#6366f1", strokeWidth: 1.5, strokeDasharray: "4 2" },
              data: { isBranch: true },
            });
          }
        });
      }
      if (state.Default) {
        edges.push({
          id: `${name}->default_${state.Default}`,
          source: name,
          target: state.Default as string,
          type: "smoothstep",
          label: "default",
          labelStyle: { fontSize: 9, fill: "#94a3b8" },
          style: { stroke: "#94a3b8", strokeWidth: 1.5, strokeDasharray: "6 3" },
          data: { isDefault: true },
        });
      }
    }

    if (state.Catch) {
      for (const c of state.Catch as Record<string, unknown>[]) {
        if (c.Next) {
          const errorTypes = (c.ErrorEquals as string[])?.join(", ") || "Error";
          edges.push({
            id: `${name}->catch_${c.Next}`,
            source: name,
            target: c.Next as string,
            type: "smoothstep",
            label: `⚡ ${errorTypes}`,
            labelStyle: { fontSize: 9, fill: "#dc2626" },
            style: { stroke: "#f87171", strokeWidth: 1.5, strokeDasharray: "3 3" },
            data: { isError: true },
          });
        }
      }
    }

    // Terminal states connect to end
    if (state.End || stateType === "Succeed") {
      edges.push({
        id: `${name}->__end__`,
        source: name,
        target: "__end__",
        type: "smoothstep",
        style: { stroke: "#10b981", strokeWidth: 1.5 },
      });
    }
  }

  return { nodes, edges };
}

// ─── Azure Logic Apps Parser ─────────────────────────────────────

export function parseAzureLogicApps(json: Record<string, unknown>): ParsedGraph {
  // Handle both flat { actions, triggers } and nested { definition: { actions, triggers } }
  const definition = (json.definition as Record<string, unknown>) || json;
  const actions = (definition.actions as Record<string, Record<string, unknown>>) || (json.actions as Record<string, Record<string, unknown>>) || undefined;
  const triggers = (definition.triggers as Record<string, Record<string, unknown>>) || (json.triggers as Record<string, Record<string, unknown>>) || undefined;

  if (!actions) return { nodes: [], edges: [] };

  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];

  const Y_SPACING = 100;
  const X_CENTER = 250;

  // Add trigger node if present
  let triggerName: string | null = null;
  if (triggers) {
    const triggerEntries = Object.entries(triggers);
    if (triggerEntries.length > 0) {
      triggerName = triggerEntries[0][0];
      const trigger = triggerEntries[0][1];
      nodes.push({
        id: triggerName,
        type: "workflowNode",
        position: { x: X_CENTER, y: 0 },
        data: {
          label: triggerName.replace(/_/g, " "),
          type: (trigger.type as string) || "Trigger",
          platform: "azure",
          isStart: true,
        },
      });
    }
  }

  // Recursively flatten ALL actions (including nested inside If/Switch/Scope/Foreach)
  interface FlatAction {
    name: string;
    action: Record<string, unknown>;
    parentId: string | null;
    branchLabel: string | null; // "true", "false", "case:Engineering", etc.
  }

  function flattenActions(
    actionsObj: Record<string, Record<string, unknown>>,
    parentId: string | null,
    branchLabel: string | null
  ): FlatAction[] {
    const result: FlatAction[] = [];
    for (const [name, action] of Object.entries(actionsObj)) {
      result.push({ name, action, parentId, branchLabel });

      const actionType = (action.type as string) || "";

      // If — recurse into actions (true branch) and else.actions (false branch)
      if (actionType === "If") {
        const trueActions = action.actions as Record<string, Record<string, unknown>> | undefined;
        if (trueActions) {
          result.push(...flattenActions(trueActions, name, "true"));
        }
        const elseBlock = action.else as Record<string, unknown> | undefined;
        if (elseBlock?.actions) {
          result.push(...flattenActions(elseBlock.actions as Record<string, Record<string, unknown>>, name, "false"));
        }
      }

      // Switch — recurse into each case + default
      if (actionType === "Switch") {
        const cases = action.cases as Record<string, Record<string, unknown>> | undefined;
        if (cases) {
          for (const [caseName, caseBlock] of Object.entries(cases)) {
            if (caseBlock.actions) {
              result.push(...flattenActions(caseBlock.actions as Record<string, Record<string, unknown>>, name, `case:${caseName}`));
            }
          }
        }
        const defaultBlock = action.default as Record<string, unknown> | undefined;
        if (defaultBlock?.actions) {
          result.push(...flattenActions(defaultBlock.actions as Record<string, Record<string, unknown>>, name, "default"));
        }
      }

      // Scope / Foreach — recurse into nested actions
      if (actionType === "Scope" || actionType === "Foreach") {
        const nestedActions = action.actions as Record<string, Record<string, unknown>> | undefined;
        if (nestedActions) {
          result.push(...flattenActions(nestedActions, name, null));
        }
      }
    }
    return result;
  }

  const allActions = flattenActions(actions, null, null);

  // Build the set of all action names for edge validation
  const allActionNames = new Set(allActions.map(a => a.name));

  // Create nodes
  allActions.forEach((item, index) => {
    const { name, action, parentId, branchLabel } = item;
    const actionType = (action.type as string) || "Unknown";
    const isEnd = actionType === "Terminate";
    const isError = actionType === "Terminate" && (action.inputs as Record<string, unknown>)?.runStatus === "Failed";

    nodes.push({
      id: name,
      type: "workflowNode",
      position: { x: X_CENTER, y: (index + 1) * Y_SPACING },
      data: {
        label: name.replace(/_/g, " "),
        type: actionType,
        platform: "azure",
        isEnd,
        isError,
        isBranch: actionType === "If" || actionType === "Switch" || actionType === "Scope",
        resource: getAzureResource(action),
        needsManualConfig: stepNeedsManualConfig(action),
      },
    });

    // Edges from runAfter (only if the dependency exists in our flattened set)
    const runAfter = action.runAfter as Record<string, string[]> | undefined;
    let hasExplicitDep = false;

    if (runAfter) {
      const deps = Object.keys(runAfter);
      for (const dep of deps) {
        if (allActionNames.has(dep)) {
          hasExplicitDep = true;
          const statuses = runAfter[dep];
          const hasFailure = statuses.some(s => s === "Failed" || s === "TimedOut");
          edges.push({
            id: `${dep}->${name}`,
            source: dep,
            target: name,
            type: "smoothstep",
            style: {
              stroke: hasFailure ? "#f87171" : "#94a3b8",
              strokeWidth: 1.5,
              strokeDasharray: hasFailure ? "3 3" : undefined,
            },
            label: hasFailure ? "on failure" : undefined,
            labelStyle: { fontSize: 9, fill: "#dc2626" },
            data: { isError: hasFailure },
          });
        }
      }
      // Empty runAfter = root action (depends on trigger)
      if (deps.length === 0 && !parentId && triggerName) {
        hasExplicitDep = true;
        edges.push({
          id: `${triggerName}->${name}`,
          source: triggerName,
          target: name,
          type: "smoothstep",
          animated: true,
          style: { stroke: "#94a3b8", strokeWidth: 1.5 },
        });
      }
    }

    // If no explicit dependency, connect from parent (for nested actions)
    if (!hasExplicitDep && parentId) {
      const edgeLabel = branchLabel
        ? branchLabel === "true" ? "yes"
        : branchLabel === "false" ? "no"
        : branchLabel.startsWith("case:") ? branchLabel.replace("case:", "")
        : branchLabel
        : undefined;
      edges.push({
        id: `${parentId}->${name}`,
        source: parentId,
        target: name,
        type: "smoothstep",
        label: edgeLabel,
        labelStyle: { fontSize: 9, fill: "#6366f1" },
        style: {
          stroke: branchLabel === "false" ? "#f87171" : branchLabel ? "#6366f1" : "#94a3b8",
          strokeWidth: 1.5,
          strokeDasharray: branchLabel ? "4 2" : undefined,
        },
        data: { isBranch: !!branchLabel },
      });
    }

    // Root action with no runAfter and no parent → connect from trigger
    if (!hasExplicitDep && !parentId && triggerName && !runAfter) {
      edges.push({
        id: `${triggerName}->${name}`,
        source: triggerName,
        target: name,
        type: "smoothstep",
        animated: true,
        style: { stroke: "#94a3b8", strokeWidth: 1.5 },
      });
    }
  });

  return { nodes, edges };
}

// ─── Helpers ─────────────────────────────────────────────────────

function topologicalSortActions(
  actions: Record<string, Record<string, unknown>>
): string[] {
  const result: string[] = [];
  const visited = new Set<string>();
  const names = Object.keys(actions);

  function visit(name: string) {
    if (visited.has(name) || !actions[name]) return;
    visited.add(name);

    // Visit dependents (actions that have this in their runAfter)
    for (const other of names) {
      const runAfter = actions[other].runAfter as Record<string, unknown> | undefined;
      if (runAfter && name in runAfter) {
        visit(other);
      }
    }

    result.unshift(name);
  }

  // Start from actions with empty runAfter (roots)
  const roots = names.filter(n => {
    const ra = actions[n].runAfter as Record<string, unknown> | undefined;
    return !ra || Object.keys(ra).length === 0;
  });

  for (const root of roots) visit(root);
  for (const name of names) visit(name);

  return result;
}

function getChoiceLabel(choice: Record<string, unknown>): string {
  if (choice.StringEquals !== undefined) return `= "${choice.StringEquals}"`;
  if (choice.NumericGreaterThan !== undefined) return `> ${choice.NumericGreaterThan}`;
  if (choice.NumericLessThan !== undefined) return `< ${choice.NumericLessThan}`;
  if (choice.NumericEquals !== undefined) return `= ${choice.NumericEquals}`;
  if (choice.BooleanEquals !== undefined) return `= ${choice.BooleanEquals}`;
  if (choice.StringMatches !== undefined) return `~ "${choice.StringMatches}"`;
  return "condition";
}

function getAzureResource(action: Record<string, unknown>): string | undefined {
  const inputs = action.inputs as Record<string, unknown> | undefined;
  if (!inputs) return undefined;

  const actionType = action.type as string;

  if (actionType === "Function") {
    const fn = inputs.function as Record<string, unknown> | undefined;
    if (fn?.id) {
      const idStr = fn.id as string;
      // Handle @concat(...) expressions — extract function name from '/functions/xxx'
      const funcMatch = idStr.match(/\/functions\/([^'")]+)/);
      if (funcMatch) {
        return `ƒ ${funcMatch[1].replace(/[')]/g, "")}`;
      }
      // Fallback: simple path split
      const parts = idStr.split("/");
      return `ƒ ${parts[parts.length - 1]}`;
    }
  }

  if (actionType === "Http") {
    const method = inputs.method as string | undefined;
    const uri = inputs.uri as string | undefined;
    if (uri) {
      // Handle @concat(...) expressions in URIs
      if (uri.includes("DataFactory")) return `${method || "POST"} ADF`;
      if (uri.includes("management.azure.com")) return `${method || "GET"} ARM`;
      try {
        // Replace Azure Logic Apps expressions before URL parsing
        const cleanUri = uri.replace(/@\{[^}]+\}/g, "x").replace(/@concat\([^)]*\)/g, "https://x.com");
        const host = new URL(cleanUri).hostname.split(".")[0];
        return `${method || "GET"} ${host}`;
      } catch {
        return method || "HTTP";
      }
    }
  }

  if (actionType === "ApiConnection") {
    const host = inputs.host as Record<string, unknown> | undefined;
    if (host?.connection) {
      const conn = (host.connection as Record<string, unknown>).name as string | undefined;
      if (conn) {
        const match = conn.match(/\['(\w+)'\]/);
        return match ? match[1] : "API";
      }
    }
  }

  return undefined;
}

// ─── Apply Comparison Status to Nodes ────────────────────────────

export function applyComparisonStatus(
  graph: ParsedGraph,
  mappings: Array<{
    sourceStep: string;
    targetStep: string | null;
    status: "green" | "amber" | "red";
    needsManualConfig: boolean;
  }>,
  side: "source" | "target"
): ParsedGraph {
  const statusMap = new Map<string, { status: "green" | "amber" | "red"; needsManualConfig: boolean }>();

  for (const m of mappings) {
    const key = side === "source" ? m.sourceStep : m.targetStep;
    if (key) {
      // Normalize for matching: replace spaces with underscores
      statusMap.set(key, { status: m.status, needsManualConfig: m.needsManualConfig });
      statusMap.set(key.replace(/ /g, "_"), { status: m.status, needsManualConfig: m.needsManualConfig });
      statusMap.set(key.replace(/_/g, " "), { status: m.status, needsManualConfig: m.needsManualConfig });
    }
  }

  const updatedNodes = graph.nodes.map(node => {
    const match = statusMap.get(node.id) || statusMap.get(node.data.label);
    if (match) {
      return {
        ...node,
        data: {
          ...node.data,
          status: match.status,
          needsManualConfig: match.needsManualConfig,
        },
      };
    }
    return node;
  });

  return { nodes: updatedNodes, edges: graph.edges };
}
