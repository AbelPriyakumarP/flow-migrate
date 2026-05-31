/**
 * Section 15 – Variable management patterns:
 *   Azure InitializeVariable / SetVariable / IncrementVariable / DecrementVariable /
 *   AppendToArrayVariable ↔ AWS Pass state with ResultPath / Parameters
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

export function variableManagementPairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // ── InitializeVariable all primitive types ──────────────────────────────
  const initVarCases: [string, string, unknown, string][] = [
    ["InitCounter",      "counter",       0,        "Integer"],
    ["InitFlag",         "isProcessed",   false,    "Boolean"],
    ["InitLabel",        "statusLabel",   "pending","String"],
    ["InitTotal",        "totalAmount",   0.0,      "Float"],
    ["InitResults",      "resultList",    [],       "Array"],
    ["InitContext",      "contextObj",    {},       "Object"],
    ["InitRetryCount",   "retryCount",    0,        "Integer"],
    ["InitErrorMsg",     "errorMessage",  "",       "String"],
    ["InitApprovedFlag", "isApproved",    false,    "Boolean"],
    ["InitItemCount",    "itemCount",     0,        "Integer"],
    ["InitBatchSize",    "batchSize",     100,      "Integer"],
    ["InitPageToken",    "pageToken",     null,     "String"],
  ];

  for (const [actionName, varName, initialValue, varType] of initVarCases) {
    const awsDefault = varType === "Integer" || varType === "Float" ? initialValue
      : varType === "Boolean" ? initialValue
      : varType === "String" ? initialValue
      : varType === "Array" ? initialValue
      : initialValue;

    pairs.push(pair("azure-to-aws",
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [actionName]: {
            type: "InitializeVariable",
            inputs: {
              variables: [{ name: varName, type: varType.toLowerCase(), value: initialValue }]
            },
            runAfter: {}
          },
          ProcessData: {
            type: "Function",
            inputs: {
              function: { id: "/sub/rg/app/functions/ProcessDataFn" },
              body: "@triggerBody()"
            },
            runAfter: { [actionName]: ["Succeeded"] }
          }
        }
      }),
      j({
        StartAt: actionName,
        States: {
          [actionName]: {
            Type: "Pass",
            Parameters: { [varName]: awsDefault, "input.$": "$" },
            ResultPath: "$.vars",
            Next: "ProcessData"
          },
          ProcessData: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: "ProcessDataFn", "Payload.$": "$" },
            End: true
          }
        }
      })
    ));
  }

  // ── SetVariable patterns ─────────────────────────────────────────────────
  const setVarCases: [string, string, string][] = [
    ["SetStatusApproved",  "status",      "approved"],
    ["SetStatusRejected",  "status",      "rejected"],
    ["SetStatusPending",   "status",      "pending"],
    ["SetEnvironmentProd", "environment", "production"],
    ["SetRegionEast",      "region",      "us-east-1"],
    ["SetFlagTrue",        "processed",   "true"],
    ["SetFlagFalse",       "processed",   "false"],
    ["SetModeAsync",       "mode",        "async"],
    ["SetModeSync",        "mode",        "sync"],
    ["SetPriorityHigh",    "priority",    "high"],
  ];

  for (const [actionName, varName, value] of setVarCases) {
    pairs.push(pair("azure-to-aws",
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          DoWork: {
            type: "Function",
            inputs: { function: { id: "/sub/rg/app/functions/DoWorkFn" }, body: "@triggerBody()" },
            runAfter: {}
          },
          [actionName]: {
            type: "SetVariable",
            inputs: { name: varName, value: value },
            runAfter: { DoWork: ["Succeeded"] }
          },
          UseResult: {
            type: "Function",
            inputs: { function: { id: "/sub/rg/app/functions/UseResultFn" }, body: "@triggerBody()" },
            runAfter: { [actionName]: ["Succeeded"] }
          }
        }
      }),
      j({
        StartAt: "DoWork",
        States: {
          DoWork: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: "DoWorkFn", "Payload.$": "$" },
            Next: actionName
          },
          [actionName]: {
            Type: "Pass",
            Parameters: { [varName]: value, "input.$": "$" },
            ResultPath: `$.${varName}State`,
            Next: "UseResult"
          },
          UseResult: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: "UseResultFn", "Payload.$": "$" },
            End: true
          }
        }
      })
    ));
  }

  // ── IncrementVariable / DecrementVariable ────────────────────────────────
  const counterCases: [string, "Increment" | "Decrement", string, number][] = [
    ["IncrementPageNum",  "Increment", "pageNumber", 1],
    ["IncrementRetry",    "Increment", "retryCount", 1],
    ["IncrementIndex",    "Increment", "index", 1],
    ["IncrementBatchNum", "Increment", "batchNumber", 1],
    ["DecrementStock",    "Decrement", "stockLevel", 1],
    ["DecrementQuota",    "Decrement", "quotaRemaining", 1],
    ["IncrementErrors",   "Increment", "errorCount", 1],
    ["IncrementStep",     "Increment", "stepNumber", 1],
  ];

  for (const [actionName, opType, varName, stepVal] of counterCases) {
    const awsOp = opType === "Increment" ? "States.MathAdd" : "States.MathAdd";
    const awsIncrement = opType === "Increment" ? stepVal : -stepVal;

    pairs.push(pair("azure-to-aws",
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          InitVar: {
            type: "InitializeVariable",
            inputs: { variables: [{ name: varName, type: "integer", value: 0 }] },
            runAfter: {}
          },
          [actionName]: {
            type: opType === "Increment" ? "IncrementVariable" : "DecrementVariable",
            inputs: { name: varName, value: stepVal },
            runAfter: { InitVar: ["Succeeded"] }
          },
          UseCounter: {
            type: "Function",
            inputs: { function: { id: "/sub/rg/app/functions/UseCounterFn" }, body: "@variables('counter')" },
            runAfter: { [actionName]: ["Succeeded"] }
          }
        }
      }),
      j({
        StartAt: "InitVar",
        States: {
          InitVar: {
            Type: "Pass",
            Parameters: { [varName]: 0, "input.$": "$" },
            ResultPath: "$.counters",
            Next: actionName
          },
          [actionName]: {
            Type: "Pass",
            Parameters: {
              [`${varName}.$`]: `States.MathAdd($.counters.${varName}, ${awsIncrement})`,
              "input.$": "$"
            },
            ResultPath: "$.counters",
            Next: "UseCounter"
          },
          UseCounter: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: "UseCounterFn", "Payload.$": "$" },
            End: true
          }
        }
      })
    ));
  }

  // ── AppendToArrayVariable ────────────────────────────────────────────────
  const appendCases: [string, string][] = [
    ["AppendResult",   "results"],
    ["AppendError",    "errors"],
    ["AppendItem",     "items"],
    ["AppendUserId",   "userIds"],
    ["AppendMessage",  "messages"],
    ["CollectOutput",  "outputs"],
  ];

  for (const [actionName, arrayVarName] of appendCases) {
    pairs.push(pair("azure-to-aws",
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          InitArray: {
            type: "InitializeVariable",
            inputs: { variables: [{ name: arrayVarName, type: "array", value: [] }] },
            runAfter: {}
          },
          ProcessItem: {
            type: "Function",
            inputs: { function: { id: "/sub/rg/app/functions/ProcessItemFn" }, body: "@triggerBody()" },
            runAfter: { InitArray: ["Succeeded"] }
          },
          [actionName]: {
            type: "AppendToArrayVariable",
            inputs: { name: arrayVarName, value: "@body('ProcessItem')" },
            runAfter: { ProcessItem: ["Succeeded"] }
          }
        }
      }),
      j({
        StartAt: "InitArray",
        States: {
          InitArray: {
            Type: "Pass",
            Parameters: { [arrayVarName]: [], "input.$": "$" },
            ResultPath: "$.arrays",
            Next: "ProcessItem"
          },
          ProcessItem: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: "ProcessItemFn", "Payload.$": "$" },
            ResultPath: "$.processResult",
            Next: actionName
          },
          [actionName]: {
            Type: "Pass",
            Parameters: {
              [`${arrayVarName}.$`]: "States.Array($.arrays." + arrayVarName + ", $.processResult)",
              "input.$": "$"
            },
            ResultPath: "$.arrays",
            End: true
          }
        }
      })
    ));
  }

  // ── AWS Pass inject → Azure InitializeVariable (aws-to-azure) ───────────
  const awsPassCases: [string, Record<string, unknown>, string][] = [
    ["InjectConfig", { mode: "production", retries: 3, timeout: 30 }, "ProcessWithConfig"],
    ["InjectDefaults", { currency: "USD", locale: "en-US", maxItems: 100 }, "RunWithDefaults"],
    ["InjectContext", { requestId: "auto-generated", traceId: "auto-generated" }, "TraceRequest"],
    ["InjectFlags", { featureFlag: true, betaEnabled: false, dryRun: false }, "EvaluateFlags"],
    ["SetInitialState", { stage: "init", attempts: 0, lastError: null }, "BeginProcessing"],
  ];

  for (const [name, params, nextFn] of awsPassCases) {
    const azureVars: Record<string, unknown>[] = Object.entries(params).map(([k, v]) => ({
      name: k,
      type: typeof v === "number" ? "integer" : typeof v === "boolean" ? "boolean" : "string",
      value: v
    }));

    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Pass",
            Parameters: { ...params, "originalInput.$": "$" },
            Next: nextFn
          },
          [nextFn]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${nextFn}Fn`, "Payload.$": "$" },
            End: true
          }
        }
      }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [name]: {
            type: "InitializeVariable",
            inputs: { variables: azureVars },
            runAfter: {}
          },
          [nextFn]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${nextFn}Fn` }, body: "@triggerBody()" },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  return pairs;
}
