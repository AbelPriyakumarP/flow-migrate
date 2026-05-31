/**
 * Section 12 – Parallel and Map state variations
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

// Helper: simple parallel with N branches
function parallelNBranches(
  stateName: string,
  branchFns: string[],
  mergeAction?: string
): TrainingPair {
  const branches = branchFns.map(fn => ({
    StartAt: fn,
    States: {
      [fn]: {
        Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
        Parameters: { FunctionName: `${fn}Fn`, "Payload.$": "$" }, End: true
      }
    }
  }));

  const awsJson: Record<string, unknown> = {
    StartAt: stateName,
    States: {
      [stateName]: {
        Type: "Parallel",
        Branches: branches,
        ResultPath: "$.parallelResults",
        ...(mergeAction ? { Next: mergeAction } : { End: true })
      },
      ...(mergeAction ? {
        [mergeAction]: {
          Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: `${mergeAction}Fn`, "Payload.$": "$" }, End: true
        }
      } : {})
    }
  };

  const azureActions: Record<string, unknown> = {};
  for (const fn of branchFns) {
    azureActions[fn] = {
      type: "Function",
      inputs: { function: { id: `/sub/rg/app/functions/${fn}Fn` }, body: "@triggerBody()" },
      runAfter: {}
    };
  }
  if (mergeAction) {
    const body: Record<string, string> = {};
    for (const fn of branchFns) body[fn.toLowerCase()] = `@body('${fn}')`;
    azureActions[mergeAction] = {
      type: "Function",
      inputs: { function: { id: `/sub/rg/app/functions/${mergeAction}Fn` }, body },
      runAfter: Object.fromEntries(branchFns.map(fn => [fn, ["Succeeded"]]))
    };
  }

  return pair("aws-to-azure",
    j(awsJson),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: azureActions
    })
  );
}

// Helper: Map → Foreach (side-effects)
function mapToForeach(
  stateName: string,
  itemsPath: string,
  innerFn: string,
  maxConcurrency: number
): TrainingPair {
  const sequential = maxConcurrency === 1;
  return pair("aws-to-azure",
    j({
      StartAt: stateName,
      States: {
        [stateName]: {
          Type: "Map",
          ItemsPath: itemsPath,
          MaxConcurrency: maxConcurrency,
          ItemProcessor: {
            ProcessorConfig: { Mode: "INLINE" },
            StartAt: innerFn,
            States: {
              [innerFn]: {
                Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
                Parameters: { FunctionName: `${innerFn}Fn`, "Payload.$": "$" }, End: true
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
        [stateName]: {
          type: "Foreach",
          foreach: `@triggerBody()?['${itemsPath.replace("$.", "")}']`,
          ...(sequential ? { operationOptions: "Sequential" } : {}),
          actions: {
            [innerFn]: {
              type: "Function",
              inputs: {
                function: { id: `/sub/rg/app/functions/${innerFn}Fn` },
                body: `@items('${stateName}')`
              },
              runAfter: {}
            }
          },
          runAfter: {}
        }
      }
    })
  );
}

// Helper: Map → Select (pure transform)
function mapToSelect(
  stateName: string,
  itemsPath: string,
  selectFields: Record<string, string>
): TrainingPair {
  const awsSelector: Record<string, string> = {};
  for (const [k, path] of Object.entries(selectFields)) {
    awsSelector[`${k}.$`] = path.replace("@item()?['", "$$.Map.Item.Value.").replace("']", "");
  }

  return pair("aws-to-azure",
    j({
      StartAt: stateName,
      States: {
        [stateName]: {
          Type: "Map",
          ItemsPath: itemsPath,
          ItemSelector: awsSelector,
          ItemProcessor: {
            ProcessorConfig: { Mode: "INLINE" },
            StartAt: "PassItem",
            States: { PassItem: { Type: "Pass", End: true } }
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
        [stateName]: {
          type: "Select",
          inputs: {
            from: `@triggerBody()?['${itemsPath.replace("$.", "")}']`,
            select: selectFields
          },
          runAfter: {}
        }
      }
    })
  );
}

export function parallelMapVariationPairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // ── Parallel 2-branch variations ─────────────────────────────────────────
  const parallel2Cases: [string, string, string, string][] = [
    ["FetchAndValidate", "FetchData",       "ValidateData",    "Merge"],
    ["EnrichAndScore",   "EnrichUser",      "ScoreUser",       "CombineScores"],
    ["CheckAndLog",      "CheckCompliance", "LogEvent",        "Finalize"],
    ["SendAndRecord",    "SendEmail",       "RecordInCRM",     "ConfirmSent"],
    ["BackupAndNotify",  "BackupData",      "NotifyAdmin",     "AckComplete"],
    ["ScanAndIndex",     "VirusScan",       "SearchIndex",     "AfterScan"],
    ["ResizeAndUpload",  "ResizeImage",     "UploadThumb",     "TagAsProcessed"],
    ["TranslateAndSave", "TranslateText",   "SaveTranslation", "PublishResult"],
    ["AuditAndProcess",  "AuditRequest",    "ProcessRequest",  "ReturnResponse"],
    ["CacheAndCompute",  "CheckCache",      "ComputeResult",   "StoreResult"],
  ];

  for (const [name, b1, b2, merge] of parallel2Cases) {
    pairs.push(parallelNBranches(name, [b1, b2], merge));
  }

  // ── Parallel 3-branch variations ─────────────────────────────────────────
  const parallel3Cases: [string, string[], string][] = [
    ["TripleCheck",    ["FraudCheck","CreditCheck","IdentityCheck"],    "EvaluateChecks"],
    ["GatherMetrics",  ["CPUMetrics","MemoryMetrics","NetworkMetrics"], "AggregateMetrics"],
    ["NotifyAll",      ["EmailNotify","SMSNotify","PushNotify"],        "ConfirmNotifications"],
    ["ValidateAll",    ["SchemaValidate","BusinessValidate","SecurityValidate"],"ValidationResult"],
    ["PrepareReport",  ["GetSalesData","GetUserData","GetInventory"],   "CompileReport"],
  ];

  for (const [name, branches, merge] of parallel3Cases) {
    pairs.push(parallelNBranches(name, branches, merge));
  }

  // ── Map → Foreach variations (with different MaxConcurrency) ─────────────
  const foreachCases: [string, string, string, number][] = [
    ["ProcessOrders",    "$.orders",    "ProcessSingleOrder",    0],
    ["SendNotifications","$.users",     "SendUserNotification",  10],
    ["ImportRecords",    "$.records",   "ImportRecord",          1],
    ["ValidateItems",    "$.items",     "ValidateItem",          5],
    ["UploadFiles",      "$.files",     "UploadFile",            3],
    ["ProcessPayments",  "$.payments",  "ProcessPayment",        1],
    ["IndexDocuments",   "$.documents", "IndexDocument",         10],
    ["ResizeImages",     "$.images",    "ResizeImage",           5],
    ["RunTests",         "$.testCases", "RunTestCase",           0],
    ["SyncEntities",     "$.entities",  "SyncEntity",            1],
    ["EnrichProfiles",   "$.profiles",  "EnrichProfile",         5],
    ["GenerateReports",  "$.reportIds", "GenerateReport",        3],
  ];

  for (const [name, path, inner, concurrency] of foreachCases) {
    pairs.push(mapToForeach(name, path, inner, concurrency));
  }

  // ── Map → Select (pure transform) variations ─────────────────────────────
  const selectCases: [string, string, Record<string, string>][] = [
    ["NormalizeProducts", "$.products",
      { productId: "@item()?['id']", title: "@item()?['name']", price: "@item()?['amount']" }],
    ["NormalizeUsers", "$.users",
      { userId: "@item()?['sub']", email: "@item()?['emailAddress']", name: "@item()?['displayName']" }],
    ["ExtractOrderIds", "$.orders",
      { id: "@item()?['orderId']", status: "@item()?['orderStatus']" }],
    ["MapEventTypes", "$.events",
      { type: "@item()?['eventType']", timestamp: "@item()?['createdAt']", source: "@item()?['origin']" }],
    ["FlattenAddresses", "$.customers",
      { customerId: "@item()?['id']", city: "@item()?['address']?['city']", country: "@item()?['address']?['country']" }],
    ["SummarizeItems", "$.lineItems",
      { sku: "@item()?['productCode']", qty: "@item()?['quantity']", total: "@item()?['unitPrice']" }],
    ["ExtractTags", "$.documents",
      { docId: "@item()?['id']", tag: "@item()?['category']", created: "@item()?['createdDate']" }],
    ["RemapInvoices", "$.invoices",
      { invoiceId: "@item()?['number']", amount: "@item()?['totalAmount']", dueDate: "@item()?['due']" }],
  ];

  for (const [name, path, fields] of selectCases) {
    pairs.push(mapToSelect(name, path, fields));
  }

  // ── Azure Foreach → AWS Map (reverse direction) ──────────────────────────
  const reverseForEachCases: [string, string, string][] = [
    ["SendBatchEmails",   "emails",   "SendEmailFn"],
    ["ProcessBatchOrders","orders",   "ProcessOrderFn"],
    ["ValidateBatch",     "records",  "ValidateRecordFn"],
    ["BulkUpdate",        "items",    "UpdateItemFn"],
    ["BatchNotify",       "users",    "NotifyUserFn"],
  ];

  for (const [name, arrayField, fn] of reverseForEachCases) {
    pairs.push(pair("azure-to-aws",
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [name]: {
            type: "Foreach",
            foreach: `@triggerBody()?['${arrayField}']`,
            actions: {
              [fn.replace("Fn","")]: {
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
            ItemsPath: `$.${arrayField}`,
            MaxConcurrency: 0,
            ItemProcessor: {
              ProcessorConfig: { Mode: "INLINE" },
              StartAt: fn.replace("Fn",""),
              States: {
                [fn.replace("Fn","")]: {
                  Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
                  Parameters: { FunctionName: fn, "Payload.$": "$" }, End: true
                }
              }
            },
            End: true
          }
        }
      })
    ));
  }

  return pairs;
}
