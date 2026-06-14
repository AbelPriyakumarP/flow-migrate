/**
 * asl-post-processor.ts
 *
 * Programmatic post-processing for Azure → AWS Step Functions (ASL) migrations.
 * Runs AFTER the AI generates output to guarantee valid ASL structure,
 * fix common AI errors, and clean up any Azure remnants.
 *
 * Categories:
 *  FIX-1  Top-level structure: ensure StartAt, States, Comment
 *  FIX-2  Remove Azure artifacts ($schema, contentVersion, triggers, parameters)
 *  FIX-3  State terminal enforcement: every non-Choice/Fail/Succeed state needs Next or End
 *  FIX-4  Choice state cleanup: no top-level Next/End, must have Default
 *  FIX-5  Resource ARN validation: replace Azure function IDs with Lambda ARNs
 *  FIX-6  State name consistency: ensure StartAt and all Next/Default refs exist
 *  FIX-7  Remove invalid fields from states
 *  FIX-8  Fix Parallel state branches structure
 */

export interface AslPostProcessResult {
  output: Record<string, unknown>;
  changesApplied: string[];
}

export function applyAslPostProcessing(
  aiOutput: Record<string, unknown>,
  sourceJson: Record<string, unknown>
): AslPostProcessResult {
  const changes: string[] = [];
  // Deep clone to avoid mutations on the original
  let output = JSON.parse(JSON.stringify(aiOutput)) as Record<string, unknown>;

  // ── FIX-1: Top-level structure ──────────────────────────────────────────
  // If AI returned Azure format wrapped in definition, unwrap it
  if (output.definition && typeof output.definition === "object") {
    const def = output.definition as Record<string, unknown>;
    if (def.States || def.StartAt) {
      output = def;
      changes.push("FIX-1: Unwrapped nested 'definition' object");
    }
  }

  // If the output has Azure schema, triggers, actions but NO States — AI returned wrong format
  if (
    (output.$schema && String(output.$schema).includes("Microsoft.Logic")) ||
    (output.triggers && !output.States) ||
    (output.contentVersion && !output.States)
  ) {
    changes.push("FIX-1: ⚠ AI returned Azure Logic Apps format instead of ASL — attempting conversion");
    output = convertAzureToAslFallback(output, changes);
  }

  // Ensure required top-level fields
  if (!output.StartAt && output.States && typeof output.States === "object") {
    const stateNames = Object.keys(output.States as Record<string, unknown>);
    if (stateNames.length > 0) {
      output.StartAt = stateNames[0];
      changes.push(`FIX-1: Added missing StartAt → "${stateNames[0]}"`);
    }
  }

  if (!output.Comment) {
    output.Comment = "Migrated from Azure Logic Apps";
    changes.push("FIX-1: Added Comment field");
  }

  if (!output.States || typeof output.States !== "object") {
    output.States = {};
    changes.push("FIX-1: ⚠ Created empty States object — migration may need manual review");
  }

  // ── FIX-2: Remove Azure artifacts ───────────────────────────────────────
  const azureFields = ["$schema", "contentVersion", "triggers", "parameters", "outputs",
    "kind", "metadata", "runtimeConfiguration", "type"];
  for (const field of azureFields) {
    if (output[field] !== undefined) {
      delete output[field];
      changes.push(`FIX-2: Removed Azure artifact field "${field}"`);
    }
  }

  // ── FIX-3 to FIX-8: Process each state ──────────────────────────────────
  const states = output.States as Record<string, Record<string, unknown>>;
  const stateNames = new Set(Object.keys(states));

  for (const [name, state] of Object.entries(states)) {
    // FIX-3: State terminal enforcement
    const stateType = state.Type as string;
    const needsTerminal = ["Task", "Pass", "Wait", "Parallel", "Map"];
    if (needsTerminal.includes(stateType) && !state.Next && !state.End) {
      // Find the next state in order, or set End: true
      const stateList = Object.keys(states);
      const idx = stateList.indexOf(name);
      if (idx < stateList.length - 1) {
        state.Next = stateList[idx + 1];
        changes.push(`FIX-3: Added "Next": "${stateList[idx + 1]}" to state "${name}"`);
      } else {
        state.End = true;
        changes.push(`FIX-3: Added "End": true to terminal state "${name}"`);
      }
    }

    // FIX-4: Choice state cleanup
    if (stateType === "Choice") {
      if (state.Next) { delete state.Next; changes.push(`FIX-4: Removed invalid "Next" from Choice state "${name}"`); }
      if (state.End) { delete state.End; changes.push(`FIX-4: Removed invalid "End" from Choice state "${name}"`); }
      if (!state.Default && state.Choices && Array.isArray(state.Choices)) {
        // Find a reasonable default — the next state after this Choice, or a Fail state
        const stateList = Object.keys(states);
        const idx = stateList.indexOf(name);
        const failState = stateList.find(s => (states[s] as Record<string, unknown>).Type === "Fail");
        if (failState) {
          state.Default = failState;
        } else if (idx < stateList.length - 1) {
          state.Default = stateList[idx + 1];
        }
        if (state.Default) {
          changes.push(`FIX-4: Added "Default": "${state.Default}" to Choice state "${name}"`);
        }
      }
    }

    // FIX-5: Resource ARN validation
    if (stateType === "Task" && state.Resource) {
      const resource = String(state.Resource);
      // Replace Azure function IDs with Lambda ARN placeholders
      if (resource.includes("Microsoft.Web") || resource.includes("/subscriptions/")) {
        const funcName = resource.split("/").pop() || "myFunction";
        state.Resource = `arn:aws:lambda:us-east-1:ACCOUNT_ID:function:${funcName}`;
        changes.push(`FIX-5: Replaced Azure function ID with Lambda ARN in "${name}"`);
      }
      // Fix Cosmos DB references
      if (resource.includes("documents.azure.com") || resource.includes("cosmosdb")) {
        state.Resource = "arn:aws:states:::dynamodb:getItem";
        changes.push(`FIX-5: Replaced Cosmos DB reference with DynamoDB in "${name}"`);
      }
      // Fix Service Bus references
      if (resource.includes("servicebus") || resource.includes("Service Bus")) {
        state.Resource = "arn:aws:states:::sqs:sendMessage";
        changes.push(`FIX-5: Replaced Service Bus with SQS in "${name}"`);
      }
    }

    // FIX-7: Remove invalid Azure fields from states
    const invalidStateFields = ["runAfter", "kind", "metadata", "runtimeConfiguration",
      "operationOptions", "trackedProperties", "expression", "inputs", "else",
      "cases", "foreach", "correlation", "limit"];
    for (const field of invalidStateFields) {
      if (state[field] !== undefined) {
        // Don't remove "expression" from Pass states using it as InputPath equivalent
        if (field === "inputs" && stateType === "Pass" && !state.Result) {
          state.Result = state[field];
          delete state[field];
          changes.push(`FIX-7: Converted "inputs" to "Result" in Pass state "${name}"`);
          continue;
        }
        delete state[field];
        changes.push(`FIX-7: Removed invalid field "${field}" from state "${name}"`);
      }
    }

    // FIX-7b: Validate Retry block structure
    if (state.Retry && Array.isArray(state.Retry)) {
      for (let i = 0; i < state.Retry.length; i++) {
        const retry = state.Retry[i] as Record<string, unknown>;
        if (!retry.ErrorEquals || !Array.isArray(retry.ErrorEquals)) {
          retry.ErrorEquals = ["States.ALL"];
          changes.push(`FIX-7b: Added missing ErrorEquals to Retry[${i}] in "${name}"`);
        }
        if (retry.MaxAttempts === undefined) {
          retry.MaxAttempts = 3;
        }
        if (retry.IntervalSeconds === undefined) {
          retry.IntervalSeconds = 2;
        }
        if (retry.BackoffRate === undefined) {
          retry.BackoffRate = 2.0;
        }
      }
    }

    // FIX-7c: Validate Catch block structure
    if (state.Catch && Array.isArray(state.Catch)) {
      for (let i = 0; i < state.Catch.length; i++) {
        const catcher = state.Catch[i] as Record<string, unknown>;
        if (!catcher.ErrorEquals || !Array.isArray(catcher.ErrorEquals)) {
          catcher.ErrorEquals = ["States.ALL"];
          changes.push(`FIX-7c: Added missing ErrorEquals to Catch[${i}] in "${name}"`);
        }
        if (!catcher.Next) {
          const failState = Object.keys(states).find(s => (states[s] as Record<string, unknown>).Type === "Fail");
          if (failState) {
            catcher.Next = failState;
            changes.push(`FIX-7c: Added missing Next to Catch[${i}] in "${name}" → "${failState}"`);
          }
        }
      }
    }

    // FIX-7d: Fix Map state structure
    if (stateType === "Map") {
      if (!state.ItemProcessor && !state.Iterator) {
        if (state.Branches && Array.isArray(state.Branches)) {
          // Sometimes AI confuses Map with Parallel — convert Branches to ItemProcessor
          const firstBranch = (state.Branches as Record<string, unknown>[])[0];
          if (firstBranch) {
            state.ItemProcessor = firstBranch;
            delete state.Branches;
            changes.push(`FIX-7d: Converted Parallel-style Branches to ItemProcessor in Map state "${name}"`);
          }
        }
      }
      // Ensure ItemsPath exists for Map
      if (!state.ItemsPath) {
        state.ItemsPath = "$.items";
        changes.push(`FIX-7d: Added default ItemsPath to Map state "${name}"`);
      }
    }

    // FIX-8: Fix Parallel state branches
    if (stateType === "Parallel" && state.Branches && Array.isArray(state.Branches)) {
      for (let i = 0; i < state.Branches.length; i++) {
        const branch = state.Branches[i] as Record<string, unknown>;
        if (!branch.StartAt && branch.States && typeof branch.States === "object") {
          const branchStates = Object.keys(branch.States as Record<string, unknown>);
          if (branchStates.length > 0) {
            branch.StartAt = branchStates[0];
            changes.push(`FIX-8: Added StartAt to Parallel branch ${i} in "${name}"`);
          }
        }
      }
    }
  }

  // ── FIX-6: State reference consistency ──────────────────────────────────
  // Verify StartAt references an existing state
  if (output.StartAt && !stateNames.has(output.StartAt as string)) {
    const firstState = Object.keys(states)[0];
    if (firstState) {
      changes.push(`FIX-6: StartAt "${output.StartAt}" doesn't exist, corrected to "${firstState}"`);
      output.StartAt = firstState;
    }
  }

  // Verify all Next/Default references point to existing states
  for (const [name, state] of Object.entries(states)) {
    if (state.Next && !stateNames.has(state.Next as string)) {
      changes.push(`FIX-6: ⚠ State "${name}" has Next="${state.Next}" which doesn't exist`);
    }
    if (state.Default && !stateNames.has(state.Default as string)) {
      changes.push(`FIX-6: ⚠ State "${name}" has Default="${state.Default}" which doesn't exist`);
    }
    // Check Choice state Choices
    if (state.Type === "Choice" && state.Choices && Array.isArray(state.Choices)) {
      for (const choice of state.Choices) {
        const c = choice as Record<string, unknown>;
        if (c.Next && !stateNames.has(c.Next as string)) {
          changes.push(`FIX-6: ⚠ Choice in "${name}" has Next="${c.Next}" which doesn't exist`);
        }
      }
    }
    // Check Catch blocks
    if (state.Catch && Array.isArray(state.Catch)) {
      for (const catcher of state.Catch) {
        const c = catcher as Record<string, unknown>;
        if (c.Next && !stateNames.has(c.Next as string)) {
          changes.push(`FIX-6: ⚠ Catch in "${name}" has Next="${c.Next}" which doesn't exist`);
        }
      }
    }
  }

  // ── FIX-9: Remove hallucinated Catch/Fail pairs ─────────────────────────
  // If the source Azure workflow has no failure handlers (runAfter with "Failed"),
  // but the AI invented Catch blocks pointing to new Fail states, remove them.
  const sourceActions = (sourceJson.actions as Record<string, Record<string, unknown>>) || {};
  const sourceHasFailureHandlers = new Set<string>();

  // Scan source for actions that have failure runAfter handlers
  function scanForFailureHandlers(actions: Record<string, Record<string, unknown>>, prefix: string) {
    for (const [name, action] of Object.entries(actions)) {
      const runAfter = action.runAfter as Record<string, string[]> | undefined;
      if (runAfter) {
        for (const [, statuses] of Object.entries(runAfter)) {
          if (statuses && statuses.some((s: string) => s === "Failed" || s === "TimedOut")) {
            sourceHasFailureHandlers.add(`${prefix}${name}`);
          }
        }
      }
      // Recurse into nested actions (If, Scope, Foreach, etc.)
      if (action.actions && typeof action.actions === "object") {
        scanForFailureHandlers(action.actions as Record<string, Record<string, unknown>>, `${prefix}${name}.`);
      }
      const elseBlock = action.else as Record<string, unknown> | undefined;
      if (elseBlock?.actions && typeof elseBlock.actions === "object") {
        scanForFailureHandlers(elseBlock.actions as Record<string, Record<string, unknown>>, `${prefix}${name}.else.`);
      }
    }
  }
  scanForFailureHandlers(sourceActions, "");

  // If source has NO failure handlers at all, strip all Catch blocks and their Fail targets
  if (sourceHasFailureHandlers.size === 0) {
    const failStatesToRemove = new Set<string>();

    for (const [name, state] of Object.entries(states)) {
      if (state.Catch && Array.isArray(state.Catch)) {
        // Collect Fail state targets
        for (const catcher of state.Catch as Record<string, unknown>[]) {
          const target = catcher.Next as string;
          if (target && states[target] && (states[target] as Record<string, unknown>).Type === "Fail") {
            failStatesToRemove.add(target);
          }
        }
        delete state.Catch;
        changes.push(`FIX-9: Removed hallucinated Catch from "${name}" (source has no error handlers)`);
      }
    }

    // Remove the orphaned Fail states
    for (const failName of failStatesToRemove) {
      // Only remove if no other state references it (besides the Catch we just removed)
      const stillReferenced = Object.values(states).some(s => {
        const st = s as Record<string, unknown>;
        if (st.Next === failName || st.Default === failName) return true;
        if (Array.isArray(st.Choices)) {
          return (st.Choices as Record<string, unknown>[]).some(c => c.Next === failName);
        }
        return false;
      });

      if (!stillReferenced) {
        delete states[failName];
        changes.push(`FIX-9: Removed hallucinated Fail state "${failName}"`);
      }
    }

    // Also clean up Fail states inside Parallel branches
    if (sourceHasFailureHandlers.size === 0) {
      for (const [name, state] of Object.entries(states)) {
        if (state.Type === "Parallel" && Array.isArray(state.Branches)) {
          for (const branch of state.Branches as Record<string, unknown>[]) {
            const branchStates = branch.States as Record<string, Record<string, unknown>> | undefined;
            if (!branchStates) continue;
            const branchFailsToRemove = new Set<string>();

            for (const [bName, bState] of Object.entries(branchStates)) {
              if (bState.Catch && Array.isArray(bState.Catch)) {
                for (const catcher of bState.Catch as Record<string, unknown>[]) {
                  const target = catcher.Next as string;
                  if (target && branchStates[target] && branchStates[target].Type === "Fail") {
                    branchFailsToRemove.add(target);
                  }
                }
                delete bState.Catch;
                changes.push(`FIX-9: Removed hallucinated Catch from "${name}.${bName}"`);
              }
            }

            for (const failName of branchFailsToRemove) {
              delete branchStates[failName];
              changes.push(`FIX-9: Removed hallucinated Fail state "${name}.${failName}"`);
            }
          }
        }
      }
    }
  }

  if (changes.length === 0) {
    changes.push("ASL post-processor: output is already valid — no fixes needed");
  }

  return { output, changesApplied: changes };
}

/**
 * Emergency fallback: if the AI returned Azure Logic Apps format instead of ASL,
 * do a basic structural conversion.
 */
function convertAzureToAslFallback(
  azureJson: Record<string, unknown>,
  changes: string[]
): Record<string, unknown> {
  const states: Record<string, Record<string, unknown>> = {};
  const actions = (azureJson.actions as Record<string, Record<string, unknown>>) || {};
  const actionNames = Object.keys(actions);

  if (actionNames.length === 0) {
    changes.push("FIX-1: No actions found in Azure JSON — cannot convert");
    return {
      Comment: "Migrated from Azure Logic Apps (fallback conversion)",
      StartAt: "EmptyState",
      States: {
        EmptyState: { Type: "Succeed" }
      }
    };
  }

  // Build execution order from runAfter dependencies
  const ordered = topologicalSort(actions);

  for (let i = 0; i < ordered.length; i++) {
    const actionName = ordered[i];
    const action = actions[actionName];
    const stateName = toPascalCase(actionName);
    const actionType = (action.type as string) || "Http";

    let state: Record<string, unknown>;

    switch (actionType.toLowerCase()) {
      case "if":
        state = {
          Type: "Choice",
          Choices: [{
            Variable: "$.status",
            StringEquals: "true",
            Next: ordered[i + 1] ? toPascalCase(ordered[i + 1]) : "EndState"
          }],
          Default: ordered[i + 1] ? toPascalCase(ordered[i + 1]) : "EndState"
        };
        break;
      case "terminate":
        if (action.inputs && (action.inputs as Record<string, unknown>).runStatus === "Failed") {
          state = { Type: "Fail", Error: "TerminatedError", Cause: "Workflow terminated with failure" };
        } else {
          state = { Type: "Succeed" };
        }
        break;
      case "wait":
        state = { Type: "Wait", Seconds: 60, ...(i < ordered.length - 1 ? { Next: toPascalCase(ordered[i + 1]) } : { End: true }) };
        break;
      case "compose":
        state = {
          Type: "Pass",
          Result: action.inputs || {},
          ...(i < ordered.length - 1 ? { Next: toPascalCase(ordered[i + 1]) } : { End: true })
        };
        break;
      default: {
        // Task state (Function, Http, ApiConnection, etc.)
        const funcId = action.inputs && (action.inputs as Record<string, Record<string, unknown>>)?.function?.id;
        const resource = funcId
          ? `arn:aws:lambda:us-east-1:ACCOUNT_ID:function:${String(funcId).split("/").pop()}`
          : "arn:aws:lambda:us-east-1:ACCOUNT_ID:function:TODO_REPLACE";
        state = {
          Type: "Task",
          Resource: resource,
          ...(i < ordered.length - 1 ? { Next: toPascalCase(ordered[i + 1]) } : { End: true })
        };
        break;
      }
    }

    states[stateName] = state;
  }

  // If no states were created, add a minimal succeed state
  const stateNames = Object.keys(states);
  if (stateNames.length === 0) {
    states.Start = { Type: "Succeed" };
    changes.push("FIX-1: Fallback created minimal Succeed state");
  }

  changes.push(`FIX-1: Fallback converted ${actionNames.length} Azure actions → ${Object.keys(states).length} ASL states`);

  return {
    Comment: "Migrated from Azure Logic Apps",
    StartAt: Object.keys(states)[0],
    States: states
  };
}

/** Topological sort of Azure actions based on runAfter dependencies */
function topologicalSort(actions: Record<string, Record<string, unknown>>): string[] {
  const result: string[] = [];
  const visited = new Set<string>();
  const actionNames = Object.keys(actions);

  function visit(name: string) {
    if (visited.has(name)) return;
    visited.add(name);
    const runAfter = actions[name]?.runAfter as Record<string, unknown> | undefined;
    if (runAfter) {
      for (const dep of Object.keys(runAfter)) {
        if (actions[dep]) visit(dep);
      }
    }
    result.push(name);
  }

  for (const name of actionNames) {
    visit(name);
  }

  return result;
}

/** Convert Azure action names (underscored/spaced) to PascalCase state names */
function toPascalCase(name: string): string {
  return name
    .split(/[_\s-]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}
