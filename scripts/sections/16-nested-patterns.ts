/**
 * Section 16 – Nested and complex patterns:
 *   Nested Choice states, Choice inside Parallel branches,
 *   Map inside Parallel, Parallel inside Map, multi-level error handling
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

export function nestedPatternPairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // ── Nested Choice (Choice state as target of another Choice branch) ──────
  const nestedChoiceCases: [string, string, string, string, string][] = [
    ["CheckRegionAndTier", "$.region", "us-east-1", "$.tier", "premium"],
    ["CheckEnvAndMode",    "$.env",    "prod",       "$.mode",  "batch"],
    ["CheckTypeAndStatus", "$.type",   "order",      "$.status","active"],
    ["CheckRoleAndLevel",  "$.role",   "admin",      "$.level", "enterprise"],
    ["CheckSourceAndLang", "$.source", "api",        "$.lang",  "en"],
  ];

  for (const [name, var1, val1, var2, val2] of nestedChoiceCases) {
    const trueBranch = `${name}_FullMatch`;
    const partialBranch = `${name}_PartialMatch`;
    const defaultBranch = `${name}_Default`;
    const innerChoice = `${name}_InnerCheck`;

    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Choice",
            Choices: [{ Variable: var1, StringEquals: val1, Next: innerChoice }],
            Default: defaultBranch
          },
          [innerChoice]: {
            Type: "Choice",
            Choices: [{ Variable: var2, StringEquals: val2, Next: trueBranch }],
            Default: partialBranch
          },
          [trueBranch]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${trueBranch}Fn`, "Payload.$": "$" },
            End: true
          },
          [partialBranch]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${partialBranch}Fn`, "Payload.$": "$" },
            End: true
          },
          [defaultBranch]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${defaultBranch}Fn`, "Payload.$": "$" },
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
            type: "If",
            expression: { and: [{ equals: [var1.replace("$.", "@triggerBody()?['") + "']", val1] }] },
            actions: {
              [innerChoice]: {
                type: "If",
                expression: { and: [{ equals: [var2.replace("$.", "@triggerBody()?['") + "']", val2] }] },
                actions: {
                  [trueBranch]: {
                    type: "Function",
                    inputs: { function: { id: `/sub/rg/app/functions/${trueBranch}Fn` }, body: "@triggerBody()" },
                    runAfter: {}
                  }
                },
                else: {
                  actions: {
                    [partialBranch]: {
                      type: "Function",
                      inputs: { function: { id: `/sub/rg/app/functions/${partialBranch}Fn` }, body: "@triggerBody()" },
                      runAfter: {}
                    }
                  }
                },
                runAfter: {}
              }
            },
            else: {
              actions: {
                [defaultBranch]: {
                  type: "Function",
                  inputs: { function: { id: `/sub/rg/app/functions/${defaultBranch}Fn` }, body: "@triggerBody()" },
                  runAfter: {}
                }
              }
            },
            runAfter: {}
          }
        }
      })
    ));
  }

  // ── Parallel with error catch on individual branch task ──────────────────
  const parallelCatchCases: [string, string, string, string][] = [
    ["FetchWithFallback",  "FetchPrimary",   "FetchFallback",   "MergeResults"],
    ["ValidateWithLog",    "ValidateData",   "LogFailure",      "ContinueAfter"],
    ["EnrichWithDefault",  "EnrichRecord",   "UseDefault",      "SaveRecord"],
    ["ProcessWithRetry",   "ProcessMain",    "ProcessRetry",    "Finalize"],
  ];

  for (const [name, branch1, fallback, merge] of parallelCatchCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Parallel",
            Branches: [
              {
                StartAt: branch1,
                States: {
                  [branch1]: {
                    Type: "Task",
                    Resource: "arn:aws:states:::lambda:invoke",
                    Parameters: { FunctionName: `${branch1}Fn`, "Payload.$": "$" },
                    Catch: [{ ErrorEquals: ["States.ALL"], Next: fallback, ResultPath: "$.error" }],
                    End: true
                  },
                  [fallback]: {
                    Type: "Task",
                    Resource: "arn:aws:states:::lambda:invoke",
                    Parameters: { FunctionName: `${fallback}Fn`, "Payload.$": "$" },
                    End: true
                  }
                }
              }
            ],
            Next: merge
          },
          [merge]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${merge}Fn`, "Payload.$": "$" },
            End: true
          }
        }
      }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [branch1]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${branch1}Fn` }, body: "@triggerBody()" },
            runAfter: {}
          },
          [fallback]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${fallback}Fn` }, body: "@triggerBody()" },
            runAfter: { [branch1]: ["Failed", "TimedOut", "Skipped"] }
          },
          [merge]: {
            type: "Function",
            inputs: {
              function: { id: `/sub/rg/app/functions/${merge}Fn` },
              body: {
                primary: `@body('${branch1}')`,
                fallbackUsed: `@not(equals(actions('${branch1}').status, 'Succeeded'))`
              }
            },
            runAfter: {
              [branch1]: ["Succeeded"],
              [fallback]: ["Succeeded", "Skipped"]
            }
          }
        }
      })
    ));
  }

  // ── Map state with retry inside ItemProcessor ────────────────────────────
  const mapRetryInnerCases: [string, string, string, number][] = [
    ["ProcessWithItemRetry",  "$.items",   "ProcessItem",    3],
    ["UploadWithRetry",       "$.files",   "UploadFile",     5],
    ["TransformWithRetry",    "$.records", "TransformRecord",4],
    ["CallApiPerItem",        "$.requests","CallExternalApi", 3],
    ["EnrichItems",           "$.profiles","EnrichProfile",  2],
  ];

  for (const [name, itemsPath, innerFn, attempts] of mapRetryInnerCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Map",
            ItemsPath: itemsPath,
            MaxConcurrency: 5,
            ItemProcessor: {
              ProcessorConfig: { Mode: "INLINE" },
              StartAt: innerFn,
              States: {
                [innerFn]: {
                  Type: "Task",
                  Resource: "arn:aws:states:::lambda:invoke",
                  Parameters: { FunctionName: `${innerFn}Fn`, "Payload.$": "$" },
                  Retry: [{ ErrorEquals: ["States.ALL"], IntervalSeconds: 2, MaxAttempts: attempts, BackoffRate: 2 }],
                  End: true
                }
              }
            },
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
            type: "Foreach",
            foreach: `@triggerBody()?['${itemsPath.replace("$.", "")}']`,
            actions: {
              [innerFn]: {
                type: "Function",
                inputs: { function: { id: `/sub/rg/app/functions/${innerFn}Fn` }, body: `@items('${name}')` },
                retryPolicy: { type: "exponential", count: attempts, interval: "PT2S", minimumInterval: "PT2S", maximumInterval: "PT1H" },
                runAfter: {}
              }
            },
            runAfter: {}
          }
        }
      })
    ));
  }

  // ── Choice after Parallel (fan-in then branch) ───────────────────────────
  const parallelThenChoiceCases: [string, string, string][] = [
    ["GatherThenRoute", "GatherData", "RouteResult"],
    ["CheckAllThenDecide", "CheckAll", "DecideNext"],
    ["AggregateAndBranch", "Aggregate", "BranchOnResult"],
  ];

  for (const [parallelName, mergeTask, choiceName] of parallelThenChoiceCases) {
    const b1 = `${parallelName}_Branch1`;
    const b2 = `${parallelName}_Branch2`;

    pairs.push(pair("aws-to-azure",
      j({
        StartAt: parallelName,
        States: {
          [parallelName]: {
            Type: "Parallel",
            Branches: [
              { StartAt: b1, States: { [b1]: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${b1}Fn`, "Payload.$": "$" }, End: true } } },
              { StartAt: b2, States: { [b2]: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${b2}Fn`, "Payload.$": "$" }, End: true } } }
            ],
            ResultPath: "$.gathered",
            Next: mergeTask
          },
          [mergeTask]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${mergeTask}Fn`, "Payload.$": "$" },
            Next: choiceName
          },
          [choiceName]: {
            Type: "Choice",
            Choices: [{ Variable: "$.result.success", BooleanEquals: true, Next: "SuccessPath" }],
            Default: "FailurePath"
          },
          SuccessPath: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "SuccessPathFn", "Payload.$": "$" }, End: true },
          FailurePath: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "FailurePathFn", "Payload.$": "$" }, End: true }
        }
      }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [b1]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${b1}Fn` }, body: "@triggerBody()" }, runAfter: {} },
          [b2]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${b2}Fn` }, body: "@triggerBody()" }, runAfter: {} },
          [mergeTask]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${mergeTask}Fn` }, body: { b1Result: `@body('${b1}')`, b2Result: `@body('${b2}')` } },
            runAfter: { [b1]: ["Succeeded"], [b2]: ["Succeeded"] }
          },
          [choiceName]: {
            type: "If",
            expression: { and: [{ equals: ["@body('" + mergeTask + "')?['success']", true] }] },
            actions: {
              SuccessPath: { type: "Function", inputs: { function: { id: "/sub/rg/app/functions/SuccessPathFn" }, body: `@body('${mergeTask}')` }, runAfter: {} }
            },
            else: {
              actions: {
                FailurePath: { type: "Function", inputs: { function: { id: "/sub/rg/app/functions/FailurePathFn" }, body: `@body('${mergeTask}')` }, runAfter: {} }
              }
            },
            runAfter: { [mergeTask]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── Multi-level Catch (task → catch handler → second catch) ─────────────
  const multiLevelCatchCases: [string, string, string, string][] = [
    ["PrimaryOp",   "PrimaryHandler",  "FinalHandler",  "TerminalFail"],
    ["MainProcess", "ErrorHandler",    "RecoveryTask",  "GiveUp"],
    ["CoreTask",    "FirstCatch",      "SecondCatch",   "Abandon"],
  ];

  for (const [primary, handler1, handler2, terminal] of multiLevelCatchCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: primary,
        States: {
          [primary]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${primary}Fn`, "Payload.$": "$" },
            Catch: [{ ErrorEquals: ["States.ALL"], Next: handler1, ResultPath: "$.error" }],
            End: true
          },
          [handler1]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${handler1}Fn`, "Payload.$": "$" },
            Catch: [{ ErrorEquals: ["States.ALL"], Next: handler2, ResultPath: "$.secondError" }],
            End: true
          },
          [handler2]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${handler2}Fn`, "Payload.$": "$" },
            Catch: [{ ErrorEquals: ["States.ALL"], Next: terminal, ResultPath: "$.fatalError" }],
            End: true
          },
          [terminal]: {
            Type: "Fail",
            Error: "UnrecoverableError",
            Cause: "All error handlers exhausted"
          }
        }
      }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [primary]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${primary}Fn` }, body: "@triggerBody()" },
            runAfter: {}
          },
          [handler1]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${handler1}Fn` }, body: "@triggerBody()" },
            runAfter: { [primary]: ["Failed", "TimedOut", "Skipped"] }
          },
          [handler2]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${handler2}Fn` }, body: "@triggerBody()" },
            runAfter: { [handler1]: ["Failed", "TimedOut", "Skipped"] }
          },
          [terminal]: {
            type: "Terminate",
            inputs: {
              runStatus: "Failed",
              runError: { code: "UnrecoverableError", message: "All error handlers exhausted" }
            },
            runAfter: { [handler2]: ["Failed", "TimedOut", "Skipped"] }
          }
        }
      })
    ));
  }

  // ── Scope containing multiple sequential actions (Azure→AWS Parallel) ────
  const scopeCases: [string, string[]][] = [
    ["TransactionScope",    ["BeginTxn", "ExecuteTxn", "CommitTxn"]],
    ["ValidationScope",     ["ValidateSchema", "ValidateBusiness", "ValidateSecurity"]],
    ["NotificationScope",   ["PrepareMessage", "SendEmail", "SendSMS"]],
    ["DataProcessingScope", ["ReadData", "TransformData", "WriteData"]],
  ];

  for (const [scopeName, actions] of scopeCases) {
    const azureActions: Record<string, unknown> = {};
    let prevAction: string | null = null;
    for (const act of actions) {
      azureActions[act] = {
        type: "Function",
        inputs: { function: { id: `/sub/rg/app/functions/${act}Fn` }, body: prevAction ? `@body('${prevAction}')` : "@triggerBody()" },
        runAfter: prevAction ? { [prevAction]: ["Succeeded"] } : {}
      };
      prevAction = act;
    }

    const awsStates: Record<string, unknown> = {};
    for (let i = 0; i < actions.length; i++) {
      const act = actions[i];
      awsStates[act] = {
        Type: "Task",
        Resource: "arn:aws:states:::lambda:invoke",
        Parameters: { FunctionName: `${act}Fn`, "Payload.$": "$" },
        ...(i < actions.length - 1 ? { Next: actions[i + 1] } : { End: true })
      };
    }

    pairs.push(pair("azure-to-aws",
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [scopeName]: {
            type: "Scope",
            actions: azureActions,
            runAfter: {}
          }
        }
      }),
      j({
        StartAt: actions[0],
        States: awsStates
      })
    ));
  }

  // ── AWS-to-Azure: Parallel single branch → Scope ─────────────────────────
  const singleBranchParallelCases: [string, string[]][] = [
    ["IsolatedScope",    ["StepA", "StepB"]],
    ["CriticalSection",  ["LockResource", "ProcessResource"]],
    ["AtomicOperation",  ["Validate", "Execute"]],
  ];

  for (const [parallelName, steps] of singleBranchParallelCases) {
    const branchStates: Record<string, unknown> = {};
    for (let i = 0; i < steps.length; i++) {
      branchStates[steps[i]] = {
        Type: "Task",
        Resource: "arn:aws:states:::lambda:invoke",
        Parameters: { FunctionName: `${steps[i]}Fn`, "Payload.$": "$" },
        ...(i < steps.length - 1 ? { Next: steps[i + 1] } : { End: true })
      };
    }

    const scopeInnerActions: Record<string, unknown> = {};
    let prev: string | null = null;
    for (const step of steps) {
      scopeInnerActions[step] = {
        type: "Function",
        inputs: { function: { id: `/sub/rg/app/functions/${step}Fn` }, body: prev ? `@body('${prev}')` : "@triggerBody()" },
        runAfter: prev ? { [prev]: ["Succeeded"] } : {}
      };
      prev = step;
    }

    pairs.push(pair("aws-to-azure",
      j({
        StartAt: parallelName,
        States: {
          [parallelName]: {
            Type: "Parallel",
            Branches: [{ StartAt: steps[0], States: branchStates }],
            End: true
          }
        }
      }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [parallelName]: {
            type: "Scope",
            actions: scopeInnerActions,
            runAfter: {}
          }
        }
      })
    ));
  }

  return pairs;
}
