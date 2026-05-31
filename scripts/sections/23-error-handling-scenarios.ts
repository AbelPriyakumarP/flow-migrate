/**
 * Section 23 – Error handling scenarios:
 *   Retry with different services, Catch with ResultPath patterns,
 *   chained error fallbacks, timeout-specific handling, DLQ patterns,
 *   partial failure handling, circuit breaker simulation
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

export function errorHandlingScenarioPairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // ── Retry on DynamoDB operations ─────────────────────────────────────────
  const dynamoRetryOps: [string, "getItem" | "putItem" | "updateItem" | "deleteItem", string, number, number][] = [
    ["GetUserWithRetry",    "getItem",    "Users",     3, 2],
    ["PutOrderWithRetry",   "putItem",    "Orders",    5, 1],
    ["UpdateStatusRetry",   "updateItem", "Jobs",      4, 2],
    ["DeleteExpiredRetry",  "deleteItem", "Sessions",  2, 3],
    ["GetProductWithRetry", "getItem",    "Products",  3, 2],
    ["PutEventWithRetry",   "putItem",    "Events",    5, 1],
    ["UpdateInventoryRetry","updateItem", "Inventory", 4, 2],
  ];

  for (const [name, op, table, attempts, interval] of dynamoRetryOps) {
    const arn = `arn:aws:states:::dynamodb:${op}`;
    const params: Record<string, unknown> = op === "putItem"
      ? { TableName: table, Item: { id: { "S.$": "$.id" } } }
      : op === "updateItem"
      ? { TableName: table, Key: { id: { "S.$": "$.id" } }, UpdateExpression: "SET updatedAt = :ts", ExpressionAttributeValues: { ":ts": { "S.$": "$$.Execution.StartTime" } } }
      : { TableName: table, Key: { id: { "S.$": "$.id" } } };

    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: arn,
            Parameters: params,
            Retry: [{ ErrorEquals: ["States.ALL"], IntervalSeconds: interval, MaxAttempts: attempts, BackoffRate: 2 }],
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
            type: "ApiConnection",
            inputs: {
              host: { connection: { name: "@parameters('$connections')['documentdb']['connectionId']" } },
              method: op === "getItem" ? "get" : op === "deleteItem" ? "delete" : "post",
              path: op === "getItem" || op === "deleteItem"
                ? `/dbs/@{encodeURIComponent('${table}')}/colls/@{encodeURIComponent('${table.toLowerCase()}')}/docs/@{encodeURIComponent(triggerBody()?['id'])}`
                : `/dbs/@{encodeURIComponent('${table}')}/colls/@{encodeURIComponent('${table.toLowerCase()}')}/docs`,
              ...(op === "putItem" || op === "updateItem" ? { body: { id: "@triggerBody()?['id']", updatedAt: "@utcNow()" } } : {})
            },
            retryPolicy: { type: "exponential", count: attempts, interval: `PT${interval}S`, minimumInterval: `PT${interval}S`, maximumInterval: "PT1H" },
            runAfter: {}
          }
        }
      })
    ));
  }

  // ── Retry on HTTP operations ──────────────────────────────────────────────
  const httpRetryOps: [string, string, string, number, number][] = [
    ["CallWithExponentialRetry", "https://api.example.com/data",      "GET",  3, 5],
    ["PostWithRetry",            "https://api.example.com/submit",    "POST", 5, 2],
    ["PutWithRetry",             "https://api.example.com/update",    "PUT",  4, 3],
    ["DeleteWithRetry",          "https://api.example.com/remove",    "DELETE",2, 10],
    ["PatchWithRetry",           "https://api.example.com/patch",     "PATCH",3, 5],
    ["CallInternalWithRetry",    "https://internal.svc.local/process","POST", 5, 1],
  ];

  for (const [name, url, method, attempts, interval] of httpRetryOps) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::http:invoke",
            Parameters: { ApiEndpoint: url, Method: method },
            Retry: [{ ErrorEquals: ["States.ALL"], IntervalSeconds: interval, MaxAttempts: attempts, BackoffRate: 2 }],
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
            type: "Http",
            inputs: { method: method.toLowerCase(), uri: url },
            retryPolicy: { type: "exponential", count: attempts, interval: `PT${interval}S`, minimumInterval: `PT${interval}S`, maximumInterval: "PT1H" },
            runAfter: {}
          }
        }
      })
    ));
  }

  // ── Catch with ResultPath storing the error ───────────────────────────────
  const catchWithResultPathCases: [string, string, string, string][] = [
    ["ProcessPayment",   "OnPaymentError",    "$.paymentError",  "RecordFailure"],
    ["CallExternalAPI",  "OnAPIError",        "$.apiError",      "UseCache"],
    ["WriteToDatabase",  "OnDbError",         "$.dbError",       "QueueForRetry"],
    ["SendEmail",        "OnEmailError",      "$.emailError",    "AlertAdmin"],
    ["RunMigration",     "OnMigrationFail",   "$.migrationError","Rollback"],
    ["GenerateReport",   "OnReportError",     "$.reportError",   "SendPartial"],
    ["SyncInventory",    "OnSyncFail",        "$.syncError",     "UseStaleData"],
    ["UploadToStorage",  "OnUploadFail",      "$.uploadError",   "StoreLocally"],
  ];

  for (const [name, handler, resultPath, postHandler] of catchWithResultPathCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${name}Fn`, "Payload.$": "$" },
            Catch: [{ ErrorEquals: ["States.ALL"], Next: handler, ResultPath: resultPath }],
            End: true
          },
          [handler]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${handler}Fn`, "Payload.$": "$" },
            Next: postHandler
          },
          [postHandler]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${postHandler}Fn`, "Payload.$": "$" },
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
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${name}Fn` }, body: "@triggerBody()" },
            runAfter: {}
          },
          [handler]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${handler}Fn` }, body: "@triggerBody()" },
            runAfter: { [name]: ["Failed", "TimedOut", "Skipped"] }
          },
          [postHandler]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${postHandler}Fn` }, body: `@body('${handler}')` },
            runAfter: { [handler]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── DLQ (dead-letter) pattern: on failure, send to SQS ───────────────────
  const dlqCases: [string, string][] = [
    ["ProcessMessage",    "message-dlq"],
    ["HandleWebhook",     "webhook-dlq"],
    ["ProcessOrder",      "order-dlq"],
    ["SyncRecord",        "sync-dlq"],
    ["ExecuteJob",        "job-dlq"],
    ["ProcessEvent",      "event-dlq"],
  ];

  for (const [name, dlqName] of dlqCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${name}Fn`, "Payload.$": "$" },
            Retry: [{ ErrorEquals: ["States.ALL"], IntervalSeconds: 2, MaxAttempts: 3, BackoffRate: 2 }],
            Catch: [{ ErrorEquals: ["States.ALL"], Next: "SendToDLQ", ResultPath: "$.error" }],
            End: true
          },
          SendToDLQ: {
            Type: "Task",
            Resource: "arn:aws:states:::sqs:sendMessage",
            Parameters: {
              QueueUrl: `https://sqs.us-east-1.amazonaws.com/123456789012/${dlqName}`,
              "MessageBody.$": "$"
            },
            Next: "FailWithDLQ"
          },
          FailWithDLQ: {
            Type: "Fail",
            Error: "ProcessingFailed",
            Cause: "Message sent to dead-letter queue after exhausting retries"
          }
        }
      }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [name]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${name}Fn` }, body: "@triggerBody()" },
            retryPolicy: { type: "exponential", count: 3, interval: "PT2S", minimumInterval: "PT2S", maximumInterval: "PT1H" },
            runAfter: {}
          },
          SendToDLQ: {
            type: "ApiConnection",
            inputs: {
              host: { connection: { name: "@parameters('$connections')['servicebus']['connectionId']" } },
              method: "post",
              path: `/@{encodeURIComponent('${dlqName}')}/messages`,
              body: { ContentData: "@{base64(string(triggerBody()))}", ContentType: "application/json" }
            },
            runAfter: { [name]: ["Failed", "TimedOut", "Skipped"] }
          },
          FailWithDLQ: {
            type: "Terminate",
            inputs: { runStatus: "Failed", runError: { code: "ProcessingFailed", message: "Message sent to dead-letter queue after exhausting retries" } },
            runAfter: { SendToDLQ: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── Timeout-specific handling ─────────────────────────────────────────────
  const timeoutHandlerCases: [string, number, string][] = [
    ["LongRunningJob",     300,  "CancelAndNotify"],
    ["ExternalAPICall",    30,   "UseStaleCache"],
    ["DatabaseQuery",      60,   "QueryTimeout"],
    ["FileProcessing",     120,  "AbortProcessing"],
    ["MLInference",        600,  "UseDefaultPrediction"],
    ["ReportGeneration",   180,  "ReturnPartialReport"],
    ["DataMigration",      900,  "PauseMigration"],
    ["BackgroundSync",     240,  "MarkSyncFailed"],
  ];

  for (const [name, timeoutSecs, handlerFn] of timeoutHandlerCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${name}Fn`, "Payload.$": "$" },
            TimeoutSeconds: timeoutSecs,
            Catch: [{ ErrorEquals: ["States.Timeout", "States.HeartbeatTimeout"], Next: handlerFn, ResultPath: "$.timeoutError" }],
            End: true
          },
          [handlerFn]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${handlerFn}Fn`, "Payload.$": "$" },
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
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${name}Fn` }, body: "@triggerBody()" },
            operationOptions: "DisableAsyncPattern",
            runAfter: {}
          },
          [handlerFn]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${handlerFn}Fn` }, body: "@triggerBody()" },
            runAfter: { [name]: ["TimedOut"] }
          }
        }
      })
    ));
  }

  // ── Specific error code catch ─────────────────────────────────────────────
  const specificErrorCases: [string, string, string, string][] = [
    ["CallPaymentGateway",  "PaymentDeclinedError",   "HandleDeclined",      "Abort"],
    ["ReadFromDB",          "ItemNotFoundException",  "CreateDefaultRecord", "Continue"],
    ["ValidateSchema",      "SchemaValidationError",  "RejectWithReason",    "Abort"],
    ["AcquireLock",         "LockConflictException",  "WaitAndRetryLock",    "Abort"],
    ["AllocateResource",    "InsufficientCapacity",   "ScaleAndRetry",       "Abort"],
    ["ApplyMigration",      "MigrationConflict",      "Rollback",            "Abort"],
  ];

  for (const [name, errorCode, handler, defaultHandler] of specificErrorCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${name}Fn`, "Payload.$": "$" },
            Catch: [
              { ErrorEquals: [errorCode], Next: handler, ResultPath: "$.specificError" },
              { ErrorEquals: ["States.ALL"], Next: defaultHandler, ResultPath: "$.generalError" }
            ],
            End: true
          },
          [handler]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${handler}Fn`, "Payload.$": "$" },
            End: true
          },
          [defaultHandler]: {
            Type: "Fail",
            Error: "UnhandledError",
            Cause: "An unhandled error occurred"
          }
        }
      }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [name]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${name}Fn` }, body: "@triggerBody()" },
            runAfter: {}
          },
          [handler]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${handler}Fn` }, body: "@triggerBody()" },
            runAfter: { [name]: ["Failed"] }
          },
          [defaultHandler]: {
            type: "Terminate",
            inputs: { runStatus: "Failed", runError: { code: "UnhandledError", message: "An unhandled error occurred" } },
            runAfter: { [name]: ["TimedOut", "Skipped"] }
          }
        }
      })
    ));
  }

  return pairs;
}
