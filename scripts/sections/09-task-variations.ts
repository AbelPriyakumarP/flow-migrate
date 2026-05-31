/**
 * Section 09 – Task state variations: multiple services, patterns, combinations
 * Programmatically generates variations covering all documented ARN integrations.
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

// Helper: build a minimal AWS→Azure pair for a single lambda task with N retry attempts
function lambdaWithRetry(fnName: string, attempts: number, interval: number, backoff: number): TrainingPair {
  const retryType = backoff > 1 ? "exponential" : "fixed";
  const awsJson = {
    StartAt: fnName,
    States: {
      [fnName]: {
        Type: "Task",
        Resource: "arn:aws:states:::lambda:invoke",
        Parameters: { FunctionName: `${fnName}Fn`, "Payload.$": "$" },
        Retry: [{ ErrorEquals: ["States.ALL"], IntervalSeconds: interval, MaxAttempts: attempts, BackoffRate: backoff }],
        End: true
      }
    }
  };
  const azureJson = {
    $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
    contentVersion: "1.0.0.0",
    triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
    actions: {
      [fnName]: {
        type: "Function",
        inputs: {
          function: { id: `/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/${fnName}Fn` },
          body: "@triggerBody()"
        },
        retryPolicy: retryType === "exponential"
          ? { type: "exponential", count: attempts, interval: `PT${interval}S`, minimumInterval: `PT${interval}S`, maximumInterval: "PT1H" }
          : { type: "fixed",       count: attempts, interval: `PT${interval}S` },
        runAfter: {}
      }
    }
  };
  return pair("aws-to-azure", j(awsJson), j(azureJson));
}

// Helper: HTTP method variations
function httpMethodPair(method: string, endpoint: string, bodyFields: string[]): TrainingPair {
  const awsParams: Record<string, unknown> = {
    ApiEndpoint: endpoint,
    Method: method,
    Headers: { "Content-Type": "application/json" }
  };
  const azureInputs: Record<string, unknown> = {
    method: method.toLowerCase(),
    uri: endpoint,
    headers: { "Content-Type": "application/json" }
  };
  if (bodyFields.length > 0 && ["POST","PUT","PATCH"].includes(method)) {
    const reqBody: Record<string, string> = {};
    const azBody: Record<string, string> = {};
    for (const f of bodyFields) {
      reqBody[f] = `$.${f}`;
      azBody[f] = `@triggerBody()?['${f}']`;
    }
    awsParams.RequestBody = Object.fromEntries(Object.entries(reqBody).map(([k,v])=>[k, {$: v} as unknown]));
    azureInputs.body = azBody;
  }

  const stateName = `Call_${method}_${endpoint.split("/").pop() || "Api"}`;
  return pair("aws-to-azure",
    j({ StartAt: stateName, States: { [stateName]: { Type: "Task", Resource: "arn:aws:states:::http:invoke", Parameters: awsParams, End: true } } }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: { [stateName]: { type: "Http", inputs: azureInputs, runAfter: {} } }
    })
  );
}

// Helper: DynamoDB operation → Cosmos DB
function dynamoOpPair(
  op: "getItem" | "putItem" | "deleteItem",
  tableName: string,
  keyField: string
): TrainingPair {
  const arn = `arn:aws:states:::dynamodb:${op}`;
  const stateName = `${op.charAt(0).toUpperCase()}${op.slice(1)}_${tableName}`;

  const awsParams: Record<string, unknown> = { TableName: tableName };
  if (op === "getItem" || op === "deleteItem") {
    awsParams.Key = { [keyField]: { "S.$": `$.${keyField}` } };
  } else if (op === "putItem") {
    awsParams.Item = { [keyField]: { "S.$": `$.${keyField}` }, updatedAt: { "S.$": "$$.Execution.StartTime" } };
  }

  const httpMethod = op === "getItem" ? "get" : op === "deleteItem" ? "delete" : "post";
  const path = op === "getItem" || op === "deleteItem"
    ? `/dbs/@{encodeURIComponent('${tableName}')}/colls/@{encodeURIComponent('${tableName.toLowerCase()}')}/docs/@{encodeURIComponent(triggerBody()?['${keyField}'])}`
    : `/dbs/@{encodeURIComponent('${tableName}')}/colls/@{encodeURIComponent('${tableName.toLowerCase()}')}/docs`;

  const azureBody: Record<string, unknown> = op === "putItem"
    ? { id: `@triggerBody()?['${keyField}']`, [keyField]: `@triggerBody()?['${keyField}']`, updatedAt: "@utcNow()" }
    : undefined as unknown as Record<string,unknown>;

  const azureAction: Record<string, unknown> = {
    type: "ApiConnection",
    inputs: {
      host: { connection: { name: "@parameters('$connections')['documentdb']['connectionId']" } },
      method: httpMethod,
      path,
      ...(azureBody ? { body: azureBody } : {})
    },
    runAfter: {}
  };

  return pair("aws-to-azure",
    j({ StartAt: stateName, States: { [stateName]: { Type: "Task", Resource: arn, Parameters: awsParams, End: true } } }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: { [stateName]: azureAction }
    })
  );
}

// Helper: SNS topic publish variation
function snsPair(topicName: string, messageExpr: string): TrainingPair {
  return pair("aws-to-azure",
    j({
      StartAt: `Notify_${topicName}`,
      States: {
        [`Notify_${topicName}`]: {
          Type: "Task",
          Resource: "arn:aws:states:::sns:publish",
          Parameters: {
            TopicArn: `arn:aws:sns:us-east-1:123456789012:${topicName}`,
            "Message.$": messageExpr
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
        [`Notify_${topicName}`]: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['servicebus']['connectionId']" } },
            method: "post",
            path: `/@{encodeURIComponent('${topicName}')}/messages`,
            body: { ContentData: `@{base64(string(triggerBody()?['${messageExpr.replace("$.","")}']})}` }
          },
          runAfter: {}
        }
      }
    })
  );
}

// Helper: SQS queue send variation
function sqsPair(queueName: string): TrainingPair {
  return pair("aws-to-azure",
    j({
      StartAt: `Enqueue_${queueName}`,
      States: {
        [`Enqueue_${queueName}`]: {
          Type: "Task",
          Resource: "arn:aws:states:::sqs:sendMessage",
          Parameters: {
            QueueUrl: `https://sqs.us-east-1.amazonaws.com/123456789012/${queueName}`,
            "MessageBody.$": "$"
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
        [`Enqueue_${queueName}`]: {
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
    })
  );
}

export function taskVariationPairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // Lambda retry variations (attempts × interval × backoff)
  const retryConfigs: [string, number, number, number][] = [
    ["ProcessOrder",    3, 1,  2.0],
    ["ValidateData",    5, 2,  1.5],
    ["SendEmail",       2, 5,  1.0],
    ["CallExternalAPI", 4, 3,  2.0],
    ["UpdateRecord",    3, 10, 1.0],
    ["GenerateReport",  6, 1,  2.0],
    ["ArchiveData",     2, 30, 2.0],
    ["SyncCatalog",     5, 5,  1.5],
    ["PublishResults",  3, 2,  1.0],
    ["CleanupTemp",     2, 1,  2.0],
    ["NotifyUsers",     4, 2,  2.0],
    ["IndexDocument",   3, 3,  2.0],
    ["TransformPayload",5, 1,  1.5],
    ["AggregateMetrics",2, 60, 2.0],
    ["BackfillRecords", 3, 5,  2.0],
    ["MigrateSchema",   1, 30, 1.0],
    ["ResizeImage",     3, 2,  2.0],
    ["CompressFiles",   2, 5,  1.0],
    ["SendWebhook",     5, 1,  2.0],
    ["PollJobStatus",   10,5,  1.5],
    ["RefreshToken",    3, 1,  2.0],
    ["SyncUserData",    4, 3,  2.0],
    ["ValidateAddress", 2, 2,  1.0],
    ["EnrichProfile",   3, 4,  2.0],
    ["ComputeScore",    2, 2,  1.5],
  ];

  for (const [name, attempts, interval, backoff] of retryConfigs) {
    pairs.push(lambdaWithRetry(name, attempts, interval, backoff));
  }

  // HTTP method variations
  const httpCases: [string, string, string[]][] = [
    ["GET",    "https://api.example.com/users",        []],
    ["GET",    "https://api.example.com/products",     []],
    ["GET",    "https://api.example.com/orders",       []],
    ["POST",   "https://api.example.com/users",        ["name","email"]],
    ["POST",   "https://api.example.com/payments",     ["amount","currency"]],
    ["POST",   "https://api.example.com/events",       ["type","payload"]],
    ["PUT",    "https://api.example.com/users/update", ["userId","name","email"]],
    ["PUT",    "https://api.example.com/orders/update",["orderId","status"]],
    ["DELETE", "https://api.example.com/sessions",     []],
    ["PATCH",  "https://api.example.com/users/patch",  ["userId","fields"]],
  ];

  for (const [method, url, fields] of httpCases) {
    pairs.push(httpMethodPair(method, url, fields));
  }

  // DynamoDB operation variations
  const dynamoCases: ["getItem"|"putItem"|"deleteItem", string, string][] = [
    ["getItem",    "Users",       "userId"],
    ["getItem",    "Products",    "productId"],
    ["getItem",    "Orders",      "orderId"],
    ["getItem",    "Sessions",    "sessionId"],
    ["getItem",    "Inventory",   "itemId"],
    ["putItem",    "Users",       "userId"],
    ["putItem",    "AuditLog",    "auditId"],
    ["putItem",    "Cache",       "cacheKey"],
    ["putItem",    "Events",      "eventId"],
    ["deleteItem", "Sessions",    "sessionId"],
    ["deleteItem", "TempData",    "tmpId"],
    ["deleteItem", "ExpiredTokens","tokenId"],
  ];

  for (const [op, table, key] of dynamoCases) {
    pairs.push(dynamoOpPair(op, table, key));
  }

  // SNS variations
  const snsTopics: [string, string][] = [
    ["UserCreated",        "$.userId"],
    ["OrderPlaced",        "$.orderId"],
    ["PaymentReceived",    "$.paymentId"],
    ["ShipmentDispatched", "$.shipmentId"],
    ["AlertNotification",  "$.message"],
    ["ErrorOccurred",      "$.error"],
    ["ReportReady",        "$.reportId"],
    ["CampaignLaunched",   "$.campaignId"],
  ];

  for (const [topic, expr] of snsTopics) {
    pairs.push(snsPair(topic, expr));
  }

  // SQS queue variations
  const sqsQueues: string[] = [
    "OrderProcessingQueue",
    "EmailNotificationQueue",
    "ReportGenerationQueue",
    "DataSyncQueue",
    "AuditQueue",
    "RetryQueue",
    "DeadLetterQueue",
    "PriorityQueue",
    "BatchProcessQueue",
    "AnalyticsQueue",
  ];

  for (const queue of sqsQueues) {
    pairs.push(sqsPair(queue));
  }

  // Sequential 2-task chains (lambda → lambda)
  const chains: [string, string][] = [
    ["FetchUser",    "SendWelcome"],
    ["ValidateOrder","ChargePayment"],
    ["ParseInput",   "StoreResult"],
    ["CheckCache",   "FetchFromDB"],
    ["CompressLog",  "UploadToS3"],
    ["ReadConfig",   "ApplyConfig"],
    ["GenerateToken","StoreToken"],
    ["ExtractData",  "TransformData"],
    ["CheckHealth",  "RecordMetrics"],
    ["BuildPayload", "PostToAPI"],
  ];

  for (const [step1, step2] of chains) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: step1,
        States: {
          [step1]: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${step1}Fn`, "Payload.$": "$" }, Next: step2 },
          [step2]: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${step2}Fn`, "Payload.$": "$" }, End: true }
        }
      }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [step1]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${step1}Fn` }, body: "@triggerBody()" }, runAfter: {} },
          [step2]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${step2}Fn` }, body: `@body('${step1}')` }, runAfter: { [step1]: ["Succeeded"] } }
        }
      })
    ));
  }

  return pairs;
}
