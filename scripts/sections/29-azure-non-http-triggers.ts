/**
 * Section 29 – Azure Logic Apps non-HTTP triggers
 *
 * Real Azure workflows use many trigger types:
 *   - Recurrence (timer/cron)
 *   - ServiceBus (message-based)
 *   - EventGrid (event-based)
 *   - BlobStorage (file upload)
 *   - ApiConnection (connector-specific)
 *
 * AWS Step Functions doesn't have built-in triggers — they are started externally.
 * The mapping strategy:
 *   - Recurrence trigger → EventBridge Scheduler starts the state machine
 *   - ServiceBus trigger → SQS/Lambda-triggered execution
 *   - BlobStorage trigger → S3 event-triggered execution
 *   - EventGrid trigger → EventBridge rule starts the state machine
 *   Both directions covered.
 *
 * Reference:
 *   Azure WDL triggers: https://learn.microsoft.com/en-us/azure/logic-apps/logic-apps-workflow-definition-language
 *   EventBridge Scheduler: https://docs.aws.amazon.com/scheduler/latest/UserGuide/
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

export function azureNonHttpTriggerPairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // ── Recurrence trigger → EventBridge Scheduler note + Lambda first state ──
  const recurrenceCases: [string, string, string, string, string[]][] = [
    ["DailyReport",       "Day",    "1",  "00:00",  ["GenerateReport", "EmailReport"]],
    ["HourlySync",        "Hour",   "1",  "",       ["SyncData", "LogSync"]],
    ["WeeklyCleanup",     "Week",   "1",  "02:00",  ["CleanupOldData", "NotifyCleanup"]],
    ["MonthlyBilling",    "Month",  "1",  "09:00",  ["GenerateBill", "SendBill"]],
    ["FifteenMinPoll",    "Minute", "15", "",       ["PollQueue", "ProcessPolled"]],
    ["NightlyBackup",     "Day",    "1",  "01:00",  ["BackupDatabase", "VerifyBackup"]],
    ["QuarterlyAudit",    "Month",  "3",  "08:00",  ["RunAudit", "StoreAuditResult"]],
    ["MidnightMaintenance","Day",   "1",  "00:00",  ["RunMaintenance", "NotifyComplete"]],
  ];

  for (const [name, freq, interval, startTime, [step1, step2]] of recurrenceCases) {
    pairs.push(pair("azure-to-aws",
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: {
          Recurrence: {
            type: "Recurrence",
            recurrence: {
              frequency: freq,
              interval: parseInt(interval),
              ...(startTime ? { startTime: `2024-01-01T${startTime}:00Z`, timeZone: "UTC" } : {})
            }
          }
        },
        actions: {
          [step1]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${step1}Fn` }, body: "@triggerOutputs()" },
            runAfter: {}
          },
          [step2]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${step2}Fn` }, body: `@body('${step1}')` },
            runAfter: { [step1]: ["Succeeded"] }
          }
        }
      }),
      j({
        Comment: `Triggered by EventBridge Scheduler: every ${interval} ${freq.toLowerCase()}${startTime ? " at " + startTime + " UTC" : ""}`,
        StartAt: step1,
        States: {
          [step1]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${step1}Fn`, Payload: {} },
            Next: step2
          },
          [step2]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${step2}Fn`, "Payload.$": "$" },
            End: true
          }
        }
      })
    ));
  }

  // ── Service Bus trigger → SQS-triggered Lambda execution ─────────────────
  const serviceBusTriggerCases: [string, string, string[]][] = [
    ["ProcessOrderMessage",  "orders-topic",     ["ValidateOrder",  "FulfillOrder",  "NotifyCustomer"]],
    ["HandlePaymentEvent",   "payment-events",   ["ProcessPayment", "UpdateLedger",  "SendReceipt"]],
    ["ConsumeUserEvent",     "user-events",      ["UpdateProfile",  "InvalidateCache","AuditChange"]],
    ["ProcessAlertMessage",  "alert-queue",      ["TriageAlert",    "EscalateAlert"]],
    ["HandleInventoryMsg",   "inventory-events", ["UpdateInventory","CheckReorder"]],
    ["ConsumeAuditEvent",    "audit-queue",      ["StoreAuditLog",  "IndexAuditEntry"]],
  ];

  for (const [name, topicOrQueue, steps] of serviceBusTriggerCases) {
    const azureActions: Record<string, unknown> = {};
    let prev: string | null = null;
    for (const step of steps) {
      azureActions[step] = {
        type: "Function",
        inputs: {
          function: { id: `/sub/rg/app/functions/${step}Fn` },
          body: prev ? `@body('${prev}')` : "@triggerBody()"
        },
        runAfter: prev ? { [prev]: ["Succeeded"] } : {}
      };
      prev = step;
    }

    const awsStates: Record<string, unknown> = {};
    for (let i = 0; i < steps.length; i++) {
      awsStates[steps[i]] = {
        Type: "Task",
        Resource: "arn:aws:states:::lambda:invoke",
        Parameters: { FunctionName: `${steps[i]}Fn`, "Payload.$": "$" },
        ...(i < steps.length - 1 ? { Next: steps[i + 1] } : { End: true })
      };
    }

    pairs.push(pair("azure-to-aws",
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: {
          [name]: {
            type: "ServiceBus",
            inputs: {
              parameters: { entityName: topicOrQueue },
              serviceProviderConfiguration: {
                connectionName: "servicebus",
                operationId: "receiveTopicMessages",
                serviceProviderId: "/serviceProviders/serviceBus"
              }
            }
          }
        },
        actions: azureActions
      }),
      j({
        Comment: `Triggered when SQS queue '${topicOrQueue}' receives a message (via Lambda event source mapping or EventBridge Pipe)`,
        StartAt: steps[0],
        States: awsStates
      })
    ));
  }

  // ── Blob Storage trigger → S3 event-triggered execution ──────────────────
  const blobTriggerCases: [string, string, string, string[]][] = [
    ["ProcessUploadedFile",   "uploads-container", "*.json",  ["ValidateFile",  "ParseFile",    "StoreResult"]],
    ["ProcessNewImage",       "images-container",  "*.jpg",   ["ResizeImage",   "TagImage",     "PublishImage"]],
    ["ProcessCSVUpload",      "csv-imports",       "*.csv",   ["ParseCSV",      "ValidateRows", "ImportRows"]],
    ["HandleNewDocument",     "documents",         "*",       ["ScanDocument",  "IndexDocument"]],
    ["ProcessAudioUpload",    "audio-uploads",     "*.mp3",   ["TranscribeAudio","StoreTranscript"]],
    ["ProcessVideoUpload",    "video-uploads",     "*.mp4",   ["ExtractFrames", "AnalyzeFrames", "StoreAnalysis"]],
  ];

  for (const [name, container, pattern, steps] of blobTriggerCases) {
    const azureActions: Record<string, unknown> = {};
    let prev: string | null = null;
    for (const step of steps) {
      azureActions[step] = {
        type: "Function",
        inputs: {
          function: { id: `/sub/rg/app/functions/${step}Fn` },
          body: prev ? `@body('${prev}')` : {
            blobName: "@triggerBody()?['name']",
            contentType: "@triggerBody()?['contentType']",
            size: "@triggerBody()?['size']",
            url: "@triggerBody()?['url']"
          }
        },
        runAfter: prev ? { [prev]: ["Succeeded"] } : {}
      };
      prev = step;
    }

    const awsStates: Record<string, unknown> = {};
    for (let i = 0; i < steps.length; i++) {
      awsStates[steps[i]] = {
        Type: "Task",
        Resource: "arn:aws:states:::lambda:invoke",
        Parameters: { FunctionName: `${steps[i]}Fn`, "Payload.$": "$" },
        ...(i < steps.length - 1 ? { Next: steps[i + 1] } : { End: true })
      };
    }

    pairs.push(pair("azure-to-aws",
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: {
          [name]: {
            type: "BlobStorage",
            inputs: {
              parameters: { containerName: container, blobPathBeginsWith: pattern }
            }
          }
        },
        actions: azureActions
      }),
      j({
        Comment: `Triggered by S3 event on bucket '${container}' for pattern '${pattern}' (via S3 Event Notification → EventBridge → Step Functions)`,
        StartAt: steps[0],
        States: awsStates
      })
    ));
  }

  // ── Event Grid trigger → EventBridge rule execution ───────────────────────
  const eventGridTriggerCases: [string, string, string, string[]][] = [
    ["OnResourceCreated",  "Microsoft.Resources.ResourceWriteSuccess", "Microsoft.Resources", ["AuditCreation",  "TagResource"]],
    ["OnBlobUploaded",     "Microsoft.Storage.BlobCreated",            "Microsoft.Storage",   ["ProcessBlob",   "IndexBlob"]],
    ["OnContainerStarted", "Microsoft.ContainerInstance.Started",      "Microsoft.ContainerInstance", ["LogStart", "MonitorContainer"]],
    ["OnKeyVaultAccess",   "Microsoft.KeyVault.SecretAccessDenied",    "Microsoft.KeyVault",  ["AlertSecurity", "LogViolation"]],
  ];

  for (const [name, eventType, source, steps] of eventGridTriggerCases) {
    const azureActions: Record<string, unknown> = {};
    let prev: string | null = null;
    for (const step of steps) {
      azureActions[step] = {
        type: "Function",
        inputs: {
          function: { id: `/sub/rg/app/functions/${step}Fn` },
          body: prev ? `@body('${prev}')` : "@triggerBody()"
        },
        runAfter: prev ? { [prev]: ["Succeeded"] } : {}
      };
      prev = step;
    }

    const awsStates: Record<string, unknown> = {};
    for (let i = 0; i < steps.length; i++) {
      awsStates[steps[i]] = {
        Type: "Task",
        Resource: "arn:aws:states:::lambda:invoke",
        Parameters: { FunctionName: `${steps[i]}Fn`, "Payload.$": "$" },
        ...(i < steps.length - 1 ? { Next: steps[i + 1] } : { End: true })
      };
    }

    pairs.push(pair("azure-to-aws",
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: {
          [name]: {
            type: "EventGrid",
            inputs: {
              parameters: {
                eventType: eventType,
                source: source
              }
            }
          }
        },
        actions: azureActions
      }),
      j({
        Comment: `Triggered by EventBridge rule matching source='${source}' detail-type='${eventType}'`,
        StartAt: steps[0],
        States: awsStates
      })
    ));
  }

  // ── HTTP trigger WITH auth (real-world API Gateway pattern) ───────────────
  const httpWithAuthCases: [string, string, string, string[]][] = [
    ["ProcessAPIRequest",  "jwt",    "Authorization",   ["AuthenticateJWT", "AuthorizeRequest", "ExecuteRequest"]],
    ["HandleWebhook",      "hmac",   "X-Signature",     ["VerifySignature",  "ProcessWebhook"]],
    ["ProcessAPIKey",      "apikey", "X-API-Key",       ["ValidateAPIKey",   "ExecuteOperation"]],
    ["HandleOAuthRequest", "oauth",  "Authorization",   ["ValidateOAuthToken","ProcessOAuthRequest"]],
  ];

  for (const [name, authType, header, steps] of httpWithAuthCases) {
    const azureActions: Record<string, unknown> = {};
    let prev: string | null = null;
    for (const step of steps) {
      azureActions[step] = {
        type: "Function",
        inputs: {
          function: { id: `/sub/rg/app/functions/${step}Fn` },
          body: prev ? `@body('${prev}')` : {
            body: "@triggerBody()",
            headers: "@triggerOutputs()?['headers']",
            authHeader: `@triggerOutputs()?['headers']?['${header}']`
          }
        },
        runAfter: prev ? { [prev]: ["Succeeded"] } : {}
      };
      prev = step;
    }

    const awsStates: Record<string, unknown> = {};
    for (let i = 0; i < steps.length; i++) {
      awsStates[steps[i]] = {
        Type: "Task",
        Resource: "arn:aws:states:::lambda:invoke",
        Parameters: { FunctionName: `${steps[i]}Fn`, "Payload.$": "$" },
        ...(i < steps.length - 1 ? { Next: steps[i + 1] } : { End: true })
      };
    }

    pairs.push(pair("azure-to-aws",
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: {
          manual: {
            type: "Request",
            kind: "Http",
            inputs: {
              schema: {},
              authentication: { type: authType === "jwt" ? "ActiveDirectoryOAuth" : authType === "apikey" ? "QueryString" : "ClientCertificate" }
            }
          }
        },
        actions: azureActions
      }),
      j({
        Comment: `API Gateway with ${authType} auth passes ${header} header; validated in first Lambda`,
        StartAt: steps[0],
        States: awsStates
      })
    ));
  }

  return pairs;
}
