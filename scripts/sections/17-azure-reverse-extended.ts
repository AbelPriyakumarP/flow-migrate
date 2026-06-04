/**
 * Section 17 – Extended Azure → AWS reverse direction mappings:
 *   More Http, ApiConnection, Switch, Foreach, Scope, Compose, ParseJson,
 *   complex runAfter patterns, Terminate, Wait, variable-dependent flows
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

export function azureReverseExtendedPairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // ── Azure Http → AWS http:invoke (more methods and auth patterns) ─────────
  const httpReverseCases: [string, string, string, string][] = [
    ["CallGraphAPI",  "GET",    "https://graph.microsoft.com/v1.0/me",    "Bearer @{parameters('graphToken')}"],
    ["PostToSlack",   "POST",   "https://hooks.slack.com/services/T/B/X", ""],
    ["PutToRestAPI",  "PUT",    "https://api.internal.com/resources/update","Bearer @{parameters('apiKey')}"],
    ["PatchRecord",   "PATCH",  "https://api.internal.com/records/patch",  "Bearer @{parameters('apiKey')}"],
    ["DeleteResource","DELETE", "https://api.internal.com/resources/clean", "Bearer @{parameters('apiKey')}"],
    ["HeadCheck",     "HEAD",   "https://api.health.com/ping",             ""],
    ["CallWebhook",   "POST",   "https://webhook.site/unique-id",          ""],
    ["FetchFeed",     "GET",    "https://rss.example.com/feed",            ""],
  ];

  for (const [name, method, url, auth] of httpReverseCases) {
    const awsParams: Record<string, unknown> = { ApiEndpoint: url, Method: method };
    const azureInputs: Record<string, unknown> = { method: method.toLowerCase(), uri: url };
    if (auth) {
      awsParams.Authentication = { Type: "BEARER_TOKEN", BearerToken: auth };
      azureInputs.authentication = { type: "Raw", value: auth };
    }

    pairs.push(pair("azure-to-aws",
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [name]: {
            type: "Http",
            inputs: azureInputs,
            runAfter: {}
          }
        }
      }),
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::http:invoke",
            Parameters: awsParams,
            End: true
          }
        }
      })
    ));
  }

  // ── Azure ApiConnection (Service Bus) → AWS SQS sendMessage ──────────────
  const sbToSqsCases: [string, string][] = [
    ["SendToOrderQueue",     "order-processing-queue"],
    ["SendToPaymentQueue",   "payment-queue"],
    ["SendToNotifyQueue",    "notification-queue"],
    ["SendToDeadLetter",     "dead-letter-queue"],
    ["SendToRetryQueue",     "retry-queue"],
    ["SendToPriorityQueue",  "priority-queue"],
    ["SendToAnalyticsQueue", "analytics-queue"],
    ["SendToAuditQueue",     "audit-queue"],
  ];

  for (const [name, queueName] of sbToSqsCases) {
    pairs.push(pair("azure-to-aws",
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [name]: {
            type: "ApiConnection",
            inputs: {
              host: { connection: { name: "@parameters('$connections')['servicebus']['connectionId']" } },
              method: "post",
              path: `/@{encodeURIComponent('${queueName}')}/messages`,
              body: { ContentData: "@{base64(string(triggerBody()))}", ContentType: "application/json" }
            },
            runAfter: {}
          }
        }
      }),
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::sqs:sendMessage",
            Parameters: {
              QueueUrl: `https://sqs.us-east-1.amazonaws.com/123456789012/${queueName}`,
              "MessageBody.$": "$"
            },
            End: true
          }
        }
      })
    ));
  }

  // ── Azure ApiConnection (Event Grid) → AWS EventBridge putEvents ──────────
  const egToEbCases: [string, string, string][] = [
    ["PublishToOrderBus",   "order-events",   "Order.Created"],
    ["PublishToAlertBus",   "alert-events",   "Alert.Triggered"],
    ["PublishToUserBus",    "user-events",    "User.Updated"],
    ["PublishToSystemBus",  "system-events",  "System.Heartbeat"],
    ["PublishToAuditBus",   "audit-events",   "Audit.Written"],
    ["PublishToMetricsBus", "metric-events",  "Metric.Recorded"],
  ];

  for (const [name, topicName, eventType] of egToEbCases) {
    pairs.push(pair("azure-to-aws",
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [name]: {
            type: "ApiConnection",
            inputs: {
              host: { connection: { name: "@parameters('$connections')['eventgrid']['connectionId']" } },
              method: "post",
              path: `/subscriptions/@{encodeURIComponent(parameters('subscriptionId'))}/resourceGroups/@{encodeURIComponent(parameters('resourceGroupName'))}/providers/Microsoft.EventGrid/topics/@{encodeURIComponent('${topicName}')}/events`,
              body: [{ id: "@{guid()}", subject: eventType, data: "@triggerBody()", eventType: eventType, dataVersion: "1.0", eventTime: "@utcNow()" }]
            },
            runAfter: {}
          }
        }
      }),
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::events:putEvents",
            Parameters: {
              Entries: [{
                EventBusName: `arn:aws:events:us-east-1:123456789012:event-bus/${topicName}`,
                Source: topicName,
                DetailType: eventType,
                "Detail.$": "$"
              }]
            },
            End: true
          }
        }
      })
    ));
  }

  // ── Azure ApiConnection (Blob Storage) → AWS S3 ──────────────────────────
  const blobToS3Cases: [string, string, "get" | "put" | "delete"][] = [
    ["ReadConfig",          "config-files-container",  "get"],
    ["WriteOutput",         "output-container",        "put"],
    ["ReadTemplate",        "templates-container",     "get"],
    ["WriteReport",         "reports-container",       "put"],
    ["DeleteTempBlob",      "temp-container",          "delete"],
    ["ReadInputData",       "input-data-container",    "get"],
    ["WriteResultBlob",     "results-container",       "put"],
  ];

  for (const [name, container, method] of blobToS3Cases) {
    const awsResource = method === "get" ? "arn:aws:states:::s3:getObject"
      : method === "put" ? "arn:aws:states:::s3:putObject"
      : "arn:aws:states:::s3:deleteObject";

    const awsParams: Record<string, unknown> = method === "put"
      ? { Bucket: container, "Key.$": "$.fileName", "Body.$": "$.content" }
      : { Bucket: container, "Key.$": "$.fileName" };

    const azurePath = method === "get"
      ? `/v2/datasets/@{encodeURIComponent(encodeURIComponent('${container}'))}/files/@{encodeURIComponent(encodeURIComponent(triggerBody()?['fileName']))}/content`
      : method === "put"
      ? `/v2/datasets/@{encodeURIComponent(encodeURIComponent('${container}'))}/files/@{encodeURIComponent(encodeURIComponent(triggerBody()?['fileName']))}`
      : `/v2/datasets/@{encodeURIComponent(encodeURIComponent('${container}'))}/files/@{encodeURIComponent(encodeURIComponent(triggerBody()?['fileName']))}`;

    pairs.push(pair("azure-to-aws",
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [name]: {
            type: "ApiConnection",
            inputs: {
              host: { connection: { name: "@parameters('$connections')['azureblob']['connectionId']" } },
              method: method,
              path: azurePath,
              ...(method === "put" ? { body: "@triggerBody()?['content']" } : {})
            },
            runAfter: {}
          }
        }
      }),
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: awsResource,
            Parameters: awsParams,
            End: true
          }
        }
      })
    ));
  }

  // ── Azure Compose → AWS Pass with Parameters ──────────────────────────────
  const composeToPassCases: [string, Record<string, string>][] = [
    ["BuildPayload",    { requestId: "@{guid()}", timestamp: "@utcNow()", source: "logic-app", body: "@triggerBody()" }],
    ["MergeContext",    { original: "@triggerBody()", metadata: "@{body('GetMetadata')}", processed: "true" }],
    ["ShapeOutput",     { id: "@{triggerBody()?['id']}", status: "completed", resultData: "@{body('Transform')}" }],
    ["PrepareRequest",  { endpoint: "@{parameters('apiUrl')}", method: "POST", payload: "@triggerBody()" }],
    ["BuildAuditRecord",{ actor: "@{triggerBody()?['userId']}", action: "@{triggerBody()?['action']}", ts: "@utcNow()" }],
    ["ConstructEvent",  { type: "workflow.completed", data: "@triggerBody()", version: "1.0", id: "@{guid()}" }],
  ];

  for (const [name, inputs] of composeToPassCases) {
    // For AWS Pass, map Azure expressions to static/injected values
    const awsParams: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(inputs)) {
      if (v.startsWith("@triggerBody()")) {
        awsParams[`${k}.$`] = "$";
      } else if (v.startsWith("@{guid()}")) {
        awsParams[k] = "auto-generated-id";
      } else if (v.startsWith("@utcNow()")) {
        awsParams[`${k}.$`] = "$$.Execution.StartTime";
      } else if (v.startsWith("@{parameters(")) {
        awsParams[k] = v;
      } else {
        awsParams[k] = v;
      }
    }

    pairs.push(pair("azure-to-aws",
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [name]: {
            type: "Compose",
            inputs: inputs,
            runAfter: {}
          },
          UseComposed: {
            type: "Function",
            inputs: { function: { id: "/sub/rg/app/functions/UseComposedFn" }, body: `@outputs('${name}')` },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      }),
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Pass",
            Parameters: awsParams,
            Next: "UseComposed"
          },
          UseComposed: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: "UseComposedFn", "Payload.$": "$" },
            End: true
          }
        }
      })
    ));
  }

  // ── Azure Switch → AWS Choice (multi-branch) ──────────────────────────────
  const switchReverseCases: [string, string, [string, string, string][]][] = [
    ["RouteByPriority", "@triggerBody()?['priority']",
      [["high", "HandleHighPriority", "HighPriorityFn"], ["medium", "HandleMediumPriority", "MediumFn"], ["low", "HandleLowPriority", "LowFn"]]],
    ["RouteByRegion", "@triggerBody()?['region']",
      [["us-east", "HandleUSEast", "USEastFn"], ["us-west", "HandleUSWest", "USWestFn"], ["eu-west", "HandleEUWest", "EUWestFn"]]],
    ["RouteByType", "@triggerBody()?['type']",
      [["create", "HandleCreate", "CreateFn"], ["update", "HandleUpdate", "UpdateFn"], ["delete", "HandleDelete", "DeleteFn"]]],
    ["RouteByStatus", "@triggerBody()?['status']",
      [["active", "HandleActive", "ActiveFn"], ["inactive", "HandleInactive", "InactiveFn"], ["pending", "HandlePending", "PendingFn"]]],
  ];

  for (const [switchName, expression, cases] of switchReverseCases) {
    const azureActions: Record<string, unknown> = {
      [switchName]: {
        type: "Switch",
        expression: expression,
        cases: Object.fromEntries(cases.map(([val, actionName]) => [
          val,
          {
            case: val,
            actions: {
              [actionName]: {
                type: "Function",
                inputs: { function: { id: `/sub/rg/app/functions/${actionName.replace("Handle", "")}Fn` }, body: "@triggerBody()" },
                runAfter: {}
              }
            }
          }
        ])),
        default: {
          actions: {
            DefaultAction: {
              type: "Function",
              inputs: { function: { id: "/sub/rg/app/functions/DefaultActionFn" }, body: "@triggerBody()" },
              runAfter: {}
            }
          }
        },
        runAfter: {}
      }
    };

    const awsVariable = expression.replace("@triggerBody()?['", "$.").replace("']", "");
    const awsChoices = cases.map(([val, , nextFn]) => ({
      Variable: awsVariable,
      StringEquals: val,
      Next: nextFn.replace("Handle", "")
    }));

    const awsStates: Record<string, unknown> = {
      [switchName]: {
        Type: "Choice",
        Choices: awsChoices,
        Default: "DefaultAction"
      },
      DefaultAction: {
        Type: "Task",
        Resource: "arn:aws:states:::lambda:invoke",
        Parameters: { FunctionName: "DefaultActionFn", "Payload.$": "$" },
        End: true
      }
    };

    for (const [, , fnName] of cases) {
      const stateName = fnName.replace("Handle", "").replace("Fn", "");
      awsStates[stateName] = {
        Type: "Task",
        Resource: "arn:aws:states:::lambda:invoke",
        Parameters: { FunctionName: fnName, "Payload.$": "$" },
        End: true
      };
    }

    pairs.push(pair("azure-to-aws",
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: azureActions
      }),
      j({
        StartAt: switchName,
        States: awsStates
      })
    ));
  }

  // ── Azure Function with retryPolicy → AWS Task with Retry ────────────────
  const functionRetryReverseCases: [string, string, number, string, string][] = [
    ["CallWithExponentialBackoff", "ProcessJobFn",    5, "PT2S", "PT1H"],
    ["CallWithFixedRetry",         "SendEmailFn",     3, "PT5S", "PT5S"],
    ["CallWithLongRetry",          "SyncDataFn",      4, "PT30S","PT5M"],
    ["CallWithShortRetry",         "CheckStatusFn",   10,"PT1S", "PT30S"],
    ["CallWithMaxRetry",           "CriticalTaskFn",  8, "PT10S","PT10M"],
    ["CallWithMinRetry",           "QuickCheckFn",    2, "PT3S", "PT1M"],
  ];

  for (const [name, fnName, count, interval, maxInterval] of functionRetryReverseCases) {
    const isFixed = interval === maxInterval;
    const intervalSec = parseInt(interval.replace("PT", "").replace("S", "").replace("M", "")) *
      (interval.endsWith("M") ? 60 : 1);
    const maxDelaySec = maxInterval === "PT1H" ? 3600
      : parseInt(maxInterval.replace("PT", "").replace("S", "").replace("M", "")) *
        (maxInterval.endsWith("M") ? 60 : 1);

    pairs.push(pair("azure-to-aws",
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [name]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${fnName}` }, body: "@triggerBody()" },
            retryPolicy: isFixed
              ? { type: "fixed", count: count, interval: interval }
              : { type: "exponential", count: count, interval: interval, minimumInterval: interval, maximumInterval: maxInterval },
            runAfter: {}
          }
        }
      }),
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: fnName, "Payload.$": "$" },
            Retry: [{
              ErrorEquals: ["States.ALL"],
              IntervalSeconds: intervalSec,
              MaxAttempts: count,
              BackoffRate: isFixed ? 1 : 2,
              ...(isFixed ? {} : { MaxDelaySeconds: maxDelaySec })
            }],
            End: true
          }
        }
      })
    ));
  }

  return pairs;
}
