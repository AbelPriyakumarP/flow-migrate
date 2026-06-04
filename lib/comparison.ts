/**
 * Behavioral Comparison Engine
 *
 * Rules-based step-by-step comparison between source and migrated workflow.
 * Not a text diff — a behavioral diff that flags logic gaps before deployment.
 */

export type StepStatus = "green" | "amber" | "red";

export interface StepMapping {
  sourceStep: string;
  sourceType: string;
  targetStep: string | null;
  targetType: string | null;
  status: StepStatus;
  ruleResults: RuleResult[];
  needsManualConfig: boolean;
}

export interface RuleResult {
  rule: string;
  status: StepStatus;
  message: string;
}

export interface ComparisonResult {
  mappings: StepMapping[];
  summary: { green: number; amber: number; red: number };
  overallStatus: StepStatus;
}

// ─── AWS → Azure Comparison Rules ─────────────────────────────────

function checkBranchingLogic(
  stateName: string,
  state: Record<string, unknown>,
  targetActions: Record<string, Record<string, unknown>>,
  matchedAction: Record<string, unknown> | null,
  matchedName: string | null
): RuleResult {
  if (state.Type !== "Choice") {
    return { rule: "Branching Logic", status: "green", message: "No branching — pass-through" };
  }

  if (!matchedAction) {
    return { rule: "Branching Logic", status: "red", message: "Choice state has no corresponding action in output" };
  }

  const actionType = matchedAction.type as string;
  const choices = state.Choices as Record<string, unknown>[] | undefined;
  const choiceCount = choices?.length || 0;

  // Check if all choices use StringEquals on the same variable → should be Switch
  if (choices && choiceCount >= 2) {
    const variables = choices.map(c => c.Variable as string).filter(Boolean);
    const allSameVar = variables.every(v => v === variables[0]);
    const allStringEquals = choices.every(c => "StringEquals" in c);

    if (allSameVar && allStringEquals) {
      if (actionType === "Switch") {
        const cases = matchedAction.cases as Record<string, unknown> | undefined;
        const caseCount = cases ? Object.keys(cases).length : 0;
        if (caseCount === choiceCount) {
          return { rule: "Branching Logic", status: "green", message: `Switch with ${caseCount} cases — exact branch mapping` };
        }
        return { rule: "Branching Logic", status: "amber", message: `Switch has ${caseCount} cases but source has ${choiceCount} choices — verify branch coverage` };
      }
      return { rule: "Branching Logic", status: "red", message: `Choice with ${choiceCount} StringEquals on same variable should be Switch, not ${actionType}` };
    }
  }

  // For If actions — check true/false branches exist
  if (actionType === "If") {
    const hasTrue = matchedAction.actions && typeof matchedAction.actions === "object";
    const hasElse = matchedAction.else && typeof (matchedAction.else as Record<string, unknown>).actions === "object";
    const hasDefault = !!state.Default;

    if (hasTrue && hasDefault && !hasElse) {
      return { rule: "Branching Logic", status: "red", message: "Source has Default branch but If has no else block — false path is missing" };
    }
    if (hasTrue && hasElse) {
      return { rule: "Branching Logic", status: "green", message: "If/else branches map to Choice branches correctly" };
    }
    return { rule: "Branching Logic", status: "amber", message: "If action present — verify branch evaluation order matches source" };
  }

  if (actionType === "Switch") {
    return { rule: "Branching Logic", status: "green", message: `Switch action maps Choice routing correctly` };
  }

  return { rule: "Branching Logic", status: "red", message: `Choice mapped to "${actionType}" — expected If or Switch` };
}

function checkRetryPolicy(
  stateName: string,
  state: Record<string, unknown>,
  matchedAction: Record<string, unknown> | null
): RuleResult {
  const retries = state.Retry as Record<string, unknown>[] | undefined;
  if (!retries || retries.length === 0) {
    return { rule: "Retry Policy", status: "green", message: "No retry config — nothing to map" };
  }

  if (!matchedAction) {
    return { rule: "Retry Policy", status: "red", message: "Source has Retry but no target action found" };
  }

  const retryPolicy = matchedAction.retryPolicy as Record<string, unknown> | undefined;
  if (!retryPolicy) {
    return { rule: "Retry Policy", status: "red", message: "Source has Retry config but target action has no retryPolicy" };
  }

  const sourceRetry = retries[0];
  const sourceBackoff = (sourceRetry.BackoffRate as number) || 1.0;
  const sourceMaxAttempts = (sourceRetry.MaxAttempts as number) || 3;
  const sourceInterval = (sourceRetry.IntervalSeconds as number) || 1;

  const targetType = retryPolicy.type as string;
  const targetCount = retryPolicy.count as number;
  const targetInterval = retryPolicy.interval as string;

  // Check backoff → type mapping
  if (sourceBackoff > 1.0 && targetType !== "Exponential") {
    return { rule: "Retry Policy", status: "red", message: `BackoffRate ${sourceBackoff} requires Exponential retry, got "${targetType}"` };
  }
  if (sourceBackoff <= 1.0 && targetType === "Exponential") {
    return { rule: "Retry Policy", status: "amber", message: `BackoffRate ${sourceBackoff} should be Fixed retry, got Exponential — more aggressive than source` };
  }

  // Check attempt count
  if (targetCount !== sourceMaxAttempts) {
    return { rule: "Retry Policy", status: "amber", message: `Retry count ${targetCount} differs from source MaxAttempts ${sourceMaxAttempts}` };
  }

  // Check interval
  const expectedInterval = `PT${sourceInterval}S`;
  if (targetInterval !== expectedInterval) {
    return { rule: "Retry Policy", status: "amber", message: `Retry interval "${targetInterval}" differs from source ${sourceInterval}s` };
  }

  return { rule: "Retry Policy", status: "green", message: `${targetType} retry, ${targetCount} attempts, ${targetInterval} — matches source` };
}

function checkErrorHandling(
  stateName: string,
  state: Record<string, unknown>,
  targetActions: Record<string, Record<string, unknown>>,
  matchedName: string | null
): RuleResult {
  const catches = state.Catch as Record<string, unknown>[] | undefined;
  if (!catches || catches.length === 0) {
    return { rule: "Error Handling", status: "green", message: "No Catch blocks — nothing to map" };
  }

  if (!matchedName) {
    return { rule: "Error Handling", status: "red", message: "Source has Catch blocks but no target action found" };
  }

  // Look for failure runAfter handlers referencing this action
  const failureHandlers: string[] = [];
  const searchActions = (actions: Record<string, Record<string, unknown>>, prefix: string) => {
    for (const [name, action] of Object.entries(actions)) {
      const runAfter = action.runAfter as Record<string, string[]> | undefined;
      if (runAfter) {
        for (const [dep, statuses] of Object.entries(runAfter)) {
          if (dep === matchedName && statuses.some(s => s === "Failed" || s === "TimedOut")) {
            failureHandlers.push(`${prefix}${name}`);
          }
        }
      }
      // Check nested actions too (inside Scope, If, etc.)
      if (action.actions && typeof action.actions === "object") {
        searchActions(action.actions as Record<string, Record<string, unknown>>, `${prefix}${name}.`);
      }
    }
  };
  searchActions(targetActions, "");

  if (failureHandlers.length === 0) {
    return { rule: "Error Handling", status: "red", message: `Source has ${catches.length} Catch block(s) but no failure runAfter handlers found for "${matchedName}"` };
  }

  if (failureHandlers.length < catches.length) {
    return { rule: "Error Handling", status: "amber", message: `${failureHandlers.length} handler(s) found for ${catches.length} Catch block(s) — some error paths may be missing` };
  }

  return { rule: "Error Handling", status: "green", message: `${failureHandlers.length} failure handler(s) map to ${catches.length} Catch block(s)` };
}

function checkParallelism(
  stateName: string,
  state: Record<string, unknown>,
  targetActions: Record<string, Record<string, unknown>>,
  matchedName: string | null
): RuleResult {
  if (state.Type !== "Parallel") {
    return { rule: "Parallelism", status: "green", message: "Not a parallel state" };
  }

  const branches = state.Branches as Record<string, unknown>[] | undefined;
  const branchCount = branches?.length || 0;

  // Look for Scope actions that represent parallel branches
  const scopeActions = Object.entries(targetActions).filter(
    ([, a]) => (a.type as string) === "Scope"
  );

  // Look for actions with same runAfter (implicit parallel)
  const runAfterGroups: Record<string, string[]> = {};
  for (const [name, action] of Object.entries(targetActions)) {
    const ra = action.runAfter as Record<string, string[]> | undefined;
    if (ra) {
      const key = JSON.stringify(ra);
      if (!runAfterGroups[key]) runAfterGroups[key] = [];
      runAfterGroups[key].push(name);
    }
  }
  const parallelGroups = Object.values(runAfterGroups).filter(g => g.length >= 2);

  if (scopeActions.length >= branchCount) {
    // Check for Catch blocks requiring Scope wrapping
    const hasCatch = !!state.Catch || branches?.some(b => {
      const states = b.States as Record<string, Record<string, unknown>> | undefined;
      return states && Object.values(states).some(s => s.Catch);
    });

    if (hasCatch) {
      return { rule: "Parallelism", status: "green", message: `${scopeActions.length} Scope actions wrap ${branchCount} parallel branches with error handling` };
    }
    return { rule: "Parallelism", status: "green", message: `${scopeActions.length} Scope actions map ${branchCount} parallel branches` };
  }

  if (parallelGroups.length > 0) {
    const maxParallel = Math.max(...parallelGroups.map(g => g.length));
    if (maxParallel >= branchCount) {
      return { rule: "Parallelism", status: "green", message: `${maxParallel} actions share same runAfter — implicit parallelism matches ${branchCount} branches` };
    }
    return { rule: "Parallelism", status: "amber", message: `Found ${maxParallel} parallel actions but source has ${branchCount} branches — partial parallel mapping` };
  }

  return { rule: "Parallelism", status: "red", message: `Source has ${branchCount} parallel branches but no parallel pattern found in output` };
}

function checkDataTransformation(
  stateName: string,
  state: Record<string, unknown>,
  targetActions: Record<string, Record<string, unknown>>,
  matchedAction: Record<string, unknown> | null,
  matchedName: string | null,
  outputJson: Record<string, unknown>
): RuleResult {
  if (state.Type !== "Map") {
    return { rule: "Data Flow", status: "green", message: "Not a data transformation step" };
  }

  if (!matchedAction) {
    return { rule: "Data Flow", status: "red", message: "Map state has no corresponding action in output" };
  }

  const actionType = matchedAction.type as string;
  const outputStr = JSON.stringify(outputJson);

  if (actionType === "Select") {
    return { rule: "Data Flow", status: "green", message: "Map → Select — atomic array transformation, no race condition" };
  }

  if (actionType === "Foreach") {
    const hasAppend = outputStr.includes("AppendToArrayVariable");
    if (hasAppend) {
      return { rule: "Data Flow", status: "red", message: "Map → Foreach + AppendToArrayVariable — RACE CONDITION under parallel execution. Use Select instead" };
    }
    return { rule: "Data Flow", status: "amber", message: "Map → Foreach — works for side effects, but verify concurrency settings if transforming data" };
  }

  return { rule: "Data Flow", status: "amber", message: `Map state mapped to "${actionType}" — verify data transformation is preserved` };
}

// ─── Step Matching ─────────────────────────────────────────────────

function normalizeStepName(name: string): string {
  return name
    .replace(/[\s_-]+/g, "")
    .toLowerCase();
}

// Expected type mappings for AWS → Azure
const TYPE_MAP: Record<string, string[]> = {
  Task: ["Function", "Http", "ApiConnection"],
  Choice: ["If", "Switch"],
  Parallel: ["Scope"],
  Map: ["Select", "Foreach"],
  Pass: ["Compose"],
  Wait: ["Wait"],
  Succeed: ["Terminate"],
  Fail: ["Terminate"],
};

function findMatchingAction(
  stateName: string,
  stateType: string,
  targetActions: Record<string, Record<string, unknown>>
): { name: string; action: Record<string, unknown> } | null {
  const normalizedSource = normalizeStepName(stateName);

  // 1. Direct name match (normalized)
  for (const [name, action] of Object.entries(targetActions)) {
    if (normalizeStepName(name) === normalizedSource) {
      return { name, action };
    }
  }

  // 2. Partial name match — source name contained in target or vice versa
  for (const [name, action] of Object.entries(targetActions)) {
    const normalizedTarget = normalizeStepName(name);
    if (normalizedTarget.includes(normalizedSource) || normalizedSource.includes(normalizedTarget)) {
      return { name, action };
    }
  }

  // 3. Word-overlap match — split into words, match by significant word overlap
  const sourceWords = stateName.toLowerCase().split(/[\s_-]+/).filter(w => w.length > 2);
  if (sourceWords.length > 0) {
    let bestMatch: { name: string; action: Record<string, unknown>; score: number } | null = null;
    for (const [name, action] of Object.entries(targetActions)) {
      const targetWords = name.toLowerCase().split(/[\s_-]+/).filter(w => w.length > 2);
      const overlap = sourceWords.filter(w => targetWords.some(tw => tw.includes(w) || w.includes(tw))).length;
      const score = overlap / Math.max(sourceWords.length, 1);
      if (score > 0.4 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { name, action, score };
      }
    }
    if (bestMatch) return { name: bestMatch.name, action: bestMatch.action };
  }

  // 4. Type-based match — find an action of the expected Azure type
  const expectedTypes = TYPE_MAP[stateType] || [];
  if (expectedTypes.length > 0) {
    // For Fail states, match Terminate with runStatus "Failed" and matching error code
    if (stateType === "Fail") {
      const sourceError = (targetActions as unknown as Record<string, unknown>)?.Error;
      for (const [name, action] of Object.entries(targetActions)) {
        if ((action.type as string) === "Terminate") {
          const inputs = action.inputs as Record<string, unknown> | undefined;
          if (inputs?.runStatus === "Failed") {
            const runError = inputs.runError as Record<string, unknown> | undefined;
            if (runError?.code === sourceError) return { name, action };
          }
        }
      }
      // Fallback: any Failed Terminate
      for (const [name, action] of Object.entries(targetActions)) {
        if ((action.type as string) === "Terminate") {
          const inputs = action.inputs as Record<string, unknown> | undefined;
          if (inputs?.runStatus === "Failed") return { name, action };
        }
      }
    }

    if (stateType === "Succeed") {
      for (const [name, action] of Object.entries(targetActions)) {
        if ((action.type as string) === "Terminate") {
          const inputs = action.inputs as Record<string, unknown> | undefined;
          if (inputs?.runStatus === "Succeeded") return { name, action };
        }
      }
    }
  }

  return null;
}

function getAllActions(
  actions: Record<string, Record<string, unknown>>
): Record<string, Record<string, unknown>> {
  const all: Record<string, Record<string, unknown>> = {};
  for (const [name, action] of Object.entries(actions)) {
    all[name] = action;
    // Flatten nested actions from If, Switch, Scope, Foreach
    const nested = action.actions as Record<string, Record<string, unknown>> | undefined;
    if (nested && typeof nested === "object") {
      Object.assign(all, getAllActions(nested));
    }
    const elseBlock = action.else as Record<string, unknown> | undefined;
    if (elseBlock?.actions && typeof elseBlock.actions === "object") {
      Object.assign(all, getAllActions(elseBlock.actions as Record<string, Record<string, unknown>>));
    }
    const cases = action.cases as Record<string, Record<string, unknown>> | undefined;
    if (cases) {
      for (const caseBlock of Object.values(cases)) {
        if (caseBlock.actions && typeof caseBlock.actions === "object") {
          Object.assign(all, getAllActions(caseBlock.actions as Record<string, Record<string, unknown>>));
        }
      }
    }
    const defaultBlock = action.default as Record<string, unknown> | undefined;
    if (defaultBlock?.actions && typeof defaultBlock.actions === "object") {
      Object.assign(all, getAllActions(defaultBlock.actions as Record<string, Record<string, unknown>>));
    }
  }
  return all;
}

// ─── Main Comparison Function ──────────────────────────────────────

export function compareWorkflows(
  sourceJson: Record<string, unknown>,
  outputJson: Record<string, unknown>,
  direction: "aws-to-azure" | "azure-to-aws"
): ComparisonResult {
  if (direction === "aws-to-azure") {
    return compareAwsToAzure(sourceJson, outputJson);
  }
  return compareAzureToAws(sourceJson, outputJson);
}

function compareAwsToAzure(
  source: Record<string, unknown>,
  output: Record<string, unknown>
): ComparisonResult {
  const states = source.States as Record<string, Record<string, unknown>> | undefined;
  if (!states) return { mappings: [], summary: { green: 0, amber: 0, red: 0 }, overallStatus: "red" };

  // Handle both flat { actions } and nested { definition: { actions } }
  const outputDef = (output.definition as Record<string, unknown>) || output;
  const targetActions = (outputDef.actions as Record<string, Record<string, unknown>>) || (output.actions as Record<string, Record<string, unknown>>) || {};
  const allTargetActions = getAllActions(targetActions);

  const mappings: StepMapping[] = [];

  for (const [stateName, state] of Object.entries(states)) {
    const stateType = state.Type as string;
    const match = findMatchingAction(stateName, stateType, allTargetActions);
    const matchedAction = match?.action || null;
    const matchedName = match?.name || null;

    // Always start with a step mapping rule
    const applicableRules: RuleResult[] = [];

    if (matchedAction) {
      const targetType = matchedAction.type as string;
      const expectedTypes = TYPE_MAP[stateType] || [];
      const isExpectedType = expectedTypes.length === 0 || expectedTypes.includes(targetType);

      applicableRules.push({
        rule: "Step Mapping",
        status: isExpectedType ? "green" : "amber",
        message: isExpectedType
          ? `${stateType} → ${targetType}`
          : `${stateType} → ${targetType} (expected ${expectedTypes.join(" or ")})`,
      });

      // Service-level mapping check for Task states
      if (stateType === "Task" && state.Resource) {
        const resource = state.Resource as string;
        let expectedService = "";
        let expectedAzureType = "";

        if (resource.includes("lambda")) { expectedService = "Lambda"; expectedAzureType = "Function"; }
        else if (resource.includes("dynamodb")) { expectedService = "DynamoDB"; expectedAzureType = "Http"; }
        else if (resource.includes("sqs")) { expectedService = "SQS"; expectedAzureType = "ApiConnection"; }
        else if (resource.includes("sns")) { expectedService = "SNS"; expectedAzureType = "ApiConnection"; }
        else if (resource.includes("events")) { expectedService = "EventBridge"; expectedAzureType = "ApiConnection"; }
        else if (resource.includes("s3")) { expectedService = "S3"; expectedAzureType = "Http"; }

        if (expectedAzureType) {
          if (targetType === expectedAzureType) {
            applicableRules.push({
              rule: "Service Mapping",
              status: "green",
              message: `AWS ${expectedService} → Azure ${targetType} — correct service equivalent`,
            });
          } else {
            applicableRules.push({
              rule: "Service Mapping",
              status: "amber",
              message: `AWS ${expectedService} expected → ${expectedAzureType}, got ${targetType} — verify service compatibility`,
            });
          }
        }
      }
    } else {
      applicableRules.push({
        rule: "Step Mapping",
        status: "amber",
        message: `No direct action match found — may be inlined into a parent action`,
      });
    }

    const ruleResults: RuleResult[] = [
      checkBranchingLogic(stateName, state, allTargetActions, matchedAction, matchedName),
      checkRetryPolicy(stateName, state, matchedAction),
      checkErrorHandling(stateName, state, targetActions, matchedName),
      checkParallelism(stateName, state, targetActions, matchedName),
      checkDataTransformation(stateName, state, targetActions, matchedAction, matchedName, output),
    ];

    // Add rules that are actually applicable (not "N/A" generic messages)
    const naPatterns = ["No retry", "No Catch", "No branching", "Not a parallel", "Not a data"];
    for (const r of ruleResults) {
      const isNA = r.status === "green" && naPatterns.some(p => r.message.includes(p));
      if (!isNA) {
        applicableRules.push(r);
      }
    }

    // Check for TODO markers in the target action's OWN inputs only (not nested children)
    if (matchedAction) {
      // Build a shallow copy — only this action's direct properties, not nested actions/cases/else
      const shallowAction: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(matchedAction)) {
        if (key !== "actions" && key !== "else" && key !== "cases" && key !== "default") {
          shallowAction[key] = val;
        }
      }
      const actionStr = JSON.stringify(shallowAction);
      const todoMatches = actionStr.match(/TODO[^"']*/g);
      if (todoMatches && todoMatches.length > 0) {
        const todoMessages = [...new Set(todoMatches.map(t => t.replace(/TODO:?\s*/, "").trim()).filter(Boolean))];
        const todoSummary = todoMessages.length > 0
          ? todoMessages.map(m => `"${m}"`).join(", ")
          : `${todoMatches.length} placeholder(s)`;
        applicableRules.push({
          rule: "Manual Config",
          status: "amber",
          message: `Requires manual configuration: ${todoSummary}`,
        });
      }
    }

    const worstStatus = applicableRules.some(r => r.status === "red")
      ? "red"
      : applicableRules.some(r => r.status === "amber")
        ? "amber"
        : "green";

    const needsManualConfig = applicableRules.some(r => r.rule === "Manual Config");

    mappings.push({
      sourceStep: stateName,
      sourceType: stateType,
      targetStep: matchedName,
      targetType: matchedAction ? (matchedAction.type as string) : null,
      status: worstStatus,
      ruleResults: applicableRules,
      needsManualConfig,
    });
  }

  const summary = {
    green: mappings.filter(m => m.status === "green").length,
    amber: mappings.filter(m => m.status === "amber").length,
    red: mappings.filter(m => m.status === "red").length,
  };

  const overallStatus: StepStatus = summary.red > 0 ? "red" : summary.amber > 0 ? "amber" : "green";

  return { mappings, summary, overallStatus };
}

function compareAzureToAws(
  source: Record<string, unknown>,
  output: Record<string, unknown>
): ComparisonResult {
  // For Azure → AWS direction, treat actions as source steps and states as target
  // Handle both flat { actions } and nested { definition: { actions } }
  const definition = (source.definition as Record<string, unknown>) || source;
  const topActions = (definition.actions as Record<string, Record<string, unknown>>) || (source.actions as Record<string, Record<string, unknown>>) || {};
  // Flatten nested actions (inside If/Switch/Scope) so all actions are compared
  const sourceActions = getAllActions(topActions);
  const targetStates = (output.States as Record<string, Record<string, unknown>>) || {};

  const mappings: StepMapping[] = [];

  for (const [actionName, action] of Object.entries(sourceActions)) {
    const actionType = action.type as string;
    const normalizedName = normalizeStepName(actionName);

    // Find matching state
    let matchedState: Record<string, unknown> | null = null;
    let matchedName: string | null = null;

    for (const [sName, sState] of Object.entries(targetStates)) {
      if (normalizeStepName(sName) === normalizedName || normalizeStepName(sName).includes(normalizedName)) {
        matchedState = sState;
        matchedName = sName;
        break;
      }
    }

    const ruleResults: RuleResult[] = [];

    if (matchedState) {
      const sType = matchedState.Type as string;

      // Check terminal mapping
      if (!matchedState.Next && !matchedState.End && !["Choice", "Succeed", "Fail"].includes(sType)) {
        ruleResults.push({ rule: "Step Mapping", status: "red", message: `State "${matchedName}" missing Next or End — will fail at runtime` });
      } else {
        ruleResults.push({ rule: "Step Mapping", status: "green", message: `${actionType} → ${sType}` });
      }
    } else {
      ruleResults.push({ rule: "Step Mapping", status: "amber", message: "No direct state match — may be inlined" });
    }

    const worstStatus = ruleResults.some(r => r.status === "red")
      ? "red"
      : ruleResults.some(r => r.status === "amber")
        ? "amber"
        : "green";

    mappings.push({
      sourceStep: actionName,
      sourceType: actionType,
      targetStep: matchedName,
      targetType: matchedState ? (matchedState.Type as string) : null,
      status: worstStatus,
      ruleResults,
      needsManualConfig: false,
    });
  }

  const summary = {
    green: mappings.filter(m => m.status === "green").length,
    amber: mappings.filter(m => m.status === "amber").length,
    red: mappings.filter(m => m.status === "red").length,
  };

  const overallStatus: StepStatus = summary.red > 0 ? "red" : summary.amber > 0 ? "amber" : "green";
  return { mappings, summary, overallStatus };
}
