/**
 * Section 31 – Distributed Map (DISTRIBUTED mode)
 *
 * AWS Step Functions supports two Map execution modes:
 *   - INLINE (default): runs within the parent workflow, max 40 concurrent iterations
 *   - DISTRIBUTED: runs child workflows independently, handles millions of items
 *     Uses ItemReader to read from S3 / JSON array / CSV
 *     Uses ItemWriter to write results to S3
 *     Uses ToleratedFailurePercentage / ToleratedFailureCount for fault tolerance
 *
 * Azure Logic Apps equivalent:
 *   - Foreach with concurrency control for most scenarios
 *   - For very large scale: Azure Data Factory pipeline with ForEach activity
 *     or Foreach with chunking via InitializeVariable + SetVariable
 *
 * References:
 *   https://docs.aws.amazon.com/step-functions/latest/dg/concepts-asl-use-map-state-distributed.html
 *   https://docs.aws.amazon.com/step-functions/latest/dg/input-output-itemreader.html
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

export function distributedMapPairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // ── Distributed Map with S3 ItemReader → Azure Foreach ───────────────────
  const distributedS3Cases: [string, string, string, number, string][] = [
    ["ProcessS3Records",    "my-data-bucket", "input/records.json",  100, "AggregateResults"],
    ["BatchTransformData",  "etl-bucket",     "raw/batch.csv",       50,  "ValidateOutput"],
    ["ProcessLogEntries",   "logs-bucket",    "daily/logs.json",     200, "IndexLogs"],
    ["ProcessInvoices",     "invoice-bucket", "pending/invoices.csv",75,  "StoreProcessed"],
    ["ReprocessFailedItems","retry-bucket",   "failed/items.json",   30,  "NotifyComplete"],
  ];

  for (const [name, bucket, key, concurrency, next] of distributedS3Cases) {
    const isCsv = key.endsWith(".csv");
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Map",
            ItemProcessor: {
              ProcessorConfig: {
                Mode: "DISTRIBUTED",
                ExecutionType: "STANDARD"
              },
              StartAt: "ProcessItem",
              States: {
                ProcessItem: {
                  Type: "Task",
                  Resource: "arn:aws:states:::lambda:invoke",
                  Parameters: { FunctionName: "ProcessItemFn", "Payload.$": "$" },
                  End: true
                }
              }
            },
            ItemReader: {
              Resource: isCsv
                ? "arn:aws:states:::s3:getObject"
                : "arn:aws:states:::s3:getObject",
              ReaderConfig: {
                InputType: isCsv ? "CSV" : "JSON",
                CSVHeaderLocation: isCsv ? "FIRST_ROW" : undefined
              },
              Parameters: {
                Bucket: bucket,
                Key: key
              }
            },
            MaxConcurrency: concurrency,
            ToleratedFailurePercentage: 10,
            ItemWriter: {
              Resource: "arn:aws:states:::s3:putObject",
              Parameters: {
                Bucket: `${bucket}-results`,
                "Prefix.$": "States.Format('results/{}/{}', $.executionId, States.UUID())"
              }
            },
            Next: next
          },
          [next]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${next}Fn`, "Payload.$": "$" },
            End: true
          }
        }
      }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          ReadSourceFile: {
            type: "ApiConnection",
            inputs: {
              host: { connection: { name: "@parameters('$connections')['azureblob']['connectionId']" } },
              method: "get",
              path: `/v2/datasets/@{encodeURIComponent(encodeURIComponent('${bucket}'))}/files/@{encodeURIComponent(encodeURIComponent('${key}'))}/content`
            },
            runAfter: {}
          },
          ParseItems: {
            type: "ParseJson",
            inputs: {
              content: "@body('ReadSourceFile')",
              schema: { type: "array", items: { type: "object" } }
            },
            runAfter: { ReadSourceFile: ["Succeeded"] }
          },
          [name]: {
            type: "Foreach",
            foreach: "@body('ParseItems')",
            actions: {
              ProcessItem: {
                type: "Function",
                inputs: {
                  function: { id: "/sub/rg/app/functions/ProcessItemFn" },
                  body: "@items('" + name + "')"
                },
                runAfter: {}
              }
            },
            runtimeConfiguration: {
              concurrency: { repetitions: concurrency }
            },
            operationOptions: "WithStatelessRunCondition",
            runAfter: { ParseItems: ["Succeeded"] }
          },
          [next]: {
            type: "Function",
            inputs: {
              function: { id: `/sub/rg/app/functions/${next}Fn` },
              body: "@triggerBody()"
            },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── Distributed Map with inline JSON array ────────────────────────────────
  const distributedInlineArrayCases: [string, string, number, string][] = [
    ["ProcessOrderBatch",   "orderItems",   20, "FinalizeOrders"],
    ["SendBulkNotifications","recipients",  50, "TrackDelivery"],
    ["TransformRecordBatch", "records",     30, "StoreTransformed"],
    ["ValidateInputBatch",   "inputItems",  10, "ReportValidation"],
  ];

  for (const [name, itemsField, concurrency, next] of distributedInlineArrayCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Map",
            ItemProcessor: {
              ProcessorConfig: {
                Mode: "DISTRIBUTED",
                ExecutionType: "EXPRESS"
              },
              StartAt: "HandleItem",
              States: {
                HandleItem: {
                  Type: "Task",
                  Resource: "arn:aws:states:::lambda:invoke",
                  Parameters: { FunctionName: "HandleItemFn", "Payload.$": "$" },
                  End: true
                }
              }
            },
            "ItemsPath.$": `$.${itemsField}`,
            MaxConcurrency: concurrency,
            ToleratedFailureCount: 5,
            ResultPath: "$.batchResults",
            Next: next
          },
          [next]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${next}Fn`, "Payload.$": "$" },
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
            foreach: `@triggerBody()?['${itemsField}']`,
            actions: {
              HandleItem: {
                type: "Function",
                inputs: {
                  function: { id: "/sub/rg/app/functions/HandleItemFn" },
                  body: "@items('" + name + "')"
                },
                runAfter: {}
              }
            },
            runtimeConfiguration: {
              concurrency: { repetitions: concurrency }
            },
            runAfter: {}
          },
          [next]: {
            type: "Function",
            inputs: {
              function: { id: `/sub/rg/app/functions/${next}Fn` },
              body: "@triggerBody()"
            },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── Distributed Map with error tolerance ─────────────────────────────────
  const toleratedFailureCases: [string, number | undefined, number | undefined, string][] = [
    ["BestEffortProcessing",  25,        undefined, "CollectResults"],
    ["StrictProcessing",      0,         undefined, "VerifyAllProcessed"],
    ["PartialTolerant",       undefined, 100,       "HandlePartialFailure"],
    ["HighToleranceJob",      50,        undefined, "FinalizeJob"],
  ];

  for (const [name, pct, count, next] of toleratedFailureCases) {
    const toleranceField = pct !== undefined
      ? { ToleratedFailurePercentage: pct }
      : { ToleratedFailureCount: count };

    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Map",
            ItemProcessor: {
              ProcessorConfig: { Mode: "DISTRIBUTED", ExecutionType: "STANDARD" },
              StartAt: "ProcessEntry",
              States: {
                ProcessEntry: {
                  Type: "Task",
                  Resource: "arn:aws:states:::lambda:invoke",
                  Parameters: { FunctionName: "ProcessEntryFn", "Payload.$": "$" },
                  End: true
                }
              }
            },
            ItemReader: {
              Resource: "arn:aws:states:::s3:getObject",
              ReaderConfig: { InputType: "JSON" },
              Parameters: { "Bucket.$": "$.sourceBucket", "Key.$": "$.sourceKey" }
            },
            MaxConcurrency: 50,
            ...toleranceField,
            ResultPath: "$.mapResults",
            Next: next
          },
          [next]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${next}Fn`, "Payload.$": "$" },
            End: true
          }
        }
      }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          ReadSource: {
            type: "ApiConnection",
            inputs: {
              host: { connection: { name: "@parameters('$connections')['azureblob']['connectionId']" } },
              method: "get",
              path: "/v2/datasets/@{encodeURIComponent(encodeURIComponent(triggerBody()?['sourceBucket']))}/files/@{encodeURIComponent(encodeURIComponent(triggerBody()?['sourceKey']))}/content"
            },
            runAfter: {}
          },
          ParseSource: {
            type: "ParseJson",
            inputs: {
              content: "@body('ReadSource')",
              schema: { type: "array", items: { type: "object" } }
            },
            runAfter: { ReadSource: ["Succeeded"] }
          },
          [name]: {
            type: "Foreach",
            foreach: "@body('ParseSource')",
            actions: {
              ProcessEntry: {
                type: "Function",
                inputs: {
                  function: { id: "/sub/rg/app/functions/ProcessEntryFn" },
                  body: "@items('" + name + "')"
                },
                runAfter: {}
              }
            },
            runtimeConfiguration: {
              concurrency: { repetitions: 50 }
            },
            // Azure: use runAfter ["Failed"] to handle partial failures
            runAfter: { ParseSource: ["Succeeded"] }
          },
          [next]: {
            type: "Function",
            inputs: {
              function: { id: `/sub/rg/app/functions/${next}Fn` },
              body: "@triggerBody()"
            },
            runAfter: { [name]: ["Succeeded", "Failed"] }
          }
        }
      })
    ));
  }

  // ── Distributed Map with ItemSelector (context injection) ─────────────────
  const itemSelectorCases: [string, string][] = [
    ["EnrichEachItem",   "StoreEnriched"],
    ["TagEachRecord",    "IndexTagged"],
    ["StampEachMessage", "DispatchMessages"],
  ];

  for (const [name, next] of itemSelectorCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Map",
            ItemProcessor: {
              ProcessorConfig: { Mode: "DISTRIBUTED", ExecutionType: "EXPRESS" },
              StartAt: "EnrichItem",
              States: {
                EnrichItem: {
                  Type: "Task",
                  Resource: "arn:aws:states:::lambda:invoke",
                  Parameters: { FunctionName: "EnrichItemFn", "Payload.$": "$" },
                  End: true
                }
              }
            },
            "ItemsPath.$": "$.items",
            ItemSelector: {
              "item.$": "$$.Map.Item.Value",
              "index.$": "$$.Map.Item.Index",
              "executionId.$": "$$.Execution.Id",
              "batchId.$": "$.batchId"
            },
            MaxConcurrency: 40,
            ResultPath: "$.enrichedItems",
            Next: next
          },
          [next]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${next}Fn`, "Payload.$": "$" },
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
            foreach: "@triggerBody()?['items']",
            actions: {
              EnrichItem: {
                type: "Function",
                inputs: {
                  function: { id: "/sub/rg/app/functions/EnrichItemFn" },
                  body: {
                    item: "@items('" + name + "')",
                    index: "@indexOf(triggerBody()?['items'], items('" + name + "'))",
                    executionId: "@{workflow().run.name}",
                    batchId: "@triggerBody()?['batchId']"
                  }
                },
                runAfter: {}
              }
            },
            runtimeConfiguration: { concurrency: { repetitions: 40 } },
            runAfter: {}
          },
          [next]: {
            type: "Function",
            inputs: {
              function: { id: `/sub/rg/app/functions/${next}Fn` },
              body: "@triggerBody()"
            },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  return pairs;
}
