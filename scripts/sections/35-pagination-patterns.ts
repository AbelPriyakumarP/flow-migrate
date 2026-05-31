/**
 * Section 35 – Pagination patterns
 *
 * Real enterprise workflows must handle paginated API responses:
 *   - DynamoDB: LastEvaluatedKey → ExclusiveStartKey loop
 *   - S3 ListObjectsV2: NextContinuationToken → ContinuationToken loop
 *   - SQS ReceiveMessage: loop until queue empty
 *   - Generic REST API: nextPageToken / cursor-based pagination
 *   - AWS SDK pagination (MaxResults + NextToken)
 *
 * Azure Logic Apps handles pagination via:
 *   - Until loop (do-while equivalent)
 *   - InitializeVariable for token tracking
 *   - AppendToArrayVariable for accumulation
 *
 * References:
 *   https://docs.aws.amazon.com/step-functions/latest/dg/tutorial-create-iterate-pattern-section.html
 *   https://learn.microsoft.com/en-us/azure/logic-apps/logic-apps-control-flow-loops#until-loop
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

export function paginationPatternPairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // ── DynamoDB pagination loop ──────────────────────────────────────────────
  const dynamodbPaginationCases: [string, string, string][] = [
    ["ScanAllOrders",     "Orders",    "ProcessAllOrders"],
    ["ScanAllUsers",      "Users",     "ExportAllUsers"],
    ["ScanAllProducts",   "Products",  "ReindexAllProducts"],
    ["QueryAllEvents",    "Events",    "ArchiveEvents"],
  ];

  for (const [name, tableName, next] of dynamodbPaginationCases) {
    pairs.push(pair("aws-to-azure",
      j({
        Comment: `Paginated DynamoDB scan of ${tableName} table`,
        StartAt: "InitPagination",
        States: {
          InitPagination: {
            Type: "Pass",
            Result: { items: [], lastKey: null, done: false },
            ResultPath: "$.pagination",
            Next: "ScanPage"
          },
          ScanPage: {
            Type: "Task",
            Resource: "arn:aws:states:::aws-sdk:dynamodb:scan",
            Parameters: {
              TableName: tableName,
              Limit: 100,
              "ExclusiveStartKey.$": "$.pagination.lastKey"
            },
            ResultPath: "$.scanResult",
            Next: "CheckMorePages"
          },
          CheckMorePages: {
            Type: "Choice",
            Choices: [{
              Variable: "$.scanResult.LastEvaluatedKey",
              IsPresent: true,
              Next: "AccumulateAndContinue"
            }],
            Default: "AccumulateAndFinish"
          },
          AccumulateAndContinue: {
            Type: "Pass",
            Parameters: {
              "items.$": "States.Array($.pagination.items, $.scanResult.Items)",
              "lastKey.$": "$.scanResult.LastEvaluatedKey",
              done: false
            },
            ResultPath: "$.pagination",
            Next: "ScanPage"
          },
          AccumulateAndFinish: {
            Type: "Pass",
            Parameters: {
              "items.$": "States.Array($.pagination.items, $.scanResult.Items)",
              lastKey: null,
              done: true
            },
            ResultPath: "$.pagination",
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
          InitLastKey: {
            type: "InitializeVariable",
            inputs: { variables: [{ name: "lastKey", type: "object", value: null }] },
            runAfter: {}
          },
          InitAllItems: {
            type: "InitializeVariable",
            inputs: { variables: [{ name: "allItems", type: "array", value: [] }] },
            runAfter: { InitLastKey: ["Succeeded"] }
          },
          PaginatedScan: {
            type: "Until",
            expression: "@equals(variables('lastKey'), null)",
            limit: { count: 1000 },
            actions: {
              ScanPage: {
                type: "ApiConnection",
                inputs: {
                  host: { connection: { name: "@parameters('$connections')['documentdb']['connectionId']" } },
                  method: "post",
                  path: `/v2/databases/${tableName}/colls/${tableName}/docs`,
                  body: {
                    query: "SELECT * FROM c",
                    parameters: [],
                    continuationToken: "@variables('lastKey')"
                  }
                },
                runAfter: {}
              },
              AppendPageItems: {
                type: "AppendToArrayVariable",
                inputs: {
                  name: "allItems",
                  value: "@body('ScanPage')?['Documents']"
                },
                runAfter: { ScanPage: ["Succeeded"] }
              },
              UpdateLastKey: {
                type: "SetVariable",
                inputs: {
                  name: "lastKey",
                  value: "@body('ScanPage')?['_continuation']"
                },
                runAfter: { AppendPageItems: ["Succeeded"] }
              }
            },
            runAfter: { InitAllItems: ["Succeeded"] }
          },
          [next]: {
            type: "Function",
            inputs: {
              function: { id: `/sub/rg/app/functions/${next}Fn` },
              body: {
                items: "@variables('allItems')",
                original: "@triggerBody()"
              }
            },
            runAfter: { PaginatedScan: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── S3 ListObjectsV2 pagination ───────────────────────────────────────────
  const s3ListCases: [string, string, string, string][] = [
    ["ListAllDocuments",  "docs-bucket",    "documents/",  "ProcessAllDocuments"],
    ["ListAllImages",     "media-bucket",   "images/",     "BatchProcessImages"],
    ["ListAllLogs",       "logs-bucket",    "2024/",       "ArchiveAllLogs"],
  ];

  for (const [name, bucket, prefix, next] of s3ListCases) {
    pairs.push(pair("aws-to-azure",
      j({
        Comment: `Paginated S3 listing of s3://${bucket}/${prefix}`,
        StartAt: "InitS3Pagination",
        States: {
          InitS3Pagination: {
            Type: "Pass",
            Result: { files: [], continuationToken: null, isTruncated: true },
            ResultPath: "$.s3Pagination",
            Next: "ListPage"
          },
          ListPage: {
            Type: "Task",
            Resource: "arn:aws:states:::aws-sdk:s3:listObjectsV2",
            Parameters: {
              Bucket: bucket,
              Prefix: prefix,
              MaxKeys: 1000,
              "ContinuationToken.$": "$.s3Pagination.continuationToken"
            },
            ResultPath: "$.listResult",
            Next: "CheckTruncated"
          },
          CheckTruncated: {
            Type: "Choice",
            Choices: [{
              Variable: "$.listResult.IsTruncated",
              BooleanEquals: true,
              Next: "ContinuePaging"
            }],
            Default: "FinishListing"
          },
          ContinuePaging: {
            Type: "Pass",
            Parameters: {
              "files.$": "States.Array($.s3Pagination.files, $.listResult.Contents)",
              "continuationToken.$": "$.listResult.NextContinuationToken",
              isTruncated: true
            },
            ResultPath: "$.s3Pagination",
            Next: "ListPage"
          },
          FinishListing: {
            Type: "Pass",
            Parameters: {
              "files.$": "States.Array($.s3Pagination.files, $.listResult.Contents)",
              continuationToken: null,
              isTruncated: false
            },
            ResultPath: "$.s3Pagination",
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
          InitContinuationToken: {
            type: "InitializeVariable",
            inputs: { variables: [{ name: "continuationToken", type: "string", value: "" }] },
            runAfter: {}
          },
          InitAllFiles: {
            type: "InitializeVariable",
            inputs: { variables: [{ name: "allFiles", type: "array", value: [] }] },
            runAfter: { InitContinuationToken: ["Succeeded"] }
          },
          PaginatedList: {
            type: "Until",
            expression: "@equals(variables('continuationToken'), 'DONE')",
            limit: { count: 500 },
            actions: {
              ListBlobs: {
                type: "ApiConnection",
                inputs: {
                  host: { connection: { name: "@parameters('$connections')['azureblob']['connectionId']" } },
                  method: "get",
                  path: `/v2/datasets/@{encodeURIComponent(encodeURIComponent('${bucket}'))}/foldersV2/@{encodeURIComponent(encodeURIComponent('${prefix}'))}`,
                  queries: {
                    maxFileCount: 1000,
                    nextPageMarker: "@variables('continuationToken')"
                  }
                },
                runAfter: {}
              },
              AppendFiles: {
                type: "AppendToArrayVariable",
                inputs: {
                  name: "allFiles",
                  value: "@body('ListBlobs')?['value']"
                },
                runAfter: { ListBlobs: ["Succeeded"] }
              },
              UpdateToken: {
                type: "SetVariable",
                inputs: {
                  name: "continuationToken",
                  value: "@if(empty(body('ListBlobs')?['nextLink']), 'DONE', body('ListBlobs')?['nextLink'])"
                },
                runAfter: { AppendFiles: ["Succeeded"] }
              }
            },
            runAfter: { InitAllFiles: ["Succeeded"] }
          },
          [next]: {
            type: "Function",
            inputs: {
              function: { id: `/sub/rg/app/functions/${next}Fn` },
              body: {
                files: "@variables('allFiles')",
                original: "@triggerBody()"
              }
            },
            runAfter: { PaginatedList: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── Generic REST API pagination (nextPageToken) ───────────────────────────
  const apiPaginationCases: [string, string, string][] = [
    ["FetchAllCustomers",   "https://api.example.com/customers",  "ProcessCustomers"],
    ["FetchAllTransactions","https://api.example.com/transactions","ReconcileTransactions"],
    ["FetchAllProducts",    "https://api.example.com/products",   "SyncProductCatalog"],
  ];

  for (const [name, apiBase, next] of apiPaginationCases) {
    pairs.push(pair("aws-to-azure",
      j({
        Comment: `Paginated REST API fetch from ${apiBase}`,
        StartAt: "InitApiPagination",
        States: {
          InitApiPagination: {
            Type: "Pass",
            Result: { records: [], nextPageToken: null, hasMore: true },
            ResultPath: "$.apiPagination",
            Next: "FetchPage"
          },
          FetchPage: {
            Type: "Task",
            Resource: "arn:aws:states:::http:invoke",
            Parameters: {
              Method: "GET",
              ApiEndpoint: `${apiBase}?limit=100`,
              Headers: {
                "Content-Type": "application/json",
                "Authorization.$": "States.Format('Bearer {}', $.apiKey)"
              },
              QueryParameters: {
                "pageToken.$": "$.apiPagination.nextPageToken"
              }
            },
            ResultSelector: {
              "data.$": "$.ResponseBody.data",
              "nextPageToken.$": "$.ResponseBody.nextPageToken",
              "hasMore.$": "$.ResponseBody.hasMore"
            },
            ResultPath: "$.pageResult",
            Next: "CheckHasMore"
          },
          CheckHasMore: {
            Type: "Choice",
            Choices: [{
              Variable: "$.pageResult.hasMore",
              BooleanEquals: true,
              Next: "AppendAndContinue"
            }],
            Default: "AppendAndFinish"
          },
          AppendAndContinue: {
            Type: "Pass",
            Parameters: {
              "records.$": "States.Array($.apiPagination.records, $.pageResult.data)",
              "nextPageToken.$": "$.pageResult.nextPageToken",
              hasMore: true
            },
            ResultPath: "$.apiPagination",
            Next: "FetchPage"
          },
          AppendAndFinish: {
            Type: "Pass",
            Parameters: {
              "records.$": "States.Array($.apiPagination.records, $.pageResult.data)",
              nextPageToken: null,
              hasMore: false
            },
            ResultPath: "$.apiPagination",
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
          InitPageToken: {
            type: "InitializeVariable",
            inputs: { variables: [{ name: "pageToken", type: "string", value: "" }] },
            runAfter: {}
          },
          InitAllRecords: {
            type: "InitializeVariable",
            inputs: { variables: [{ name: "allRecords", type: "array", value: [] }] },
            runAfter: { InitPageToken: ["Succeeded"] }
          },
          PaginatedFetch: {
            type: "Until",
            expression: "@not(body('FetchPage')?['hasMore'])",
            limit: { count: 200, timeout: "PT1H" },
            actions: {
              FetchPage: {
                type: "Http",
                inputs: {
                  method: "GET",
                  uri: `${apiBase}?limit=100&pageToken=@{variables('pageToken')}`,
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: "@concat('Bearer ', triggerBody()?['apiKey'])"
                  }
                },
                runAfter: {}
              },
              AppendPageRecords: {
                type: "AppendToArrayVariable",
                inputs: {
                  name: "allRecords",
                  value: "@body('FetchPage')?['data']"
                },
                runAfter: { FetchPage: ["Succeeded"] }
              },
              UpdatePageToken: {
                type: "SetVariable",
                inputs: {
                  name: "pageToken",
                  value: "@body('FetchPage')?['nextPageToken']"
                },
                runAfter: { AppendPageRecords: ["Succeeded"] }
              }
            },
            runAfter: { InitAllRecords: ["Succeeded"] }
          },
          [next]: {
            type: "Function",
            inputs: {
              function: { id: `/sub/rg/app/functions/${next}Fn` },
              body: {
                records: "@variables('allRecords')",
                original: "@triggerBody()"
              }
            },
            runAfter: { PaginatedFetch: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── SQS drain loop (poll until empty) ─────────────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      Comment: "Drain SQS queue: poll until no messages remain",
      StartAt: "InitDrain",
      States: {
        InitDrain: {
          Type: "Pass",
          Result: { messages: [], hasMore: true, totalProcessed: 0 },
          ResultPath: "$.drain",
          Next: "ReceiveBatch"
        },
        ReceiveBatch: {
          Type: "Task",
          Resource: "arn:aws:states:::aws-sdk:sqs:receiveMessage",
          Parameters: {
            "QueueUrl.$": "$.queueUrl",
            MaxNumberOfMessages: 10,
            WaitTimeSeconds: 5
          },
          ResultPath: "$.batch",
          Next: "CheckBatchEmpty"
        },
        CheckBatchEmpty: {
          Type: "Choice",
          Choices: [{
            Variable: "$.batch.Messages[0]",
            IsPresent: true,
            Next: "ProcessBatch"
          }],
          Default: "DrainComplete"
        },
        ProcessBatch: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ProcessSQSBatchFn", "Payload.$": "$" },
          ResultPath: "$.processResult",
          Next: "DeleteProcessed"
        },
        DeleteProcessed: {
          Type: "Task",
          Resource: "arn:aws:states:::aws-sdk:sqs:deleteMessageBatch",
          Parameters: {
            "QueueUrl.$": "$.queueUrl",
            "Entries.$": "$.processResult.Payload.deleteEntries"
          },
          ResultPath: "$.deleteResult",
          Next: "ReceiveBatch"
        },
        DrainComplete: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "DrainCompleteFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        InitTotalProcessed: {
          type: "InitializeVariable",
          inputs: { variables: [{ name: "totalProcessed", type: "integer", value: 0 }] },
          runAfter: {}
        },
        DrainQueue: {
          type: "Until",
          expression: "@equals(variables('totalProcessed'), -1)",
          limit: { count: 1000, timeout: "PT2H" },
          actions: {
            ReceiveBatch: {
              type: "ApiConnection",
              inputs: {
                host: { connection: { name: "@parameters('$connections')['servicebus']['connectionId']" } },
                method: "get",
                path: "/@{encodeURIComponent(triggerBody()?['queueName'])}/messages/batch/head",
                queries: { maxMessageCount: 10 }
              },
              runAfter: {}
            },
            CheckEmpty: {
              type: "If",
              expression: { and: [{ greater: ["@length(body('ReceiveBatch'))", 0] }] },
              actions: {
                ProcessBatch: {
                  type: "Function",
                  inputs: {
                    function: { id: "/sub/rg/app/functions/ProcessSQSBatchFn" },
                    body: "@body('ReceiveBatch')"
                  },
                  runAfter: {}
                },
                UpdateCount: {
                  type: "IncrementVariable",
                  inputs: {
                    name: "totalProcessed",
                    value: "@length(body('ReceiveBatch'))"
                  },
                  runAfter: { ProcessBatch: ["Succeeded"] }
                }
              },
              else: {
                actions: {
                  SignalDone: {
                    type: "SetVariable",
                    inputs: { name: "totalProcessed", value: -1 },
                    runAfter: {}
                  }
                }
              },
              runAfter: { ReceiveBatch: ["Succeeded"] }
            }
          },
          runAfter: { InitTotalProcessed: ["Succeeded"] }
        },
        DrainComplete: {
          type: "Function",
          inputs: {
            function: { id: "/sub/rg/app/functions/DrainCompleteFn" },
            body: {
              totalProcessed: "@variables('totalProcessed')",
              original: "@triggerBody()"
            }
          },
          runAfter: { DrainQueue: ["Succeeded"] }
        }
      }
    })
  ));

  return pairs;
}
