export interface ValidationIssue {
  severity: "error" | "warning";
  message: string;
  path?: string;
}

export function validateAzureLogicApps(json: Record<string, unknown>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!json.$schema || !(json.$schema as string).includes("Microsoft.Logic")) {
    issues.push({ severity: "error", message: "Missing or invalid $schema for Logic Apps" });
  }
  if (!json.contentVersion) {
    issues.push({ severity: "error", message: 'Missing "contentVersion"' });
  }
  if (!json.triggers || typeof json.triggers !== "object") {
    issues.push({ severity: "error", message: 'Missing "triggers" object' });
  }
  if (!json.actions || typeof json.actions !== "object") {
    issues.push({ severity: "error", message: 'Missing "actions" object' });
  }

  if (json.actions && typeof json.actions === "object") {
    const actions = json.actions as Record<string, Record<string, unknown>>;
    const rootActionNames = new Set(Object.keys(actions));

    for (const [name, action] of Object.entries(actions)) {
      validateAction(name, action, rootActionNames, issues, `actions.${name}`);
    }
  }

  return issues;
}

const TYPES_THAT_SUPPORT_EXPRESSION = new Set(["If", "Switch"]);
const NON_EXPRESSION_TYPES = new Set([
  "Http", "Function", "ApiConnection", "Compose", "ParseJson", "Parse_JSON",
  "Terminate", "Wait", "Scope", "Foreach", "Until", "Select",
  "InitializeVariable", "SetVariable", "AppendToArrayVariable", "IncrementVariable",
  "Request", "Response", "Batch",
]);

function validateAction(
  name: string,
  action: Record<string, unknown>,
  siblingNames: Set<string>,
  issues: ValidationIssue[],
  path: string
): void {
  const actionType = action.type as string;

  if (!actionType) {
    issues.push({ severity: "error", message: `Missing "type" property`, path });
    return;
  }

  // Check for invalid/invented types
  const invalidTypes = ["workflow", "Parallel", "DynamoDB", "SNS", "SQS", "Lambda", "S3"];
  if (invalidTypes.some((t) => t.toLowerCase() === actionType.toLowerCase())) {
    issues.push({
      severity: "error",
      message: `Invalid action type "${actionType}". This type does not exist in Azure Logic Apps.`,
      path,
    });
  }

  // CRITICAL: Check for "expression" on non-If/Switch actions
  if ("expression" in action && !TYPES_THAT_SUPPORT_EXPRESSION.has(actionType)) {
    issues.push({
      severity: "error",
      message: `Action type "${actionType}" has an "expression" property. Only "If" and "Switch" actions support "expression". This is a SCHEMA VIOLATION. Conditional branching must use a "type": "If" action wrapping the branches.`,
      path,
    });
  }

  // Check If action has proper structure
  if (actionType === "If") {
    if (!action.expression) {
      issues.push({ severity: "error", message: `If action missing "expression" property`, path });
    }
    if (!action.actions || typeof action.actions !== "object") {
      issues.push({ severity: "error", message: `If action missing "actions" (true branch)`, path });
    }
  }

  // Check Terminate uses runStatus not status
  if (actionType === "Terminate") {
    const inputs = action.inputs as Record<string, unknown> | undefined;
    if (inputs) {
      if ("status" in inputs && !("runStatus" in inputs)) {
        issues.push({
          severity: "error",
          message: `Terminate uses "status" instead of "runStatus". The correct field is "runStatus".`,
          path,
        });
      }
      if (inputs.runStatus && !["Succeeded", "Failed", "Cancelled"].includes(inputs.runStatus as string)) {
        issues.push({
          severity: "error",
          message: `Terminate "runStatus" must be "Succeeded", "Failed", or "Cancelled". Got: "${inputs.runStatus}"`,
          path,
        });
      }
    }
  }

  // Validate runAfter references
  if (action.runAfter && typeof action.runAfter === "object") {
    const deps = action.runAfter as Record<string, string[]>;
    const depNames = Object.keys(deps);

    for (const dep of depNames) {
      if (!siblingNames.has(dep)) {
        issues.push({
          severity: "warning",
          message: `runAfter references "${dep}" which is not a sibling action. It may be inside a nested scope — actions outside a scope cannot reference actions inside it.`,
          path: `${path}.runAfter`,
        });
      }
    }

    // Detect deadlock: AND of Failed + Succeeded across different actions
    if (depNames.length > 1) {
      const hasFailedDep = depNames.some((d) => {
        const statuses = deps[d];
        return statuses && statuses.some((s) => s === "Failed" || s === "TimedOut");
      });
      const hasSucceededOnlyDep = depNames.some((d) => {
        const statuses = deps[d];
        return statuses && statuses.every((s) => s === "Succeeded");
      });
      if (hasFailedDep && hasSucceededOnlyDep) {
        issues.push({
          severity: "error",
          message: `runAfter combines Failed and Succeeded conditions on different actions. This AND logic creates a deadlock — mutually exclusive paths can never both be true.`,
          path: `${path}.runAfter`,
        });
      }
    }
  }

  // CRITICAL: Foreach + AppendToArrayVariable = race condition under parallel execution
  if (actionType === "Foreach") {
    const nestedActions = action.actions as Record<string, Record<string, unknown>> | undefined;
    if (nestedActions) {
      const hasAppendToArray = Object.values(nestedActions).some(
        (a) => (a.type as string) === "AppendToArrayVariable"
      );
      if (hasAppendToArray) {
        issues.push({
          severity: "error",
          message: `Foreach loop uses AppendToArrayVariable — this causes a RACE CONDITION. Foreach runs in parallel by default and Logic Apps variables are globally scoped. Use a "Select" action instead for safe array transformation.`,
          path,
        });
      }
    }
  }

  // Anti-pattern: nested If where Switch should be used
  if (actionType === "If") {
    const elseActions = (action.else as Record<string, unknown>)?.actions as Record<string, Record<string, unknown>> | undefined;
    if (elseActions) {
      const elseActionValues = Object.values(elseActions);
      if (elseActionValues.length === 1 && (elseActionValues[0].type as string) === "If") {
        const expr = action.expression as Record<string, unknown[] | undefined> | undefined;
        const nestedExpr = elseActionValues[0].expression as Record<string, unknown[] | undefined> | undefined;
        if (expr && nestedExpr) {
          const getEqualsVar = (e: Record<string, unknown[] | undefined>): string | null => {
            const andArr = e.and as Record<string, unknown>[] | undefined;
            if (andArr?.length === 1 && andArr[0].equals) {
              const eqArr = andArr[0].equals as unknown[];
              if (typeof eqArr[0] === "string") return eqArr[0];
            }
            return null;
          };
          const var1 = getEqualsVar(expr);
          const var2 = getEqualsVar(nestedExpr);
          if (var1 && var2 && var1 === var2) {
            issues.push({
              severity: "warning",
              message: `Nested If statements compare the same variable "${var1}" against string values. Use a "Switch" action instead — it is cleaner, more maintainable, and the correct pattern for multi-branch string routing.`,
              path,
            });
          }
        }
      }
    }
  }

  // Check for Compose being used as conditional check (anti-pattern)
  if (actionType === "Compose") {
    const inputs = action.inputs;
    if (typeof inputs === "string" && (
      inputs.includes("@greater(") ||
      inputs.includes("@less(") ||
      inputs.includes("@equals(") ||
      inputs.includes("@not(") ||
      inputs.includes("@and(") ||
      inputs.includes("@or(")
    )) {
      issues.push({
        severity: "warning",
        message: `Compose action evaluates a boolean expression. Compose does NOT create conditional branching — use "type": "If" instead to branch workflow execution.`,
        path,
      });
    }
  }

  // Recurse into If branches
  if (actionType === "If") {
    if (action.actions && typeof action.actions === "object") {
      const nested = action.actions as Record<string, Record<string, unknown>>;
      const nestedNames = new Set(Object.keys(nested));
      for (const [n, a] of Object.entries(nested)) {
        validateAction(n, a, nestedNames, issues, `${path}.actions.${n}`);
      }
    }
    const elseBlock = action.else as Record<string, unknown> | undefined;
    if (elseBlock?.actions && typeof elseBlock.actions === "object") {
      const nested = elseBlock.actions as Record<string, Record<string, unknown>>;
      const nestedNames = new Set(Object.keys(nested));
      for (const [n, a] of Object.entries(nested)) {
        validateAction(n, a, nestedNames, issues, `${path}.else.actions.${n}`);
      }
    }
  }

  // Recurse into Scope/Foreach/Until
  if (actionType === "Scope" || actionType === "Foreach" || actionType === "Until") {
    if (action.actions && typeof action.actions === "object") {
      const nested = action.actions as Record<string, Record<string, unknown>>;
      const nestedNames = new Set(Object.keys(nested));
      for (const [n, a] of Object.entries(nested)) {
        validateAction(n, a, nestedNames, issues, `${path}.actions.${n}`);
      }
    }
  }

  // Recurse into Switch cases
  if (actionType === "Switch") {
    const cases = action.cases as Record<string, Record<string, unknown>> | undefined;
    if (cases) {
      for (const [caseName, caseBlock] of Object.entries(cases)) {
        if (caseBlock.actions && typeof caseBlock.actions === "object") {
          const nested = caseBlock.actions as Record<string, Record<string, unknown>>;
          const nestedNames = new Set(Object.keys(nested));
          for (const [n, a] of Object.entries(nested)) {
            validateAction(n, a, nestedNames, issues, `${path}.cases.${caseName}.actions.${n}`);
          }
        }
      }
    }
    const defaultBlock = action.default as Record<string, unknown> | undefined;
    if (defaultBlock?.actions && typeof defaultBlock.actions === "object") {
      const nested = defaultBlock.actions as Record<string, Record<string, unknown>>;
      const nestedNames = new Set(Object.keys(nested));
      for (const [n, a] of Object.entries(nested)) {
        validateAction(n, a, nestedNames, issues, `${path}.default.actions.${n}`);
      }
    }
  }
}

export function validateAWSStepFunctions(json: Record<string, unknown>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!json.StartAt) {
    issues.push({ severity: "error", message: 'Missing "StartAt" property' });
  }
  if (!json.States || typeof json.States !== "object") {
    issues.push({ severity: "error", message: 'Missing "States" object' });
  }

  if (json.States && typeof json.States === "object") {
    const states = json.States as Record<string, Record<string, unknown>>;
    const stateNames = new Set(Object.keys(states));

    if (json.StartAt && !stateNames.has(json.StartAt as string)) {
      issues.push({ severity: "error", message: `StartAt references "${json.StartAt}" which doesn't exist in States` });
    }

    for (const [name, state] of Object.entries(states)) {
      validateState(name, state, stateNames, issues, `States.${name}`);
    }
  }

  return issues;
}

function validateState(
  name: string,
  state: Record<string, unknown>,
  allStateNames: Set<string>,
  issues: ValidationIssue[],
  path: string
): void {
  const stateType = state.Type as string;

  if (!stateType) {
    issues.push({ severity: "error", message: `Missing "Type" property`, path });
    return;
  }

  const validTypes = ["Task", "Pass", "Choice", "Wait", "Succeed", "Fail", "Parallel", "Map"];
  if (!validTypes.includes(stateType)) {
    issues.push({ severity: "error", message: `Invalid state type "${stateType}"`, path });
  }

  // States that need Next or End
  const needsTerminal = ["Task", "Pass", "Wait", "Parallel", "Map"];
  if (needsTerminal.includes(stateType)) {
    if (!state.Next && !state.End) {
      issues.push({ severity: "error", message: `State must have either "Next" or "End: true"`, path });
    }
  }

  // Choice state rules
  if (stateType === "Choice") {
    if (state.Next || state.End) {
      issues.push({ severity: "error", message: `Choice state must not have top-level "Next" or "End"`, path });
    }
    if (!state.Default) {
      issues.push({ severity: "warning", message: `Choice state should have a "Default" branch`, path });
    }
    if (!Array.isArray(state.Choices) || (state.Choices as unknown[]).length === 0) {
      issues.push({ severity: "error", message: `Choice state must have non-empty "Choices" array`, path });
    } else {
      for (let i = 0; i < (state.Choices as Record<string, unknown>[]).length; i++) {
        const choice = (state.Choices as Record<string, unknown>[])[i];
        if (!choice.Next) {
          issues.push({ severity: "error", message: `Choice rule ${i} missing "Next"`, path: `${path}.Choices[${i}]` });
        }
        if (choice.Next && !allStateNames.has(choice.Next as string)) {
          issues.push({ severity: "error", message: `Choice rule ${i} "Next" references "${choice.Next}" which doesn't exist`, path: `${path}.Choices[${i}]` });
        }
      }
    }
    if (state.Default && !allStateNames.has(state.Default as string)) {
      issues.push({ severity: "error", message: `Default references "${state.Default}" which doesn't exist`, path });
    }
  }

  // Fail state rules
  if (stateType === "Fail") {
    if (state.Next || state.End) {
      issues.push({ severity: "error", message: `Fail state must not have "Next" or "End"`, path });
    }
    if (!state.Error) {
      issues.push({ severity: "warning", message: `Fail state missing "Error" code`, path });
    }
  }

  // Succeed state rules
  if (stateType === "Succeed") {
    if (state.Next) {
      issues.push({ severity: "error", message: `Succeed state must not have "Next"`, path });
    }
  }

  // Validate Next references exist
  if (state.Next && typeof state.Next === "string" && !allStateNames.has(state.Next)) {
    issues.push({ severity: "error", message: `"Next" references "${state.Next}" which doesn't exist`, path });
  }

  // Validate Parallel branches
  if (stateType === "Parallel" && Array.isArray(state.Branches)) {
    for (let i = 0; i < (state.Branches as unknown[]).length; i++) {
      const branch = (state.Branches as Record<string, unknown>[])[i];
      if (!branch.StartAt) {
        issues.push({ severity: "error", message: `Branch missing "StartAt"`, path: `${path}.Branches[${i}]` });
      }
      if (branch.States && typeof branch.States === "object") {
        const branchStates = branch.States as Record<string, Record<string, unknown>>;
        const branchNames = new Set(Object.keys(branchStates));
        if (branch.StartAt && !branchNames.has(branch.StartAt as string)) {
          issues.push({ severity: "error", message: `Branch StartAt "${branch.StartAt}" not found`, path: `${path}.Branches[${i}]` });
        }
        for (const [sn, ss] of Object.entries(branchStates)) {
          validateState(sn, ss, branchNames, issues, `${path}.Branches[${i}].States.${sn}`);
        }
      }
    }
  }

  // Validate Catch references
  if (Array.isArray(state.Catch)) {
    for (let i = 0; i < (state.Catch as Record<string, unknown>[]).length; i++) {
      const c = (state.Catch as Record<string, unknown>[])[i];
      if (c.Next && !allStateNames.has(c.Next as string)) {
        issues.push({ severity: "error", message: `Catch[${i}] "Next" references "${c.Next}" which doesn't exist`, path });
      }
    }
  }
}
