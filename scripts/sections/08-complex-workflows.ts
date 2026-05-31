/**
 * Section 08 – Complex multi-state workflows (both directions)
 * Full end-to-end patterns combining multiple constructs.
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

export function complexWorkflowPairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // ── 1. Order processing pipeline (AWS→Azure) ─────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "ValidateOrder",
      States: {
        ValidateOrder: {
          Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ValidateOrderFn", "Payload.$": "$" },
          Retry: [{ ErrorEquals: ["States.ALL"], IntervalSeconds: 2, MaxAttempts: 3, BackoffRate: 2 }],
          Catch: [{ ErrorEquals: ["States.ALL"], Next: "OrderValidationFailed" }],
          Next: "CheckInventory"
        },
        CheckInventory: {
          Type: "Task", Resource: "arn:aws:states:::dynamodb:getItem",
          Parameters: { TableName: "Inventory", Key: { productId: { "S.$": "$.productId" } } },
          ResultPath: "$.inventoryItem",
          Next: "IsInStock"
        },
        IsInStock: {
          Type: "Choice",
          Choices: [{ Variable: "$.inventoryItem.Item.quantity.N", NumericGreaterThan: 0, Next: "ReserveInventory" }],
          Default: "OutOfStock"
        },
        ReserveInventory: {
          Type: "Task", Resource: "arn:aws:states:::dynamodb:updateItem",
          Parameters: {
            TableName: "Inventory",
            Key: { productId: { "S.$": "$.productId" } },
            UpdateExpression: "SET quantity = quantity - :q",
            ExpressionAttributeValues: { ":q": { "N.$": "States.Format('{}', $.quantity)" } }
          },
          ResultPath: null,
          Next: "ProcessPayment"
        },
        ProcessPayment: {
          Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "PaymentFn", "Payload.$": "$" },
          Catch: [{ ErrorEquals: ["States.ALL"], Next: "ReleaseInventory" }],
          Next: "NotifyCustomer"
        },
        NotifyCustomer: {
          Type: "Task", Resource: "arn:aws:states:::sns:publish",
          Parameters: {
            TopicArn: "arn:aws:sns:us-east-1:123456789012:OrdersTopic",
            "Message.$": "States.Format('Order {} confirmed', $.orderId)"
          },
          End: true
        },
        ReleaseInventory: {
          Type: "Task", Resource: "arn:aws:states:::dynamodb:updateItem",
          Parameters: {
            TableName: "Inventory",
            Key: { productId: { "S.$": "$.productId" } },
            UpdateExpression: "SET quantity = quantity + :q",
            ExpressionAttributeValues: { ":q": { "N.$": "States.Format('{}', $.quantity)" } }
          },
          ResultPath: null,
          Next: "OrderPaymentFailed"
        },
        OrderPaymentFailed: {
          Type: "Fail", Error: "PaymentFailed", Cause: "Payment processing failed"
        },
        OutOfStock: {
          Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "OutOfStockNotifyFn", "Payload.$": "$" },
          Next: "OrderFailed"
        },
        OrderFailed: { Type: "Fail", Error: "OrderFailed", Cause: "Order could not be fulfilled" },
        OrderValidationFailed: { Type: "Fail", Error: "ValidationFailed", Cause: "Order validation failed" }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        ValidateOrder: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ValidateOrderFn" }, body: "@triggerBody()" },
          retryPolicy: { type: "exponential", count: 3, interval: "PT2S", minimumInterval: "PT2S", maximumInterval: "PT1H" },
          runAfter: {}
        },
        OrderValidationFailed: {
          type: "Terminate",
          inputs: { runStatus: "Failed", runError: { code: "ValidationFailed", message: "Order validation failed" } },
          runAfter: { ValidateOrder: ["Failed", "TimedOut"] }
        },
        CheckInventory: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['documentdb']['connectionId']" } },
            method: "get",
            path: "/dbs/@{encodeURIComponent('Inventory')}/colls/@{encodeURIComponent('inventory')}/docs/@{encodeURIComponent(triggerBody()?['productId'])}"
          },
          runAfter: { ValidateOrder: ["Succeeded"] }
        },
        IsInStock: {
          type: "If",
          expression: { and: [{ greater: ["@body('CheckInventory')?['quantity']", 0] }] },
          actions: {
            ReserveInventory: {
              type: "ApiConnection",
              inputs: {
                host: { connection: { name: "@parameters('$connections')['documentdb']['connectionId']" } },
                method: "put",
                path: "/dbs/@{encodeURIComponent('Inventory')}/colls/@{encodeURIComponent('inventory')}/docs/@{encodeURIComponent(triggerBody()?['productId'])}",
                body: { id: "@triggerBody()?['productId']", quantity: "@sub(body('CheckInventory')?['quantity'], triggerBody()?['quantity'])" }
              },
              runAfter: {}
            },
            ProcessPayment: {
              type: "Function",
              inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/PaymentFn" }, body: "@triggerBody()" },
              runAfter: { ReserveInventory: ["Succeeded"] }
            },
            ReleaseInventory: {
              type: "ApiConnection",
              inputs: {
                host: { connection: { name: "@parameters('$connections')['documentdb']['connectionId']" } },
                method: "put",
                path: "/dbs/@{encodeURIComponent('Inventory')}/colls/@{encodeURIComponent('inventory')}/docs/@{encodeURIComponent(triggerBody()?['productId'])}",
                body: { id: "@triggerBody()?['productId']", quantity: "@add(body('CheckInventory')?['quantity'], triggerBody()?['quantity'])" }
              },
              runAfter: { ProcessPayment: ["Failed", "TimedOut"] }
            },
            NotifyCustomer: {
              type: "ApiConnection",
              inputs: {
                host: { connection: { name: "@parameters('$connections')['servicebus']['connectionId']" } },
                method: "post",
                path: "/@{encodeURIComponent('OrdersTopic')}/messages",
                body: { ContentData: "@{base64(concat('Order ', triggerBody()?['orderId'], ' confirmed'))}" }
              },
              runAfter: { ProcessPayment: ["Succeeded"] }
            }
          },
          else: {
            actions: {
              OutOfStock: {
                type: "Function",
                inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/OutOfStockNotifyFn" }, body: "@triggerBody()" },
                runAfter: {}
              },
              OrderFailed: {
                type: "Terminate",
                inputs: { runStatus: "Failed", runError: { code: "OrderFailed", message: "Order could not be fulfilled" } },
                runAfter: { OutOfStock: ["Succeeded"] }
              }
            }
          },
          runAfter: { CheckInventory: ["Succeeded"] }
        }
      }
    })
  ));

  // ── 2. Document approval workflow (Azure→AWS) ─────────────────────────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        Init_reviewStatus: {
          type: "InitializeVariable",
          inputs: { variables: [{ name: "reviewStatus", type: "String", value: "pending" }] },
          runAfter: {}
        },
        ValidateDocument: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/app/functions/ValidateDocFn" }, body: "@triggerBody()" },
          runAfter: { Init_reviewStatus: ["Succeeded"] }
        },
        CheckDocumentType: {
          type: "Switch",
          expression: "@triggerBody()?['documentType']",
          cases: {
            contract: {
              case: "contract",
              actions: {
                LegalReview: {
                  type: "Function",
                  inputs: { function: { id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/app/functions/LegalReviewFn" }, body: "@body('ValidateDocument')" },
                  runAfter: {}
                }
              }
            },
            invoice: {
              case: "invoice",
              actions: {
                FinanceReview: {
                  type: "Function",
                  inputs: { function: { id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/app/functions/FinanceReviewFn" }, body: "@body('ValidateDocument')" },
                  runAfter: {}
                }
              }
            }
          },
          default: {
            actions: {
              StandardReview: {
                type: "Function",
                inputs: { function: { id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/app/functions/StandardReviewFn" }, body: "@body('ValidateDocument')" },
                runAfter: {}
              }
            }
          },
          runAfter: { ValidateDocument: ["Succeeded"] }
        },
        ArchiveDocument: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['azureblob']['connectionId']" } },
            method: "post",
            path: "/datasets/default/files",
            queries: { folderPath: "/archive", name: "@{triggerBody()?['documentId']}.json" },
            body: "@triggerBody()"
          },
          runAfter: { CheckDocumentType: ["Succeeded"] }
        }
      }
    }),
    j({
      StartAt: "ValidateDocument",
      States: {
        ValidateDocument: {
          Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ValidateDocFn", "Payload.$": "$" },
          ResultPath: "$.validationResult",
          Next: "CheckDocumentType"
        },
        CheckDocumentType: {
          Type: "Choice",
          Choices: [
            { Variable: "$.documentType", StringEquals: "contract", Next: "LegalReview" },
            { Variable: "$.documentType", StringEquals: "invoice",  Next: "FinanceReview" }
          ],
          Default: "StandardReview"
        },
        LegalReview: {
          Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "LegalReviewFn", "Payload.$": "$" },
          Next: "ArchiveDocument"
        },
        FinanceReview: {
          Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "FinanceReviewFn", "Payload.$": "$" },
          Next: "ArchiveDocument"
        },
        StandardReview: {
          Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "StandardReviewFn", "Payload.$": "$" },
          Next: "ArchiveDocument"
        },
        ArchiveDocument: {
          Type: "Task", Resource: "arn:aws:states:::s3:putObject",
          Parameters: {
            Bucket: "document-archive",
            "Key.$": "States.Format('archive/{}.json', $.documentId)",
            "Body.$": "States.JsonToString($)"
          },
          End: true
        }
      }
    })
  ));

  // ── 3. ETL pipeline (AWS→Azure) ───────────────────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "ExtractData",
      States: {
        ExtractData: {
          Type: "Task", Resource: "arn:aws:states:::s3:getObject",
          Parameters: { Bucket: "raw-data-bucket", "Key.$": "$.sourceFile" },
          ResultSelector: { "rawData.$": "$.Body" },
          ResultPath: "$.extracted",
          Next: "TransformData"
        },
        TransformData: {
          Type: "Map",
          ItemsPath: "$.extracted.rawData.records",
          ItemSelector: {
            "id.$": "$$.Map.Item.Value.id",
            "value.$": "$$.Map.Item.Value.amount",
            "category.$": "$$.Map.Item.Value.type"
          },
          ItemProcessor: {
            ProcessorConfig: { Mode: "INLINE" },
            StartAt: "NormalizeRecord",
            States: {
              NormalizeRecord: {
                Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
                Parameters: { FunctionName: "NormalizeFn", "Payload.$": "$" },
                End: true
              }
            }
          },
          ResultPath: "$.transformed",
          Next: "LoadData"
        },
        LoadData: {
          Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "LoadDataFn", Payload: { "records.$": "$.transformed" } },
          Next: "NotifyComplete"
        },
        NotifyComplete: {
          Type: "Task", Resource: "arn:aws:states:::sns:publish",
          Parameters: {
            TopicArn: "arn:aws:sns:us-east-1:123456789012:ETLCompleteTopic",
            "Message.$": "States.Format('ETL complete: {} records processed', States.ArrayLength($.transformed))"
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
        ExtractData: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['azureblob']['connectionId']" } },
            method: "get",
            path: "/datasets/default/files/@{encodeURIComponent(encodeURIComponent(triggerBody()?['sourceFile']))}/content"
          },
          runAfter: {}
        },
        TransformData: {
          type: "Foreach",
          foreach: "@body('ExtractData')?['records']",
          actions: {
            NormalizeRecord: {
              type: "Function",
              inputs: {
                function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/NormalizeFn" },
                body: {
                  id: "@items('TransformData')?['id']",
                  value: "@items('TransformData')?['amount']",
                  category: "@items('TransformData')?['type']"
                }
              },
              runAfter: {}
            }
          },
          runAfter: { ExtractData: ["Succeeded"] }
        },
        LoadData: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/LoadDataFn" },
            body: { records: "@body('TransformData')" }
          },
          runAfter: { TransformData: ["Succeeded"] }
        },
        NotifyComplete: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['servicebus']['connectionId']" } },
            method: "post",
            path: "/@{encodeURIComponent('ETLCompleteTopic')}/messages",
            body: { ContentData: "@{base64(concat('ETL complete: ', string(length(body('TransformData'))), ' records processed'))}" }
          },
          runAfter: { LoadData: ["Succeeded"] }
        }
      }
    })
  ));

  // ── 4. User onboarding workflow (Azure→AWS) ───────────────────────────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        CreateAccount: {
          type: "Function",
          inputs: { function: { id: "/sub/rg/app/functions/CreateAccountFn" }, body: "@triggerBody()" },
          runAfter: {}
        },
        SendWelcomeEmail: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['office365']['connectionId']" } },
            method: "post", path: "/Mail",
            body: { To: "@triggerBody()?['email']", Subject: "Welcome!", Body: "Welcome to our platform." }
          },
          runAfter: { CreateAccount: ["Succeeded"] }
        },
        SetupProfile: {
          type: "Function",
          inputs: { function: { id: "/sub/rg/app/functions/SetupProfileFn" }, body: "@body('CreateAccount')" },
          runAfter: { CreateAccount: ["Succeeded"] }
        },
        GrantPermissions: {
          type: "Function",
          inputs: { function: { id: "/sub/rg/app/functions/GrantPermFn" }, body: "@body('CreateAccount')" },
          runAfter: { SetupProfile: ["Succeeded"] }
        },
        IsAdmin: {
          type: "If",
          expression: { and: [{ equals: ["@triggerBody()?['role']", "admin"] }] },
          actions: {
            GrantAdminAccess: {
              type: "Function",
              inputs: { function: { id: "/sub/rg/app/functions/AdminAccessFn" }, body: "@body('CreateAccount')" },
              runAfter: {}
            }
          },
          else: { actions: {} },
          runAfter: { GrantPermissions: ["Succeeded"] }
        }
      }
    }),
    j({
      StartAt: "CreateAccount",
      States: {
        CreateAccount: {
          Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "CreateAccountFn", "Payload.$": "$" },
          Next: "ParallelOnboarding"
        },
        ParallelOnboarding: {
          Type: "Parallel",
          Branches: [
            {
              StartAt: "SendWelcomeEmail",
              States: {
                SendWelcomeEmail: {
                  Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
                  Parameters: { FunctionName: "SendEmailFn", "Payload.$": "$" }, End: true
                }
              }
            },
            {
              StartAt: "SetupProfile",
              States: {
                SetupProfile: {
                  Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
                  Parameters: { FunctionName: "SetupProfileFn", "Payload.$": "$" },
                  Next: "GrantPermissions"
                },
                GrantPermissions: {
                  Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
                  Parameters: { FunctionName: "GrantPermFn", "Payload.$": "$" }, End: true
                }
              }
            }
          ],
          Next: "IsAdmin"
        },
        IsAdmin: {
          Type: "Choice",
          Choices: [{ Variable: "$.role", StringEquals: "admin", Next: "GrantAdminAccess" }],
          Default: "OnboardingComplete"
        },
        GrantAdminAccess: {
          Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "AdminAccessFn", "Payload.$": "$" }, Next: "OnboardingComplete"
        },
        OnboardingComplete: { Type: "Succeed" }
      }
    })
  ));

  // ── 5. Scheduled report generation (AWS→Azure) ────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "GatherData",
      States: {
        GatherData: {
          Type: "Parallel",
          Branches: [
            {
              StartAt: "GetSalesData",
              States: { GetSalesData: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "SalesDataFn", "Payload.$": "$" }, End: true } }
            },
            {
              StartAt: "GetUserMetrics",
              States: { GetUserMetrics: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "UserMetricsFn", "Payload.$": "$" }, End: true } }
            },
            {
              StartAt: "GetInventoryStatus",
              States: { GetInventoryStatus: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "InventoryStatusFn", "Payload.$": "$" }, End: true } }
            }
          ],
          ResultPath: "$.reportData",
          Next: "GenerateReport"
        },
        GenerateReport: {
          Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "GenerateReportFn", "Payload.$": "$" },
          ResultPath: "$.report",
          Next: "CheckReportSize"
        },
        CheckReportSize: {
          Type: "Choice",
          Choices: [{ Variable: "$.report.sizeKb", NumericGreaterThan: 1000, Next: "StoreInS3" }],
          Default: "SendByEmail"
        },
        StoreInS3: {
          Type: "Task", Resource: "arn:aws:states:::s3:putObject",
          Parameters: { Bucket: "reports-bucket", "Key.$": "States.Format('reports/{}.pdf', $.reportId)", "Body.$": "$.report.content" },
          Next: "NotifyReportReady"
        },
        NotifyReportReady: {
          Type: "Task", Resource: "arn:aws:states:::sns:publish",
          Parameters: {
            TopicArn: "arn:aws:sns:us-east-1:123456789012:ReportsTopic",
            "Message.$": "States.Format('Report {} is ready at s3://reports-bucket/reports/{}.pdf', $.reportId, $.reportId)"
          },
          End: true
        },
        SendByEmail: {
          Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "SendReportEmailFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        GetSalesData:      { type: "Function", inputs: { function: { id: "/sub/rg/app/functions/SalesDataFn" },      body: "@triggerBody()" }, runAfter: {} },
        GetUserMetrics:    { type: "Function", inputs: { function: { id: "/sub/rg/app/functions/UserMetricsFn" },    body: "@triggerBody()" }, runAfter: {} },
        GetInventoryStatus:{ type: "Function", inputs: { function: { id: "/sub/rg/app/functions/InventoryStatusFn" },body: "@triggerBody()" }, runAfter: {} },
        GenerateReport: {
          type: "Function",
          inputs: {
            function: { id: "/sub/rg/app/functions/GenerateReportFn" },
            body: { sales: "@body('GetSalesData')", users: "@body('GetUserMetrics')", inventory: "@body('GetInventoryStatus')" }
          },
          runAfter: { GetSalesData: ["Succeeded"], GetUserMetrics: ["Succeeded"], GetInventoryStatus: ["Succeeded"] }
        },
        CheckReportSize: {
          type: "If",
          expression: { and: [{ greater: ["@body('GenerateReport')?['sizeKb']", 1000] }] },
          actions: {
            StoreInS3: {
              type: "ApiConnection",
              inputs: {
                host: { connection: { name: "@parameters('$connections')['azureblob']['connectionId']" } },
                method: "post",
                path: "/datasets/default/files",
                queries: { folderPath: "/reports", name: "@{triggerBody()?['reportId']}.pdf" },
                body: "@body('GenerateReport')?['content']"
              },
              runAfter: {}
            },
            NotifyReportReady: {
              type: "ApiConnection",
              inputs: {
                host: { connection: { name: "@parameters('$connections')['servicebus']['connectionId']" } },
                method: "post",
                path: "/@{encodeURIComponent('ReportsTopic')}/messages",
                body: { ContentData: "@{base64(concat('Report ', triggerBody()?['reportId'], ' is ready'))}" }
              },
              runAfter: { StoreInS3: ["Succeeded"] }
            }
          },
          else: {
            actions: {
              SendByEmail: {
                type: "Function",
                inputs: { function: { id: "/sub/rg/app/functions/SendReportEmailFn" }, body: "@body('GenerateReport')" },
                runAfter: {}
              }
            }
          },
          runAfter: { GenerateReport: ["Succeeded"] }
        }
      }
    })
  ));

  // ── 6. Retry with poll-until-done pattern (AWS→Azure) ─────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "SubmitJob",
      States: {
        SubmitJob: {
          Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "SubmitJobFn", "Payload.$": "$" },
          ResultPath: "$.job",
          Next: "WaitForJob"
        },
        WaitForJob: { Type: "Wait", Seconds: 30, Next: "CheckJobStatus" },
        CheckJobStatus: {
          Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "CheckJobFn", Payload: { "jobId.$": "$.job.jobId" } },
          ResultPath: "$.jobStatus",
          Next: "IsJobComplete"
        },
        IsJobComplete: {
          Type: "Choice",
          Choices: [
            { Variable: "$.jobStatus.Payload.status", StringEquals: "SUCCEEDED", Next: "ProcessResult" },
            { Variable: "$.jobStatus.Payload.status", StringEquals: "FAILED",    Next: "JobFailed" }
          ],
          Default: "WaitForJob"
        },
        ProcessResult: {
          Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ProcessResultFn", "Payload.$": "$" }, End: true
        },
        JobFailed: { Type: "Fail", Error: "JobFailed", Cause: "Async job reported failure" }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        Init_jobStatus: {
          type: "InitializeVariable",
          inputs: { variables: [{ name: "jobStatus", type: "String", value: "PENDING" }] },
          runAfter: {}
        },
        SubmitJob: {
          type: "Function",
          inputs: { function: { id: "/sub/rg/app/functions/SubmitJobFn" }, body: "@triggerBody()" },
          runAfter: { Init_jobStatus: ["Succeeded"] }
        },
        PollUntilComplete: {
          type: "Until",
          expression: "@or(equals(variables('jobStatus'), 'SUCCEEDED'), equals(variables('jobStatus'), 'FAILED'))",
          limit: { count: 30, timeout: "PT30M" },
          actions: {
            Wait30s: { type: "Wait", inputs: { interval: { unit: "Second", count: 30 } }, runAfter: {} },
            CheckJobStatus: {
              type: "Function",
              inputs: {
                function: { id: "/sub/rg/app/functions/CheckJobFn" },
                body: { jobId: "@body('SubmitJob')?['jobId']" }
              },
              runAfter: { Wait30s: ["Succeeded"] }
            },
            Update_jobStatus: {
              type: "SetVariable",
              inputs: { name: "jobStatus", value: "@body('CheckJobStatus')?['status']" },
              runAfter: { CheckJobStatus: ["Succeeded"] }
            }
          },
          runAfter: { SubmitJob: ["Succeeded"] }
        },
        IsJobSucceeded: {
          type: "If",
          expression: { and: [{ equals: ["@variables('jobStatus')", "SUCCEEDED"] }] },
          actions: {
            ProcessResult: {
              type: "Function",
              inputs: { function: { id: "/sub/rg/app/functions/ProcessResultFn" }, body: "@triggerBody()" },
              runAfter: {}
            }
          },
          else: {
            actions: {
              JobFailed: {
                type: "Terminate",
                inputs: { runStatus: "Failed", runError: { code: "JobFailed", message: "Async job reported failure" } },
                runAfter: {}
              }
            }
          },
          runAfter: { PollUntilComplete: ["Succeeded"] }
        }
      }
    })
  ));

  // ── 7. Multi-region data replication (AWS→Azure) ──────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "ReadSourceData",
      States: {
        ReadSourceData: {
          Type: "Task", Resource: "arn:aws:states:::dynamodb:getItem",
          Parameters: { TableName: "GlobalData", Key: { id: { "S.$": "$.dataId" } } },
          ResultPath: "$.sourceRecord",
          Next: "ReplicateToRegions"
        },
        ReplicateToRegions: {
          Type: "Parallel",
          Branches: [
            {
              StartAt: "ReplicateUSW",
              States: {
                ReplicateUSW: {
                  Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
                  Parameters: { FunctionName: "arn:aws:lambda:us-west-2:123456789012:function:ReplicateFn", "Payload.$": "$" }, End: true
                }
              }
            },
            {
              StartAt: "ReplicateEU",
              States: {
                ReplicateEU: {
                  Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
                  Parameters: { FunctionName: "arn:aws:lambda:eu-west-1:123456789012:function:ReplicateFn", "Payload.$": "$" }, End: true
                }
              }
            }
          ],
          ResultPath: "$.replicationResults",
          Next: "RecordReplication"
        },
        RecordReplication: {
          Type: "Task", Resource: "arn:aws:states:::dynamodb:putItem",
          Parameters: {
            TableName: "ReplicationLog",
            Item: {
              id: { "S.$": "$.dataId" },
              timestamp: { "S.$": "$$.Execution.StartTime" },
              status: { S: "replicated" }
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
        ReadSourceData: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['documentdb']['connectionId']" } },
            method: "get",
            path: "/dbs/@{encodeURIComponent('GlobalData')}/colls/@{encodeURIComponent('data')}/docs/@{encodeURIComponent(triggerBody()?['dataId'])}"
          },
          runAfter: {}
        },
        ReplicateUSW: {
          type: "Function",
          inputs: { function: { id: "/sub/rg-usw/app/functions/ReplicateFn" }, body: "@body('ReadSourceData')" },
          runAfter: { ReadSourceData: ["Succeeded"] }
        },
        ReplicateEU: {
          type: "Function",
          inputs: { function: { id: "/sub/rg-eu/app/functions/ReplicateFn" }, body: "@body('ReadSourceData')" },
          runAfter: { ReadSourceData: ["Succeeded"] }
        },
        RecordReplication: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['documentdb']['connectionId']" } },
            method: "post",
            path: "/dbs/@{encodeURIComponent('ReplicationLog')}/colls/@{encodeURIComponent('log')}/docs",
            body: { id: "@triggerBody()?['dataId']", timestamp: "@utcNow()", status: "replicated" }
          },
          runAfter: { ReplicateUSW: ["Succeeded"], ReplicateEU: ["Succeeded"] }
        }
      }
    })
  ));

  // ── 8. Fraud detection pipeline (Azure→AWS) ───────────────────────────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        Init_riskScore: {
          type: "InitializeVariable",
          inputs: { variables: [{ name: "riskScore", type: "Integer", value: 0 }] },
          runAfter: {}
        },
        RunFraudChecks: {
          type: "Scope",
          actions: {
            VelocityCheck: {
              type: "Function",
              inputs: { function: { id: "/sub/rg/app/functions/VelocityFn" }, body: "@triggerBody()" },
              runAfter: {}
            },
            GeoRiskCheck: {
              type: "Function",
              inputs: { function: { id: "/sub/rg/app/functions/GeoRiskFn" }, body: "@triggerBody()" },
              runAfter: {}
            },
            DeviceFingerprintCheck: {
              type: "Function",
              inputs: { function: { id: "/sub/rg/app/functions/DeviceFn" }, body: "@triggerBody()" },
              runAfter: {}
            }
          },
          runAfter: { Init_riskScore: ["Succeeded"] }
        },
        AggregateRisk: {
          type: "Function",
          inputs: {
            function: { id: "/sub/rg/app/functions/AggRiskFn" },
            body: {
              velocity: "@body('VelocityCheck')",
              geo: "@body('GeoRiskCheck')",
              device: "@body('DeviceFingerprintCheck')"
            }
          },
          runAfter: { RunFraudChecks: ["Succeeded"] }
        },
        RouteByRisk: {
          type: "Switch",
          expression: "@body('AggregateRisk')?['riskLevel']",
          cases: {
            low:    { case: "low",    actions: { ApproveTransaction:    { type: "Function", inputs: { function: { id: "/sub/rg/app/functions/ApproveFn"    }, body: "@triggerBody()" }, runAfter: {} } } },
            medium: { case: "medium", actions: { ReviewTransaction:     { type: "Function", inputs: { function: { id: "/sub/rg/app/functions/ReviewFn"     }, body: "@triggerBody()" }, runAfter: {} } } },
            high:   { case: "high",   actions: { BlockTransaction:      { type: "Function", inputs: { function: { id: "/sub/rg/app/functions/BlockFn"      }, body: "@triggerBody()" }, runAfter: {} } } }
          },
          default: {
            actions: { HoldForManualReview: { type: "Function", inputs: { function: { id: "/sub/rg/app/functions/HoldFn" }, body: "@triggerBody()" }, runAfter: {} } }
          },
          runAfter: { AggregateRisk: ["Succeeded"] }
        }
      }
    }),
    j({
      StartAt: "RunFraudChecks",
      States: {
        RunFraudChecks: {
          Type: "Parallel",
          Branches: [
            { StartAt: "VelocityCheck",          States: { VelocityCheck:          { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "VelocityFn",  "Payload.$": "$" }, End: true } } },
            { StartAt: "GeoRiskCheck",            States: { GeoRiskCheck:            { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "GeoRiskFn",   "Payload.$": "$" }, End: true } } },
            { StartAt: "DeviceFingerprintCheck",  States: { DeviceFingerprintCheck:  { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "DeviceFn",    "Payload.$": "$" }, End: true } } }
          ],
          ResultPath: "$.fraudChecks",
          Next: "AggregateRisk"
        },
        AggregateRisk: {
          Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "AggRiskFn", "Payload.$": "$" },
          ResultPath: "$.riskAssessment",
          Next: "RouteByRisk"
        },
        RouteByRisk: {
          Type: "Choice",
          Choices: [
            { Variable: "$.riskAssessment.Payload.riskLevel", StringEquals: "low",    Next: "ApproveTransaction" },
            { Variable: "$.riskAssessment.Payload.riskLevel", StringEquals: "medium", Next: "ReviewTransaction" },
            { Variable: "$.riskAssessment.Payload.riskLevel", StringEquals: "high",   Next: "BlockTransaction" }
          ],
          Default: "HoldForManualReview"
        },
        ApproveTransaction:    { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "ApproveFn",  "Payload.$": "$" }, End: true },
        ReviewTransaction:     { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "ReviewFn",   "Payload.$": "$" }, End: true },
        BlockTransaction:      { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "BlockFn",    "Payload.$": "$" }, End: true },
        HoldForManualReview:   { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "HoldFn",     "Payload.$": "$" }, End: true }
      }
    })
  ));

  // ── 9. Data enrichment with error isolation (AWS→Azure) ───────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "EnrichUserData",
      States: {
        EnrichUserData: {
          Type: "Parallel",
          Branches: [
            {
              StartAt: "GetCRMData",
              States: {
                GetCRMData: {
                  Type: "Task", Resource: "arn:aws:states:::http:invoke",
                  Parameters: { ApiEndpoint: "https://crm.example.com/users", Method: "GET", QueryParameters: { "userId.$": "$.userId" } },
                  Catch: [{ ErrorEquals: ["States.ALL"], Next: "CRMFallback" }],
                  End: true
                },
                CRMFallback: { Type: "Pass", Result: { source: "fallback", data: null }, End: true }
              }
            },
            {
              StartAt: "GetAnalyticsData",
              States: {
                GetAnalyticsData: {
                  Type: "Task", Resource: "arn:aws:states:::http:invoke",
                  Parameters: { ApiEndpoint: "https://analytics.example.com/profile", Method: "GET", QueryParameters: { "userId.$": "$.userId" } },
                  Catch: [{ ErrorEquals: ["States.ALL"], Next: "AnalyticsFallback" }],
                  End: true
                },
                AnalyticsFallback: { Type: "Pass", Result: { source: "fallback", data: null }, End: true }
              }
            }
          ],
          ResultPath: "$.enrichments",
          Next: "MergeEnrichments"
        },
        MergeEnrichments: {
          Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "MergeEnrichFn", "Payload.$": "$" }, End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        GetCRMData: {
          type: "Http",
          inputs: { method: "GET", uri: "https://crm.example.com/users", queries: { userId: "@triggerBody()?['userId']" } },
          runAfter: {}
        },
        CRMFallback: {
          type: "Compose",
          inputs: { source: "fallback", data: null },
          runAfter: { GetCRMData: ["Failed", "TimedOut"] }
        },
        GetAnalyticsData: {
          type: "Http",
          inputs: { method: "GET", uri: "https://analytics.example.com/profile", queries: { userId: "@triggerBody()?['userId']" } },
          runAfter: {}
        },
        AnalyticsFallback: {
          type: "Compose",
          inputs: { source: "fallback", data: null },
          runAfter: { GetAnalyticsData: ["Failed", "TimedOut"] }
        },
        MergeEnrichments: {
          type: "Function",
          inputs: {
            function: { id: "/sub/rg/app/functions/MergeEnrichFn" },
            body: {
              original: "@triggerBody()",
              crm: "@if(equals(actionOutputs('GetCRMData')?['statusCode'], 200), body('GetCRMData'), outputs('CRMFallback'))",
              analytics: "@if(equals(actionOutputs('GetAnalyticsData')?['statusCode'], 200), body('GetAnalyticsData'), outputs('AnalyticsFallback'))"
            }
          },
          runAfter: {
            GetCRMData:       ["Succeeded", "Failed", "TimedOut"],
            GetAnalyticsData: ["Succeeded", "Failed", "TimedOut"]
          }
        }
      }
    })
  ));

  // ── 10. Compensation / saga pattern (AWS→Azure) ───────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "Step1_DebitAccount",
      States: {
        Step1_DebitAccount: {
          Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "DebitAccountFn", "Payload.$": "$" },
          Catch: [{ ErrorEquals: ["States.ALL"], Next: "Compensate_None" }],
          Next: "Step2_UpdateInventory"
        },
        Step2_UpdateInventory: {
          Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "UpdateInventoryFn", "Payload.$": "$" },
          Catch: [{ ErrorEquals: ["States.ALL"], Next: "Compensate_Step1" }],
          Next: "Step3_ShipOrder"
        },
        Step3_ShipOrder: {
          Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ShipOrderFn", "Payload.$": "$" },
          Catch: [{ ErrorEquals: ["States.ALL"], Next: "Compensate_Step1_Step2" }],
          End: true
        },
        Compensate_None: { Type: "Fail", Error: "SagaFailed", Cause: "Step 1 failed with no compensation needed" },
        Compensate_Step1: {
          Type: "Task", Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "RefundAccountFn", "Payload.$": "$" },
          Next: "SagaFailed"
        },
        Compensate_Step1_Step2: {
          Type: "Parallel",
          Branches: [
            { StartAt: "RefundAccount",    States: { RefundAccount:    { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "RefundAccountFn",    "Payload.$": "$" }, End: true } } },
            { StartAt: "RestoreInventory", States: { RestoreInventory: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "RestoreInventoryFn", "Payload.$": "$" }, End: true } } }
          ],
          Next: "SagaFailed"
        },
        SagaFailed: { Type: "Fail", Error: "SagaFailed", Cause: "Transaction saga failed and compensated" }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        Step1_DebitAccount: {
          type: "Function",
          inputs: { function: { id: "/sub/rg/app/functions/DebitAccountFn" }, body: "@triggerBody()" },
          runAfter: {}
        },
        Step2_UpdateInventory: {
          type: "Function",
          inputs: { function: { id: "/sub/rg/app/functions/UpdateInventoryFn" }, body: "@triggerBody()" },
          runAfter: { Step1_DebitAccount: ["Succeeded"] }
        },
        Step3_ShipOrder: {
          type: "Function",
          inputs: { function: { id: "/sub/rg/app/functions/ShipOrderFn" }, body: "@triggerBody()" },
          runAfter: { Step2_UpdateInventory: ["Succeeded"] }
        },
        Compensate_Step1: {
          type: "Function",
          inputs: { function: { id: "/sub/rg/app/functions/RefundAccountFn" }, body: "@triggerBody()" },
          runAfter: { Step2_UpdateInventory: ["Failed", "TimedOut"] }
        },
        RefundAccount: {
          type: "Function",
          inputs: { function: { id: "/sub/rg/app/functions/RefundAccountFn" }, body: "@triggerBody()" },
          runAfter: { Step3_ShipOrder: ["Failed", "TimedOut"] }
        },
        RestoreInventory: {
          type: "Function",
          inputs: { function: { id: "/sub/rg/app/functions/RestoreInventoryFn" }, body: "@triggerBody()" },
          runAfter: { Step3_ShipOrder: ["Failed", "TimedOut"] }
        },
        FailSaga: {
          type: "Terminate",
          inputs: { runStatus: "Failed", runError: { code: "SagaFailed", message: "Transaction saga failed and compensated" } },
          runAfter: {
            Step1_DebitAccount: ["Failed"],
            Compensate_Step1: ["Succeeded", "Failed"],
            RefundAccount: ["Succeeded", "Failed"],
            RestoreInventory: ["Succeeded", "Failed"]
          }
        }
      }
    })
  ));

  return pairs;
}
