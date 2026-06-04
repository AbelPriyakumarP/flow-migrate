/**
 * Section 11 – Advanced error handling: retry/catch on all service types,
 * chained error paths, and Azure runAfter multi-status patterns.
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

// Build a task with catch, mapping to Azure runAfter
function taskWithCatch(
  stateName: string,
  resource: string,
  params: Record<string, unknown>,
  errorEquals: string[],
  handlerName: string,
  direction: "aws-to-azure" | "azure-to-aws" = "aws-to-azure"
): TrainingPair {
  const runAfterStatuses = errorEquals.includes("States.ALL")
    ? ["Failed", "TimedOut", "Skipped"]
    : errorEquals.includes("States.Timeout") || errorEquals.includes("States.HeartbeatTimeout")
    ? ["TimedOut"]
    : ["Failed"];

  return pair("aws-to-azure",
    j({
      StartAt: stateName,
      States: {
        [stateName]: {
          Type: "Task", Resource: resource, Parameters: params,
          Catch: [{ ErrorEquals: errorEquals, Next: handlerName }],
          End: true
        },
        [handlerName]: {
          Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: `${handlerName}Fn`, "Payload.$": "$" }, End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        [stateName]: {
          type: "Function",
          inputs: { function: { id: `/sub/rg/app/functions/${stateName}Fn` }, body: "@triggerBody()" },
          runAfter: {}
        },
        [handlerName]: {
          type: "Function",
          inputs: { function: { id: `/sub/rg/app/functions/${handlerName}Fn` }, body: "@triggerBody()" },
          runAfter: { [stateName]: runAfterStatuses }
        }
      }
    })
  );
}

// Build Azure runAfter multi-status → AWS Catch
function azureRunAfterPair(
  mainAction: string,
  handlerAction: string,
  statuses: string[],
  expectedErrorEquals: string[]
): TrainingPair {
  return pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        [mainAction]: {
          type: "Function",
          inputs: { function: { id: `/sub/rg/app/functions/${mainAction}Fn` }, body: "@triggerBody()" },
          runAfter: {}
        },
        [handlerAction]: {
          type: "Function",
          inputs: { function: { id: `/sub/rg/app/functions/${handlerAction}Fn` }, body: "@triggerBody()" },
          runAfter: { [mainAction]: statuses }
        }
      }
    }),
    j({
      StartAt: mainAction,
      States: {
        [mainAction]: {
          Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: `${mainAction}Fn`, "Payload.$": "$" },
          Catch: [{ ErrorEquals: expectedErrorEquals, Next: handlerAction }],
          End: true
        },
        [handlerAction]: {
          Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: `${handlerAction}Fn`, "Payload.$": "$" }, End: true
        }
      }
    })
  );
}

export function errorHandlingAdvancedPairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // ── Catch on Lambda with various error sets ──────────────────────────────
  const lambdaParams = { FunctionName: "MainFn", "Payload.$": "$" };
  const lambdaArn = "arn:aws:states:::lambda:invoke";

  const catchConfigs: [string, string[], string][] = [
    ["Task_CatchAll",            ["States.ALL"],                        "GenericHandler"],
    ["Task_CatchTimeout",        ["States.Timeout"],                    "TimeoutHandler"],
    ["Task_CatchTaskFailed",     ["States.TaskFailed"],                 "TaskFailedHandler"],
    ["Task_CatchHeartbeat",      ["States.HeartbeatTimeout"],           "HeartbeatHandler"],
    ["Task_CatchPermissions",    ["States.Permissions"],                "PermissionsHandler"],
    ["Task_CatchRuntime",        ["States.Runtime"],                    "RuntimeHandler"],
    ["Task_CatchCustom",         ["CustomError"],                       "CustomErrorHandler"],
    ["Task_CatchMulti",          ["States.Timeout","States.TaskFailed"],"MultiErrorHandler"],
    ["Task_CatchDataLimit",      ["States.DataLimitExceeded"],          "DataLimitHandler"],
    ["Task_CatchBranchFailed",   ["States.BranchFailed"],               "BranchFailHandler"],
  ];

  for (const [name, errors, handler] of catchConfigs) {
    pairs.push(taskWithCatch(name, lambdaArn, lambdaParams, errors, handler));
  }

  // ── Catch on DynamoDB ────────────────────────────────────────────────────
  const dynParams = { TableName: "Items", Key: { id: { "S.$": "$.id" } } };
  const dynArn    = "arn:aws:states:::dynamodb:getItem";

  const dynCatches: [string, string[], string][] = [
    ["DDB_CatchAll",         ["States.ALL"],       "DDBFallback"],
    ["DDB_CatchTaskFailed",  ["States.TaskFailed"],"DDBErrorLog"],
  ];

  for (const [name, errors, handler] of dynCatches) {
    pairs.push(taskWithCatch(name, dynArn, dynParams, errors, handler));
  }

  // ── Catch on HTTP invoke ─────────────────────────────────────────────────
  const httpParams = { ApiEndpoint: "https://api.example.com/data", Method: "GET" };
  const httpArn    = "arn:aws:states:::http:invoke";

  const httpCatches: [string, string[], string][] = [
    ["HTTP_CatchAll",     ["States.ALL"],       "HttpFallback"],
    ["HTTP_CatchTimeout", ["States.Timeout"],   "HttpTimeoutHandler"],
  ];

  for (const [name, errors, handler] of httpCatches) {
    pairs.push(taskWithCatch(name, httpArn, httpParams, errors, handler));
  }

  // ── Catch on SNS publish ─────────────────────────────────────────────────
  const snsParams = { TopicArn: "arn:aws:sns:us-east-1:123456789012:MyTopic", "Message.$": "$.message" };
  const snsArn    = "arn:aws:states:::sns:publish";
  pairs.push(taskWithCatch("SNS_CatchAll",       snsArn, snsParams, ["States.ALL"],      "SNSFallback"));
  pairs.push(taskWithCatch("SNS_CatchTaskFailed",snsArn, snsParams, ["States.TaskFailed"],"SNSErrorLog"));

  // ── Catch on SQS sendMessage ─────────────────────────────────────────────
  const sqsParams = { QueueUrl: "https://sqs.us-east-1.amazonaws.com/123456789012/MyQueue", "MessageBody.$": "$" };
  const sqsArn    = "arn:aws:states:::sqs:sendMessage";
  pairs.push(taskWithCatch("SQS_CatchAll",       sqsArn, sqsParams, ["States.ALL"],      "SQSFallback"));
  pairs.push(taskWithCatch("SQS_CatchTaskFailed",sqsArn, sqsParams, ["States.TaskFailed"],"SQSErrorLog"));

  // ── Catch on S3 putObject ────────────────────────────────────────────────
  const s3Params = { Bucket: "my-bucket", Key: "output.json", "Body.$": "$" };
  const s3Arn    = "arn:aws:states:::s3:putObject";
  pairs.push(taskWithCatch("S3_CatchAll",         s3Arn, s3Params, ["States.ALL"],        "S3Fallback"));
  pairs.push(taskWithCatch("S3_CatchPermissions", s3Arn, s3Params, ["States.Permissions"],"S3PermissionsHandler"));

  // ── Azure runAfter → AWS Catch (reverse) ─────────────────────────────────
  const runAfterConfigs: [string, string, string[], string[]][] = [
    ["CallApi",    "OnApiError",    ["Failed"],              ["States.TaskFailed"]],
    ["FetchData",  "OnFetchTimeout",["TimedOut"],            ["States.Timeout"]],
    ["WriteDB",    "OnWriteError",  ["Failed","TimedOut"],   ["States.ALL"]],
    ["SendEmail",  "OnEmailFail",   ["Failed","Skipped"],    ["States.ALL"]],
    ["ProcessJob", "OnJobFailed",   ["Failed","TimedOut","Skipped"],["States.ALL"]],
    ["CallLambda", "OnAnyError",    ["Failed"],              ["States.TaskFailed"]],
    ["ReadFile",   "OnReadTimeout", ["TimedOut"],            ["States.HeartbeatTimeout"]],
    ["PostEvent",  "OnPostFailed",  ["Failed","TimedOut"],   ["States.ALL"]],
    ["RunQuery",   "OnQueryError",  ["Failed"],              ["States.Runtime"]],
    ["ApplyPatch", "OnPatchFailed", ["Failed"],              ["States.Permissions"]],
  ];

  for (const [main, handler, statuses, errors] of runAfterConfigs) {
    pairs.push(azureRunAfterPair(main, handler, statuses, errors));
  }

  // ── Retry combinations (different error codes) ───────────────────────────
  const retryErrorCodes: [string, string[]][] = [
    ["RetryOnAll",       ["States.ALL"]],
    ["RetryOnTimeout",   ["States.Timeout"]],
    ["RetryOnTaskFail",  ["States.TaskFailed"]],
    ["RetryOnHeartbeat", ["States.HeartbeatTimeout"]],
    ["RetryOnCustom",    ["ThrottlingException"]],
    ["RetryOnMulti",     ["States.TaskFailed","ThrottlingException"]],
  ];

  for (const [name, errors] of retryErrorCodes) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${name}Fn`, "Payload.$": "$" },
            Retry: [{ ErrorEquals: errors, IntervalSeconds: 3, MaxAttempts: 4, BackoffRate: 2 }],
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
            retryPolicy: { type: "exponential", count: 4, interval: "PT3S", minimumInterval: "PT3S", maximumInterval: "PT1H" },
            runAfter: {}
          }
        }
      })
    ));
  }

  // ── Retry with MaxDelaySeconds variations ────────────────────────────────
  const maxDelayCases: [string, number, number, number][] = [
    ["CappedRetry30s",  3, 1,  30],
    ["CappedRetry60s",  5, 2,  60],
    ["CappedRetry120s", 8, 1, 120],
    ["CappedRetry300s", 4, 5, 300],
    ["CappedRetry600s", 6, 3, 600],
  ];

  for (const [name, attempts, interval, maxDelay] of maxDelayCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${name}Fn`, "Payload.$": "$" },
            Retry: [{ ErrorEquals: ["States.ALL"], IntervalSeconds: interval, MaxAttempts: attempts, BackoffRate: 2, MaxDelaySeconds: maxDelay }],
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
            retryPolicy: { type: "exponential", count: attempts, interval: `PT${interval}S`, minimumInterval: `PT${interval}S`, maximumInterval: `PT${maxDelay}S` },
            runAfter: {}
          }
        }
      })
    ));
  }

  return pairs;
}
