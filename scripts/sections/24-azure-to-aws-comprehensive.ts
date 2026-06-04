/**
 * Section 24 – Comprehensive Azure → AWS coverage:
 *   More If/Switch/Foreach/Scope/Http/ApiConnection patterns
 *   targeting gaps left by previous sections
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

export function azureToAwsComprehensivePairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // ── Azure If with nested actions (both branches have tasks) ──────────────
  const ifWithBothBranchesCases: [string, string, string, string, string][] = [
    ["CheckSubscription",  "$.subscriptionType", "premium", "SendPremiumWelcome",  "SendFreeWelcome"],
    ["CheckRegion",        "$.region",           "eu-west-1","RouteToEU",          "RouteToUS"],
    ["CheckApproval",      "$.approved",         "true",    "ExecuteApproved",     "RejectRequest"],
    ["CheckDataSource",    "$.source",           "primary", "UsePrimary",          "UseSecondary"],
    ["CheckOrderSize",     "$.orderType",        "bulk",    "BulkProcessing",      "StandardProcessing"],
    ["CheckNotification",  "$.notifyUser",       "true",    "SendNotification",    "SkipNotification"],
    ["CheckCacheable",     "$.cacheable",        "true",    "CacheResult",         "SkipCache"],
    ["CheckValidation",    "$.skipValidation",   "false",   "ValidateFully",       "SkipValidation"],
    ["CheckAsync",         "$.asyncMode",        "true",    "AsyncProcess",        "SyncProcess"],
    ["CheckDebug",         "$.debugMode",        "true",    "DebugPath",           "ProductionPath"],
  ];

  for (const [name, path, val, trueAction, falseAction] of ifWithBothBranchesCases) {
    const awsVar = path;
    const azureVar = path.replace("$.", "@triggerBody()?['") + "']";
    const valIsBoolean = val === "true" || val === "false";

    pairs.push(pair("azure-to-aws",
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [name]: {
            type: "If",
            expression: { and: [{ equals: [azureVar, valIsBoolean ? (val === "true") : val] }] },
            actions: {
              [trueAction]: {
                type: "Function",
                inputs: { function: { id: `/sub/rg/app/functions/${trueAction}Fn` }, body: "@triggerBody()" },
                runAfter: {}
              }
            },
            else: {
              actions: {
                [falseAction]: {
                  type: "Function",
                  inputs: { function: { id: `/sub/rg/app/functions/${falseAction}Fn` }, body: "@triggerBody()" },
                  runAfter: {}
                }
              }
            },
            runAfter: {}
          }
        }
      }),
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Choice",
            Choices: [{
              Variable: awsVar,
              ...(valIsBoolean ? { BooleanEquals: val === "true" } : { StringEquals: val }),
              Next: trueAction
            }],
            Default: falseAction
          },
          [trueAction]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${trueAction}Fn`, "Payload.$": "$" },
            End: true
          },
          [falseAction]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${falseAction}Fn`, "Payload.$": "$" },
            End: true
          }
        }
      })
    ));
  }

  // ── Azure Foreach Sequential → AWS Map MaxConcurrency:1 ──────────────────
  const foreachSeqCases: [string, string, string][] = [
    ["ImportCSVRows",     "$.rows",    "ImportRowFn"],
    ["MigrateRecords",    "$.records", "MigrateRecordFn"],
    ["ProcessInvoices",   "$.invoices","ProcessInvoiceFn"],
    ["SyncContacts",      "$.contacts","SyncContactFn"],
    ["UpdatePrices",      "$.prices",  "UpdatePriceFn"],
    ["ApplyPatches",      "$.patches", "ApplyPatchFn"],
    ["SendBulkSMS",       "$.phones",  "SendSMSFn"],
    ["GenerateLabels",    "$.orders",  "GenerateLabelFn"],
  ];

  for (const [name, arrayExpr, fn] of foreachSeqCases) {
    const arrayField = arrayExpr.replace("$.", "");
    const innerName = fn.replace("Fn", "");
    pairs.push(pair("azure-to-aws",
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [name]: {
            type: "Foreach",
            foreach: `@triggerBody()?['${arrayField}']`,
            operationOptions: "Sequential",
            actions: {
              [innerName]: {
                type: "Function",
                inputs: { function: { id: `/sub/rg/app/functions/${fn}` }, body: `@items('${name}')` },
                runAfter: {}
              }
            },
            runAfter: {}
          }
        }
      }),
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Map",
            ItemsPath: arrayExpr,
            MaxConcurrency: 1,
            ItemProcessor: {
              ProcessorConfig: { Mode: "INLINE" },
              StartAt: innerName,
              States: {
                [innerName]: {
                  Type: "Task",
                  Resource: "arn:aws:states:::lambda:invoke",
                  Parameters: { FunctionName: fn, "Payload.$": "$" },
                  End: true
                }
              }
            },
            End: true
          }
        }
      })
    ));
  }

  // ── Azure ApiConnection (Cosmos DB) → AWS DynamoDB ───────────────────────
  const cosmosToDbCases: [string, "get" | "post" | "put" | "delete", string, string][] = [
    ["ReadUserFromCosmos",     "get",    "Users",    "userId"],
    ["CreateOrderInCosmos",    "post",   "Orders",   "orderId"],
    ["UpdateProfileInCosmos",  "put",    "Profiles", "profileId"],
    ["DeleteSessionFromCosmos","delete", "Sessions", "sessionId"],
    ["ReadProductFromCosmos",  "get",    "Products", "productId"],
    ["CreateEventInCosmos",    "post",   "Events",   "eventId"],
    ["UpdateInventoryCosmos",  "put",    "Inventory","itemId"],
    ["DeleteTokenCosmos",      "delete", "Tokens",   "tokenId"],
    ["ReadConfigFromCosmos",   "get",    "Config",   "configId"],
  ];

  for (const [name, method, collection, keyField] of cosmosToDbCases) {
    const awsOp = method === "get" ? "getItem" : method === "delete" ? "deleteItem" : method === "post" ? "putItem" : "updateItem";
    const awsArn = `arn:aws:states:::dynamodb:${awsOp}`;
    const awsParams: Record<string, unknown> = awsOp === "putItem"
      ? { TableName: collection, Item: { [keyField]: { "S.$": `$.${keyField}` }, createdAt: { "S.$": "$$.Execution.StartTime" } } }
      : awsOp === "updateItem"
      ? { TableName: collection, Key: { [keyField]: { "S.$": `$.${keyField}` } }, UpdateExpression: "SET updatedAt = :ts", ExpressionAttributeValues: { ":ts": { "S.$": "$$.Execution.StartTime" } } }
      : { TableName: collection, Key: { [keyField]: { "S.$": `$.${keyField}` } } };

    const azurePath = method === "get" || method === "delete"
      ? `/dbs/@{encodeURIComponent('${collection}')}/colls/@{encodeURIComponent('${collection.toLowerCase()}')}/docs/@{encodeURIComponent(triggerBody()?['${keyField}'])}`
      : `/dbs/@{encodeURIComponent('${collection}')}/colls/@{encodeURIComponent('${collection.toLowerCase()}')}/docs`;

    pairs.push(pair("azure-to-aws",
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [name]: {
            type: "ApiConnection",
            inputs: {
              host: { connection: { name: "@parameters('$connections')['documentdb']['connectionId']" } },
              method: method,
              path: azurePath,
              ...(method === "post" || method === "put" ? { body: { id: `@triggerBody()?['${keyField}']`, [keyField]: `@triggerBody()?['${keyField}']` } } : {})
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
            Resource: awsArn,
            Parameters: awsParams,
            End: true
          }
        }
      })
    ));
  }

  // ── Azure Scope with error handling → AWS Parallel with Catch ────────────
  const scopeWithErrorCases: [string, string[], string][] = [
    ["CriticalOpsScope",      ["ValidateCritical","ExecuteCritical"], "HandleCriticalError"],
    ["AtomicUpdateScope",     ["LockRecord","UpdateRecord"],          "RollbackUpdate"],
    ["TransactionScope",      ["BeginTx","ExecuteTx","CommitTx"],     "RollbackTx"],
    ["DeploymentScope",       ["BackupCurrent","Deploy","Verify"],    "Rollback"],
    ["DataMigrationScope",    ["BackupData","MigrateData"],           "RestoreData"],
  ];

  for (const [scopeName, actions, errorHandler] of scopeWithErrorCases) {
    const innerAzureActions: Record<string, unknown> = {};
    let prev: string | null = null;
    for (const act of actions) {
      innerAzureActions[act] = {
        type: "Function",
        inputs: { function: { id: `/sub/rg/app/functions/${act}Fn` }, body: prev ? `@body('${prev}')` : "@triggerBody()" },
        runAfter: prev ? { [prev]: ["Succeeded"] } : {}
      };
      prev = act;
    }

    const branchStates: Record<string, unknown> = {};
    for (let i = 0; i < actions.length; i++) {
      branchStates[actions[i]] = {
        Type: "Task",
        Resource: "arn:aws:states:::lambda:invoke",
        Parameters: { FunctionName: `${actions[i]}Fn`, "Payload.$": "$" },
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
            actions: innerAzureActions,
            runAfter: {}
          },
          [errorHandler]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${errorHandler}Fn` }, body: "@triggerBody()" },
            runAfter: { [scopeName]: ["Failed", "TimedOut", "Skipped"] }
          }
        }
      }),
      j({
        StartAt: scopeName,
        States: {
          [scopeName]: {
            Type: "Parallel",
            Branches: [{ StartAt: actions[0], States: branchStates }],
            Catch: [{ ErrorEquals: ["States.ALL"], Next: errorHandler, ResultPath: "$.scopeError" }],
            End: true
          },
          [errorHandler]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${errorHandler}Fn`, "Payload.$": "$" },
            End: true
          }
        }
      })
    ));
  }

  // ── Azure ParseJson → AWS Pass with StringToJson ──────────────────────────
  const parseJsonCases: [string, string, string][] = [
    ["ParseOrderJson",     "$.orderJson",    "ProcessParsedOrder"],
    ["ParseConfigJson",    "$.configString", "ApplyParsedConfig"],
    ["ParsePayloadJson",   "$.rawPayload",   "HandlePayload"],
    ["ParseResponseJson",  "$.responseBody", "ProcessAPIResponse"],
    ["ParseEventJson",     "$.eventString",  "HandleParsedEvent"],
    ["ParseMetadataJson",  "$.metaString",   "UseMetadata"],
    ["ParseTemplateJson",  "$.templateStr",  "RenderTemplate"],
  ];

  for (const [name, inputPath, nextFn] of parseJsonCases) {
    const field = inputPath.replace("$.", "");
    pairs.push(pair("azure-to-aws",
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [name]: {
            type: "ParseJson",
            inputs: {
              content: `@triggerBody()?['${field}']`,
              schema: { type: "object" }
            },
            runAfter: {}
          },
          [nextFn]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${nextFn}Fn` }, body: `@body('${name}')` },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      }),
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Pass",
            Parameters: { [`parsed.$`]: `States.StringToJson(${inputPath})` },
            ResultPath: "$.parsedData",
            Next: nextFn
          },
          [nextFn]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${nextFn}Fn`, "Payload.$": "$" },
            End: true
          }
        }
      })
    ));
  }

  // ── Azure Http with retry → AWS http:invoke with Retry ───────────────────
  const httpWithRetryCases: [string, string, string, number, string][] = [
    ["CallWithRetry3",    "https://api.partner.com/data",   "GET",  3, "PT5S"],
    ["PostWithRetry5",    "https://api.partner.com/events", "POST", 5, "PT2S"],
    ["PutWithRetry4",     "https://api.partner.com/update", "PUT",  4, "PT3S"],
    ["PatchWithRetry2",   "https://api.partner.com/patch",  "PATCH",2, "PT10S"],
    ["DeleteWithRetry3",  "https://api.partner.com/remove", "DELETE",3,"PT5S"],
    ["GetStatusRetry10",  "https://status.api.com/health",  "GET",  10,"PT1S"],
  ];

  for (const [name, url, method, count, interval] of httpWithRetryCases) {
    const intervalSec = parseInt(interval.replace("PT", "").replace("S", ""));
    pairs.push(pair("azure-to-aws",
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [name]: {
            type: "Http",
            inputs: { method: method.toLowerCase(), uri: url },
            retryPolicy: { type: "exponential", count: count, interval: interval, minimumInterval: interval, maximumInterval: "PT1H" },
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
            Parameters: { ApiEndpoint: url, Method: method },
            Retry: [{ ErrorEquals: ["States.ALL"], IntervalSeconds: intervalSec, MaxAttempts: count, BackoffRate: 2 }],
            End: true
          }
        }
      })
    ));
  }

  // ── Azure Terminate Succeeded/Failed → AWS Succeed/Fail ──────────────────
  const terminateCases: [string, "Succeeded" | "Failed", string, string][] = [
    ["FinalSuccess",   "Succeeded", "",                  ""],
    ["FinalFailure",   "Failed",    "WorkflowFailed",    "Workflow could not complete"],
    ["CompletedOK",    "Succeeded", "",                  ""],
    ["FatalError",     "Failed",    "FatalError",        "Unrecoverable workflow error"],
    ["CleanShutdown",  "Succeeded", "",                  ""],
    ["ValidationFail", "Failed",    "ValidationFailed",  "Input validation failed"],
    ["TimeoutFail",    "Failed",    "TimeoutError",      "Workflow exceeded time limit"],
    ["AuthFail",       "Failed",    "AuthorizationError","Authorization check failed"],
  ];

  for (const [name, status, errCode, errMsg] of terminateCases) {
    const prevTask = `${name}_Worker`;
    pairs.push(pair("azure-to-aws",
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [prevTask]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${prevTask}Fn` }, body: "@triggerBody()" },
            runAfter: {}
          },
          [name]: {
            type: "Terminate",
            inputs: status === "Succeeded"
              ? { runStatus: "Succeeded" }
              : { runStatus: "Failed", runError: { code: errCode, message: errMsg } },
            runAfter: { [prevTask]: ["Succeeded"] }
          }
        }
      }),
      j({
        StartAt: prevTask,
        States: {
          [prevTask]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${prevTask}Fn`, "Payload.$": "$" },
            Next: name
          },
          [name]: status === "Succeeded"
            ? { Type: "Succeed" }
            : { Type: "Fail", Error: errCode, Cause: errMsg }
        }
      })
    ));
  }

  return pairs;
}
