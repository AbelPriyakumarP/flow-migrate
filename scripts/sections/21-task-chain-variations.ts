/**
 * Section 21 – Task chain variations:
 *   3-task, 4-task, and 5-task sequential chains across different services
 *   (Lambda → DynamoDB, Lambda → SNS, Lambda → S3, mixed service chains)
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

export function taskChainVariationPairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // ── 3-task Lambda chains ─────────────────────────────────────────────────
  const chain3Lambda: [string, string, string][] = [
    ["ValidateInput",    "TransformData",  "StoreResult"],
    ["FetchUser",        "EnrichProfile",  "SaveProfile"],
    ["ParseRequest",     "ExecuteLogic",   "ReturnResponse"],
    ["CheckPermission",  "LoadData",       "FormatOutput"],
    ["ReceiveEvent",     "ProcessEvent",   "AcknowledgeEvent"],
    ["ReadConfig",       "ApplyConfig",    "ConfirmConfig"],
    ["ExtractFeatures",  "ScoreModel",     "RecordPrediction"],
    ["StartSession",     "ProcessSession", "EndSession"],
    ["LoadInventory",    "ReserveItem",    "ConfirmReservation"],
    ["InitWorkflow",     "RunWorkflow",    "CloseWorkflow"],
    ["FetchTemplate",    "RenderContent",  "PublishContent"],
    ["AuthenticateUser", "AuthorizeAction","ExecuteAction"],
    ["ReadMessage",      "HandleMessage",  "AckMessage"],
    ["PrepareDataset",   "TrainModel",     "EvaluateModel"],
    ["LoadRules",        "ApplyRules",     "ReportRuleResult"],
  ];

  for (const [s1, s2, s3] of chain3Lambda) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: s1,
        States: {
          [s1]: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${s1}Fn`, "Payload.$": "$" }, Next: s2 },
          [s2]: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${s2}Fn`, "Payload.$": "$" }, Next: s3 },
          [s3]: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${s3}Fn`, "Payload.$": "$" }, End: true }
        }
      }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [s1]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${s1}Fn` }, body: "@triggerBody()" }, runAfter: {} },
          [s2]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${s2}Fn` }, body: `@body('${s1}')` }, runAfter: { [s1]: ["Succeeded"] } },
          [s3]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${s3}Fn` }, body: `@body('${s2}')` }, runAfter: { [s2]: ["Succeeded"] } }
        }
      })
    ));
  }

  // ── Lambda → DynamoDB chains ─────────────────────────────────────────────
  const lambdaToDynChains: [string, string, "putItem" | "getItem", string, string][] = [
    ["ProcessOrder",   "Orders",    "putItem",  "orderId",  "NotifyAfterStore"],
    ["GetUserData",    "Users",     "getItem",  "userId",   "EnrichWithDBData"],
    ["ComputeScore",   "Scores",    "putItem",  "scoreId",  "BroadcastScore"],
    ["GenerateReport", "Reports",   "putItem",  "reportId", "NotifyReportReady"],
    ["ValidateItem",   "Items",     "getItem",  "itemId",   "ProcessValidItem"],
    ["CreateSession",  "Sessions",  "putItem",  "sessionId","RedirectUser"],
    ["LookupProduct",  "Products",  "getItem",  "productId","ReturnProductData"],
    ["ArchiveRecord",  "Archive",   "putItem",  "archiveId","ConfirmArchived"],
  ];

  for (const [lambdaTask, table, op, keyField, finalTask] of lambdaToDynChains) {
    const ddbArn = `arn:aws:states:::dynamodb:${op}`;
    const ddbParams = op === "putItem"
      ? { TableName: table, Item: { [keyField]: { "S.$": `$.${keyField}` }, data: { "S.$": "States.JsonToString($)" } } }
      : { TableName: table, Key: { [keyField]: { "S.$": `$.${keyField}` } } };

    const ddbStateName = `${op}_${table}`;
    const azureDdbAction = op === "putItem"
      ? { type: "ApiConnection", inputs: { host: { connection: { name: "@parameters('$connections')['documentdb']['connectionId']" } }, method: "post", path: `/dbs/@{encodeURIComponent('${table}')}/colls/@{encodeURIComponent('${table.toLowerCase()}')}/docs`, body: { id: `@body('${lambdaTask}')?['${keyField}']`, [keyField]: `@body('${lambdaTask}')?['${keyField}']`, data: `@body('${lambdaTask}')` } }, runAfter: { [lambdaTask]: ["Succeeded"] } }
      : { type: "ApiConnection", inputs: { host: { connection: { name: "@parameters('$connections')['documentdb']['connectionId']" } }, method: "get", path: `/dbs/@{encodeURIComponent('${table}')}/colls/@{encodeURIComponent('${table.toLowerCase()}')}/docs/@{encodeURIComponent(body('${lambdaTask}')?['${keyField}'])}` }, runAfter: { [lambdaTask]: ["Succeeded"] } };

    pairs.push(pair("aws-to-azure",
      j({
        StartAt: lambdaTask,
        States: {
          [lambdaTask]: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${lambdaTask}Fn`, "Payload.$": "$" }, Next: ddbStateName },
          [ddbStateName]: { Type: "Task", Resource: ddbArn, Parameters: ddbParams, ResultPath: "$.dbResult", Next: finalTask },
          [finalTask]: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${finalTask}Fn`, "Payload.$": "$" }, End: true }
        }
      }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [lambdaTask]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${lambdaTask}Fn` }, body: "@triggerBody()" }, runAfter: {} },
          [ddbStateName]: azureDdbAction,
          [finalTask]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${finalTask}Fn` }, body: `@body('${ddbStateName}')` }, runAfter: { [ddbStateName]: ["Succeeded"] } }
        }
      })
    ));
  }

  // ── Lambda → SNS chains ──────────────────────────────────────────────────
  const lambdaToSnsChains: [string, string, string][] = [
    ["ProcessOrder",    "OrderEvents",     "LogNotification"],
    ["ValidatePayment", "PaymentAlerts",   "StorePaymentLog"],
    ["DeployArtifact",  "DeploymentEvents","UpdateDashboard"],
    ["CreateUser",      "UserCreated",     "SendWelcomeEmail"],
    ["CompleteReport",  "ReportReady",     "ArchiveReport"],
    ["DetectAnomaly",   "SecurityAlerts",  "InvestigateAnomaly"],
  ];

  for (const [lambdaTask, topicName, finalTask] of lambdaToSnsChains) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: lambdaTask,
        States: {
          [lambdaTask]: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${lambdaTask}Fn`, "Payload.$": "$" }, Next: `Notify_${topicName}` },
          [`Notify_${topicName}`]: { Type: "Task", Resource: "arn:aws:states:::sns:publish", Parameters: { TopicArn: `arn:aws:sns:us-east-1:123456789012:${topicName}`, "Message.$": "$.message" }, ResultPath: "$.snsResult", Next: finalTask },
          [finalTask]: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${finalTask}Fn`, "Payload.$": "$" }, End: true }
        }
      }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [lambdaTask]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${lambdaTask}Fn` }, body: "@triggerBody()" }, runAfter: {} },
          [`Notify_${topicName}`]: { type: "ApiConnection", inputs: { host: { connection: { name: "@parameters('$connections')['servicebus']['connectionId']" } }, method: "post", path: `/@{encodeURIComponent('${topicName}')}/messages`, body: { ContentData: `@{base64(string(body('${lambdaTask}')?['message']))}`, ContentType: "application/json" } }, runAfter: { [lambdaTask]: ["Succeeded"] } },
          [finalTask]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${finalTask}Fn` }, body: "@triggerBody()" }, runAfter: { [`Notify_${topicName}`]: ["Succeeded"] } }
        }
      })
    ));
  }

  // ── Lambda → S3 chains ───────────────────────────────────────────────────
  const lambdaToS3Chains: [string, string, string, string][] = [
    ["GenerateReport",   "reports-bucket",   "$.reportKey",     "NotifyReportStored"],
    ["ProcessImage",     "processed-images", "$.imageKey",      "TagImage"],
    ["ExportData",       "data-exports",     "$.exportKey",     "TriggerDownload"],
    ["BuildArtifact",    "artifacts-bucket", "$.artifactKey",   "DeployArtifact"],
    ["CreateBackup",     "backups-bucket",   "$.backupKey",     "VerifyBackup"],
    ["GenerateInvoice",  "invoices-bucket",  "$.invoiceKey",    "SendInvoice"],
  ];

  for (const [lambdaTask, bucket, keyPath, finalTask] of lambdaToS3Chains) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: lambdaTask,
        States: {
          [lambdaTask]: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${lambdaTask}Fn`, "Payload.$": "$" }, Next: `Upload_${bucket.replace("-", "_")}` },
          [`Upload_${bucket.replace("-", "_")}`]: { Type: "Task", Resource: "arn:aws:states:::s3:putObject", Parameters: { Bucket: bucket, "Key.$": keyPath, "Body.$": "$.content" }, ResultPath: "$.s3Result", Next: finalTask },
          [finalTask]: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${finalTask}Fn`, "Payload.$": "$" }, End: true }
        }
      }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [lambdaTask]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${lambdaTask}Fn` }, body: "@triggerBody()" }, runAfter: {} },
          [`Upload_${bucket.replace("-", "_")}`]: { type: "ApiConnection", inputs: { host: { connection: { name: "@parameters('$connections')['azureblob']['connectionId']" } }, method: "put", path: `/v2/datasets/@{encodeURIComponent(encodeURIComponent('${bucket}'))}/files/@{encodeURIComponent(encodeURIComponent(body('${lambdaTask}')?['${keyPath.replace("$.", "")}']))}`, body: `@body('${lambdaTask}')?['content']` }, runAfter: { [lambdaTask]: ["Succeeded"] } },
          [finalTask]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${finalTask}Fn` }, body: "@triggerBody()" }, runAfter: { [`Upload_${bucket.replace("-", "_")}`]: ["Succeeded"] } }
        }
      })
    ));
  }

  // ── 4-task Lambda chains (Azure→AWS) ────────────────────────────────────
  const chain4AzureToAws: [string, string, string, string][] = [
    ["ReceiveRequest",  "ValidateRequest", "ProcessRequest",  "RespondToRequest"],
    ["LoadUserData",    "ApplyDiscounts",  "CalculateTotal",  "ConfirmOrder"],
    ["InitMigration",   "ExtractData",     "TransformData",   "LoadData"],
    ["ScheduleJob",     "PrepareJob",      "ExecuteJob",      "ReportJobResult"],
    ["FetchRawData",    "CleanData",       "EnrichData",      "StoreData"],
    ["AuthenticateReq", "LoadUserProfile", "AuthorizeAction", "AuditAction"],
    ["TriggerPipeline", "ValidatePipeline","RunPipeline",     "PipelineDone"],
    ["StartOnboarding", "CreateAccount",   "SendWelcome",     "CompleteOnboarding"],
  ];

  for (const [s1, s2, s3, s4] of chain4AzureToAws) {
    pairs.push(pair("azure-to-aws",
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [s1]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${s1}Fn` }, body: "@triggerBody()" }, runAfter: {} },
          [s2]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${s2}Fn` }, body: `@body('${s1}')` }, runAfter: { [s1]: ["Succeeded"] } },
          [s3]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${s3}Fn` }, body: `@body('${s2}')` }, runAfter: { [s2]: ["Succeeded"] } },
          [s4]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${s4}Fn` }, body: `@body('${s3}')` }, runAfter: { [s3]: ["Succeeded"] } }
        }
      }),
      j({
        StartAt: s1,
        States: {
          [s1]: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${s1}Fn`, "Payload.$": "$" }, Next: s2 },
          [s2]: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${s2}Fn`, "Payload.$": "$" }, Next: s3 },
          [s3]: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${s3}Fn`, "Payload.$": "$" }, Next: s4 },
          [s4]: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${s4}Fn`, "Payload.$": "$" }, End: true }
        }
      })
    ));
  }

  return pairs;
}
