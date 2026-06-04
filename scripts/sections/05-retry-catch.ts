/**
 * Section 05 – Retry & Catch patterns (all ASL error codes)
 *
 * Sources:
 *  AWS Retry:  https://docs.aws.amazon.com/step-functions/latest/dg/concepts-error-handling.html
 *  AWS Errors: https://docs.aws.amazon.com/step-functions/latest/dg/concepts-error-handling.html#error-handling-error-representation
 *  Azure:      https://learn.microsoft.com/en-us/azure/logic-apps/logic-apps-workflow-actions-triggers#retry-policy
 *              https://learn.microsoft.com/en-us/azure/logic-apps/logic-apps-workflow-actions-triggers#runafter-property
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

export function retryCatchPairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // ── 1. Retry exponential (standard) ─────────────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "RetryExponential",
      States: {
        RetryExponential: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "FlakeyFn", "Payload.$": "$" },
          Retry: [{ ErrorEquals: ["States.ALL"], IntervalSeconds: 1, MaxAttempts: 4, BackoffRate: 2.0 }],
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        RetryExponential: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/FlakeyFn" }, body: "@triggerBody()" },
          retryPolicy: { type: "exponential", count: 4, interval: "PT1S", minimumInterval: "PT1S", maximumInterval: "PT1H" },
          runAfter: {}
        }
      }
    })
  ));

  // ── 2. Retry fixed (BackoffRate = 1) ─────────────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "RetryFixed",
      States: {
        RetryFixed: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ConstantFn", "Payload.$": "$" },
          Retry: [{ ErrorEquals: ["States.TaskFailed"], IntervalSeconds: 10, MaxAttempts: 5, BackoffRate: 1.0 }],
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        RetryFixed: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ConstantFn" }, body: "@triggerBody()" },
          retryPolicy: { type: "fixed", count: 5, interval: "PT10S" },
          runAfter: {}
        }
      }
    })
  ));

  // ── 3. Retry with MaxDelaySeconds (capped backoff) ───────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "CappedBackoff",
      States: {
        CappedBackoff: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ThrottledApiCallFn", "Payload.$": "$" },
          Retry: [{
            ErrorEquals: ["States.ALL"],
            IntervalSeconds: 2,
            MaxAttempts: 8,
            BackoffRate: 2.0,
            MaxDelaySeconds: 120
          }],
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        CappedBackoff: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ThrottledApiCallFn" }, body: "@triggerBody()" },
          retryPolicy: { type: "exponential", count: 8, interval: "PT2S", minimumInterval: "PT2S", maximumInterval: "PT120S" },
          runAfter: {}
        }
      }
    })
  ));

  // ── 4. Retry MaxAttempts 0 → retryPolicy none ───────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "NoRetryAllowed",
      States: {
        NoRetryAllowed: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "IdempotentCriticalFn", "Payload.$": "$" },
          Retry: [{ ErrorEquals: ["States.ALL"], MaxAttempts: 0 }],
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        NoRetryAllowed: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/IdempotentCriticalFn" }, body: "@triggerBody()" },
          retryPolicy: { type: "none" },
          runAfter: {}
        }
      }
    })
  ));

  // ── 5. Multiple Retry rules (specific before general) ───────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "MultiRetryRules",
      States: {
        MultiRetryRules: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ExternalApiFn", "Payload.$": "$" },
          Retry: [
            { ErrorEquals: ["ThrottlingException"], IntervalSeconds: 5, MaxAttempts: 10, BackoffRate: 1.5, MaxDelaySeconds: 60 },
            { ErrorEquals: ["States.TaskFailed"], IntervalSeconds: 2, MaxAttempts: 3, BackoffRate: 2.0 }
          ],
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        MultiRetryRules: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ExternalApiFn" }, body: "@triggerBody()" },
          retryPolicy: { type: "exponential", count: 10, interval: "PT5S", minimumInterval: "PT5S", maximumInterval: "PT60S" },
          runAfter: {}
        }
      }
    })
  ));

  // ── 6. Catch States.ALL → runAfter Failed/TimedOut/Skipped ──────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "TaskWithCatchAll",
      States: {
        TaskWithCatchAll: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "UnreliableFn", "Payload.$": "$" },
          Catch: [{ ErrorEquals: ["States.ALL"], Next: "GlobalErrorHandler", ResultPath: "$.error" }],
          End: true
        },
        GlobalErrorHandler: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ErrorHandlerFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        TaskWithCatchAll: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/UnreliableFn" }, body: "@triggerBody()" },
          runAfter: {}
        },
        GlobalErrorHandler: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ErrorHandlerFn" }, body: "@triggerBody()" },
          runAfter: { TaskWithCatchAll: ["Failed", "TimedOut", "Skipped"] }
        }
      }
    })
  ));

  // ── 7. Catch States.Timeout → runAfter TimedOut ──────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "LongRunningTask",
      States: {
        LongRunningTask: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "SlowFn", "Payload.$": "$" },
          TimeoutSeconds: 120,
          Catch: [{ ErrorEquals: ["States.Timeout"], Next: "TimeoutHandler" }],
          End: true
        },
        TimeoutHandler: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "TimeoutFallbackFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        LongRunningTask: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/SlowFn" }, body: "@triggerBody()" },
          runAfter: {}
        },
        TimeoutHandler: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/TimeoutFallbackFn" }, body: "@triggerBody()" },
          runAfter: { LongRunningTask: ["TimedOut"] }
        }
      }
    })
  ));

  // ── 8. Catch States.TaskFailed → runAfter Failed ─────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "ProcessPayment",
      States: {
        ProcessPayment: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "PaymentFn", "Payload.$": "$" },
          Catch: [{ ErrorEquals: ["States.TaskFailed"], Next: "HandlePaymentFailure", ResultPath: "$.paymentError" }],
          End: true
        },
        HandlePaymentFailure: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "RefundFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        ProcessPayment: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/PaymentFn" }, body: "@triggerBody()" },
          runAfter: {}
        },
        HandlePaymentFailure: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/RefundFn" }, body: "@triggerBody()" },
          runAfter: { ProcessPayment: ["Failed"] }
        }
      }
    })
  ));

  // ── 9. Catch States.HeartbeatTimeout → runAfter TimedOut ─────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "LongPollingTask",
      States: {
        LongPollingTask: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke.waitForTaskToken",
          Parameters: { FunctionName: "StartPollingFn", Payload: { "TaskToken.$": "$$.Task.Token" } },
          HeartbeatSeconds: 300,
          Catch: [{ ErrorEquals: ["States.HeartbeatTimeout"], Next: "HeartbeatTimeoutHandler" }],
          End: true
        },
        HeartbeatTimeoutHandler: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "HeartbeatTimeoutFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        LongPollingTask: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['office365']['connectionId']" } },
            method: "post",
            path: "/Mail",
            body: { To: "@parameters('callbackEmail')", Subject: "Task awaiting callback", Body: "Callback: @{listCallbackUrl()}" }
          },
          runAfter: {}
        },
        HeartbeatTimeoutHandler: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/HeartbeatTimeoutFn" }, body: "@triggerBody()" },
          runAfter: { LongPollingTask: ["TimedOut"] }
        }
      }
    })
  ));

  // ── 10. Catch States.Permissions → runAfter Failed ───────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "SecureOperation",
      States: {
        SecureOperation: {
          Type: "Task",
          Resource: "arn:aws:states:::s3:putObject",
          Parameters: { Bucket: "secure-bucket", Key: "sensitive/data.json", "Body.$": "$" },
          Catch: [{ ErrorEquals: ["States.Permissions"], Next: "PermissionsError" }],
          End: true
        },
        PermissionsError: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "PermissionErrorFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        SecureOperation: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['azureblob']['connectionId']" } },
            method: "post",
            path: "/datasets/default/files",
            queries: { folderPath: "/sensitive", name: "data.json" },
            body: "@triggerBody()"
          },
          runAfter: {}
        },
        PermissionsError: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/PermissionErrorFn" }, body: "@triggerBody()" },
          runAfter: { SecureOperation: ["Failed"] }
        }
      }
    })
  ));

  // ── 11. Catch States.Runtime → runAfter Failed ───────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "RuntimeSensitiveTask",
      States: {
        RuntimeSensitiveTask: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "RuntimeFn", "Payload.$": "$" },
          Catch: [{ ErrorEquals: ["States.Runtime"], Next: "RuntimeErrorRecovery" }],
          End: true
        },
        RuntimeErrorRecovery: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "RecoveryFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        RuntimeSensitiveTask: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/RuntimeFn" }, body: "@triggerBody()" },
          runAfter: {}
        },
        RuntimeErrorRecovery: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/RecoveryFn" }, body: "@triggerBody()" },
          runAfter: { RuntimeSensitiveTask: ["Failed"] }
        }
      }
    })
  ));

  // ── 12. Catch States.NoChoiceMatched → Switch default ────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "RoutingTask",
      States: {
        RoutingTask: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "RoutingFn", "Payload.$": "$" },
          Next: "RouteOutput"
        },
        RouteOutput: {
          Type: "Choice",
          Choices: [
            { Variable: "$.route", StringEquals: "pathA", Next: "PathA" },
            { Variable: "$.route", StringEquals: "pathB", Next: "PathB" }
          ],
          Default: "UnknownRoute"
        },
        PathA: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "PathAFn", "Payload.$": "$" }, End: true },
        PathB: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "PathBFn", "Payload.$": "$" }, End: true },
        UnknownRoute: {
          Type: "Fail",
          Error: "States.NoChoiceMatched",
          Cause: "No matching route found"
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        RoutingTask: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/RoutingFn" }, body: "@triggerBody()" },
          runAfter: {}
        },
        RouteOutput: {
          type: "Switch",
          expression: "@body('RoutingTask')?['route']",
          cases: {
            pathA: { case: "pathA", actions: { PathA: { type: "Function", inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/PathAFn" }, body: "@body('RoutingTask')" }, runAfter: {} } } },
            pathB: { case: "pathB", actions: { PathB: { type: "Function", inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/PathBFn" }, body: "@body('RoutingTask')" }, runAfter: {} } } }
          },
          default: {
            actions: {
              UnknownRoute: {
                type: "Terminate",
                inputs: { runStatus: "Failed", runError: { code: "States.NoChoiceMatched", message: "No matching route found" } },
                runAfter: {}
              }
            }
          },
          runAfter: { RoutingTask: ["Succeeded"] }
        }
      }
    })
  ));

  // ── 13. Retry + Catch on same task ───────────────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "RetryThenCatch",
      States: {
        RetryThenCatch: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ChainedFn", "Payload.$": "$" },
          Retry: [{ ErrorEquals: ["States.TaskFailed"], IntervalSeconds: 3, MaxAttempts: 3, BackoffRate: 2 }],
          Catch: [{ ErrorEquals: ["States.ALL"], Next: "FinalErrorHandler", ResultPath: "$.caughtError" }],
          End: true
        },
        FinalErrorHandler: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "FinalErrorFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        RetryThenCatch: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ChainedFn" }, body: "@triggerBody()" },
          retryPolicy: { type: "exponential", count: 3, interval: "PT3S", minimumInterval: "PT3S", maximumInterval: "PT1H" },
          runAfter: {}
        },
        FinalErrorHandler: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/FinalErrorFn" }, body: "@triggerBody()" },
          runAfter: { RetryThenCatch: ["Failed", "TimedOut", "Skipped"] }
        }
      }
    })
  ));

  // ── 14. States.DataLimitExceeded – note pattern ──────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "LargePayloadTask",
      States: {
        LargePayloadTask: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "LargePayloadFn", "Payload.$": "$" },
          Catch: [
            { ErrorEquals: ["States.DataLimitExceeded"], Next: "UseS3Fallback" },
            { ErrorEquals: ["States.ALL"],               Next: "GenericError" }
          ],
          End: true
        },
        UseS3Fallback: {
          Type: "Task",
          Resource: "arn:aws:states:::s3:putObject",
          Parameters: { Bucket: "large-payloads", "Key.$": "$.executionId", "Body.$": "$" },
          End: true
        },
        GenericError: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "GenericErrorFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        LargePayloadTask: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/LargePayloadFn" }, body: "@triggerBody()" },
          runAfter: {}
        },
        UseS3Fallback: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['azureblob']['connectionId']" } },
            method: "post",
            path: "/datasets/default/files",
            queries: { folderPath: "/large-payloads", name: "@{triggerBody()?['executionId']}" },
            body: "@triggerBody()"
          },
          runAfter: { LargePayloadTask: ["Failed"] }
        },
        GenericError: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/GenericErrorFn" }, body: "@triggerBody()" },
          runAfter: { LargePayloadTask: ["Failed", "TimedOut"] }
        }
      }
    })
  ));

  // ── 15. runAfter Skipped (Azure → AWS) ───────────────────────────────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        MaybeSkip: {
          type: "If",
          expression: { and: [{ equals: ["@triggerBody()?['skip']", true] }] },
          actions: {
            ConditionalWork: {
              type: "Function",
              inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/WorkFn" }, body: "@triggerBody()" },
              runAfter: {}
            }
          },
          else: { actions: {} },
          runAfter: {}
        },
        AlwaysRun: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/AlwaysFn" }, body: "@triggerBody()" },
          runAfter: { MaybeSkip: ["Succeeded", "Skipped"] }
        }
      }
    }),
    j({
      StartAt: "MaybeSkip",
      States: {
        MaybeSkip: {
          Type: "Choice",
          Choices: [
            { Variable: "$.skip", BooleanEquals: true, Next: "AlwaysRun" }
          ],
          Default: "ConditionalWork"
        },
        ConditionalWork: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "WorkFn", "Payload.$": "$" },
          Next: "AlwaysRun"
        },
        AlwaysRun: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "AlwaysFn", "Payload.$": "$" },
          End: true
        }
      }
    })
  ));

  // ── 16. Chained Catch (failed → fallback → final handler) ────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "PrimaryOperation",
      States: {
        PrimaryOperation: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "PrimaryFn", "Payload.$": "$" },
          Catch: [{ ErrorEquals: ["States.ALL"], Next: "FallbackOperation" }],
          Next: "Success"
        },
        FallbackOperation: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "FallbackFn", "Payload.$": "$" },
          Catch: [{ ErrorEquals: ["States.ALL"], Next: "NotifyFailure" }],
          Next: "Success"
        },
        Success: {
          Type: "Succeed"
        },
        NotifyFailure: {
          Type: "Task",
          Resource: "arn:aws:states:::sns:publish",
          Parameters: {
            TopicArn: "arn:aws:sns:us-east-1:123456789012:AlertTopic",
            "Message.$": "States.Format('Both primary and fallback failed for execution: {}', $$.Execution.Name)"
          },
          Next: "TerminateFailed"
        },
        TerminateFailed: {
          Type: "Fail",
          Error: "BothOperationsFailed",
          Cause: "Neither primary nor fallback operation succeeded"
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        PrimaryOperation: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/PrimaryFn" }, body: "@triggerBody()" },
          runAfter: {}
        },
        FallbackOperation: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/FallbackFn" }, body: "@triggerBody()" },
          runAfter: { PrimaryOperation: ["Failed", "TimedOut", "Skipped"] }
        },
        NotifyFailure: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['servicebus']['connectionId']" } },
            method: "post",
            path: "/@{encodeURIComponent('AlertTopic')}/messages",
            body: { ContentData: "@{base64(concat('Both primary and fallback failed for run: ', workflow()['run']['name']))}" }
          },
          runAfter: { FallbackOperation: ["Failed", "TimedOut", "Skipped"] }
        },
        TerminateFailed: {
          type: "Terminate",
          inputs: { runStatus: "Failed", runError: { code: "BothOperationsFailed", message: "Neither primary nor fallback operation succeeded" } },
          runAfter: { NotifyFailure: ["Succeeded"] }
        }
      }
    })
  ));

  // ── 17. Retry + DynamoDB (service integration) ───────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "WriteWithRetry",
      States: {
        WriteWithRetry: {
          Type: "Task",
          Resource: "arn:aws:states:::dynamodb:putItem",
          Parameters: {
            TableName: "AuditLog",
            Item: {
              id: { "S.$": "$.id" },
              event: { "S.$": "$.event" },
              timestamp: { "S.$": "$$.Execution.StartTime" }
            },
            ConditionExpression: "attribute_not_exists(id)"
          },
          Retry: [{ ErrorEquals: ["ConditionalCheckFailedException"], MaxAttempts: 0 },
                  { ErrorEquals: ["States.ALL"], IntervalSeconds: 1, MaxAttempts: 3, BackoffRate: 2 }],
          Catch: [{ ErrorEquals: ["States.ALL"], Next: "LogWriteFailure" }],
          End: true
        },
        LogWriteFailure: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "LogFailureFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        WriteWithRetry: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['documentdb']['connectionId']" } },
            method: "post",
            path: "/dbs/@{encodeURIComponent('AuditLog')}/colls/@{encodeURIComponent('audit')}/docs",
            body: {
              id: "@triggerBody()?['id']",
              event: "@triggerBody()?['event']",
              timestamp: "@utcNow()"
            }
          },
          retryPolicy: { type: "exponential", count: 3, interval: "PT1S", minimumInterval: "PT1S", maximumInterval: "PT1H" },
          runAfter: {}
        },
        LogWriteFailure: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/LogFailureFn" }, body: "@triggerBody()" },
          runAfter: { WriteWithRetry: ["Failed", "TimedOut"] }
        }
      }
    })
  ));

  return pairs;
}
