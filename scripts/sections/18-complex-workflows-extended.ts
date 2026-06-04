/**
 * Section 18 – Extended complex workflows:
 *   Real-world multi-state workflows with combinations of Task, Choice,
 *   Parallel, Map, Wait, Pass, Fail, and error handling
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

export function complexWorkflowExtendedPairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // ── E-commerce checkout flow ──────────────────────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "ValidateCart",
      States: {
        ValidateCart: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ValidateCartFn", "Payload.$": "$" },
          Catch: [{ ErrorEquals: ["CartValidationError"], Next: "CartInvalid", ResultPath: "$.error" }],
          Next: "CheckInventory"
        },
        CheckInventory: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "CheckInventoryFn", "Payload.$": "$" },
          Next: "InventoryAvailable"
        },
        InventoryAvailable: {
          Type: "Choice",
          Choices: [{ Variable: "$.inventory.available", BooleanEquals: true, Next: "ReserveItems" }],
          Default: "OutOfStock"
        },
        ReserveItems: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ReserveItemsFn", "Payload.$": "$" },
          Next: "ProcessPayment"
        },
        ProcessPayment: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ProcessPaymentFn", "Payload.$": "$" },
          Catch: [{ ErrorEquals: ["PaymentDeclined"], Next: "ReleaseReservation", ResultPath: "$.paymentError" }],
          Next: "ConfirmOrder"
        },
        ConfirmOrder: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ConfirmOrderFn", "Payload.$": "$" },
          Next: "SendConfirmation"
        },
        SendConfirmation: {
          Type: "Task",
          Resource: "arn:aws:states:::sns:publish",
          Parameters: {
            TopicArn: "arn:aws:sns:us-east-1:123456789012:OrderConfirmations",
            "Message.$": "$.orderId"
          },
          End: true
        },
        OutOfStock: { Type: "Fail", Error: "OutOfStockError", Cause: "Requested items are not available" },
        CartInvalid: { Type: "Fail", Error: "CartValidationError", Cause: "Cart validation failed" },
        ReleaseReservation: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ReleaseReservationFn", "Payload.$": "$" },
          Next: "PaymentFailed"
        },
        PaymentFailed: { Type: "Fail", Error: "PaymentDeclined", Cause: "Payment was declined" }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        ValidateCart: {
          type: "Function",
          inputs: { function: { id: "/sub/rg/app/functions/ValidateCartFn" }, body: "@triggerBody()" },
          runAfter: {}
        },
        CheckInventory: {
          type: "Function",
          inputs: { function: { id: "/sub/rg/app/functions/CheckInventoryFn" }, body: "@body('ValidateCart')" },
          runAfter: { ValidateCart: ["Succeeded"] }
        },
        InventoryAvailable: {
          type: "If",
          expression: { and: [{ equals: ["@body('CheckInventory')?['inventory']?['available']", true] }] },
          actions: {
            ReserveItems: {
              type: "Function",
              inputs: { function: { id: "/sub/rg/app/functions/ReserveItemsFn" }, body: "@body('CheckInventory')" },
              runAfter: {}
            },
            ProcessPayment: {
              type: "Function",
              inputs: { function: { id: "/sub/rg/app/functions/ProcessPaymentFn" }, body: "@body('ReserveItems')" },
              runAfter: { ReserveItems: ["Succeeded"] }
            },
            ConfirmOrder: {
              type: "Function",
              inputs: { function: { id: "/sub/rg/app/functions/ConfirmOrderFn" }, body: "@body('ProcessPayment')" },
              runAfter: { ProcessPayment: ["Succeeded"] }
            },
            SendConfirmation: {
              type: "ApiConnection",
              inputs: {
                host: { connection: { name: "@parameters('$connections')['servicebus']['connectionId']" } },
                method: "post",
                path: "/@{encodeURIComponent('OrderConfirmations')}/messages",
                body: { ContentData: "@{base64(string(body('ConfirmOrder')?['orderId']))}", ContentType: "application/json" }
              },
              runAfter: { ConfirmOrder: ["Succeeded"] }
            },
            ReleaseReservation: {
              type: "Function",
              inputs: { function: { id: "/sub/rg/app/functions/ReleaseReservationFn" }, body: "@body('ReserveItems')" },
              runAfter: { ProcessPayment: ["Failed"] }
            },
            PaymentFailed: {
              type: "Terminate",
              inputs: { runStatus: "Failed", runError: { code: "PaymentDeclined", message: "Payment was declined" } },
              runAfter: { ReleaseReservation: ["Succeeded"] }
            }
          },
          else: {
            actions: {
              OutOfStock: {
                type: "Terminate",
                inputs: { runStatus: "Failed", runError: { code: "OutOfStockError", message: "Requested items are not available" } },
                runAfter: {}
              }
            }
          },
          runAfter: { CheckInventory: ["Succeeded"] }
        },
        CartInvalid: {
          type: "Terminate",
          inputs: { runStatus: "Failed", runError: { code: "CartValidationError", message: "Cart validation failed" } },
          runAfter: { ValidateCart: ["Failed"] }
        }
      }
    })
  ));

  // ── Data ingestion pipeline (Azure → AWS) ────────────────────────────────
  pairs.push(pair("azure-to-aws",
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
            path: "/v2/datasets/@{encodeURIComponent(encodeURIComponent('raw-data'))}/files/@{encodeURIComponent(encodeURIComponent(triggerBody()?['fileName']))}/content"
          },
          runAfter: {}
        },
        ParseInputData: {
          type: "ParseJson",
          inputs: { content: "@body('ReadSourceFile')", schema: { type: "array", items: { type: "object" } } },
          runAfter: { ReadSourceFile: ["Succeeded"] }
        },
        TransformRecords: {
          type: "Foreach",
          foreach: "@body('ParseInputData')",
          actions: {
            TransformRecord: {
              type: "Function",
              inputs: { function: { id: "/sub/rg/app/functions/TransformRecordFn" }, body: "@items('TransformRecords')" },
              runAfter: {}
            }
          },
          runAfter: { ParseInputData: ["Succeeded"] }
        },
        WriteOutputFile: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['azureblob']['connectionId']" } },
            method: "put",
            path: "/v2/datasets/@{encodeURIComponent(encodeURIComponent('processed-data'))}/files/@{encodeURIComponent(encodeURIComponent(triggerBody()?['outputFileName']))}",
            body: "@body('TransformRecords')"
          },
          runAfter: { TransformRecords: ["Succeeded"] }
        },
        NotifyComplete: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['servicebus']['connectionId']" } },
            method: "post",
            path: "/@{encodeURIComponent('ingestion-complete')}/messages",
            body: { ContentData: "@{base64(string(body('WriteOutputFile')))}", ContentType: "application/json" }
          },
          runAfter: { WriteOutputFile: ["Succeeded"] }
        }
      }
    }),
    j({
      StartAt: "ReadSourceFile",
      States: {
        ReadSourceFile: {
          Type: "Task",
          Resource: "arn:aws:states:::s3:getObject",
          Parameters: { Bucket: "raw-data", "Key.$": "$.fileName" },
          ResultPath: "$.fileContent",
          Next: "TransformRecords"
        },
        TransformRecords: {
          Type: "Map",
          ItemsPath: "$.fileContent",
          ItemProcessor: {
            ProcessorConfig: { Mode: "INLINE" },
            StartAt: "TransformRecord",
            States: {
              TransformRecord: {
                Type: "Task",
                Resource: "arn:aws:states:::lambda:invoke",
                Parameters: { FunctionName: "TransformRecordFn", "Payload.$": "$" },
                End: true
              }
            }
          },
          ResultPath: "$.transformedRecords",
          Next: "WriteOutputFile"
        },
        WriteOutputFile: {
          Type: "Task",
          Resource: "arn:aws:states:::s3:putObject",
          Parameters: { Bucket: "processed-data", "Key.$": "$.outputFileName", "Body.$": "$.transformedRecords" },
          Next: "NotifyComplete"
        },
        NotifyComplete: {
          Type: "Task",
          Resource: "arn:aws:states:::sqs:sendMessage",
          Parameters: {
            QueueUrl: "https://sqs.us-east-1.amazonaws.com/123456789012/ingestion-complete",
            "MessageBody.$": "$"
          },
          End: true
        }
      }
    })
  ));

  // ── User registration with email verification ─────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "CreateUserRecord",
      States: {
        CreateUserRecord: {
          Type: "Task",
          Resource: "arn:aws:states:::dynamodb:putItem",
          Parameters: {
            TableName: "Users",
            Item: {
              userId: { "S.$": "$.userId" },
              email: { "S.$": "$.email" },
              status: { S: "PENDING_VERIFICATION" },
              createdAt: { "S.$": "$$.Execution.StartTime" }
            }
          },
          Next: "SendVerificationEmail"
        },
        SendVerificationEmail: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "SendVerificationEmailFn", "Payload.$": "$" },
          Next: "WaitForVerification"
        },
        WaitForVerification: {
          Type: "Wait",
          Seconds: 86400,
          Next: "CheckVerificationStatus"
        },
        CheckVerificationStatus: {
          Type: "Task",
          Resource: "arn:aws:states:::dynamodb:getItem",
          Parameters: {
            TableName: "Users",
            Key: { userId: { "S.$": "$.userId" } }
          },
          Next: "IsVerified"
        },
        IsVerified: {
          Type: "Choice",
          Choices: [{ Variable: "$.Item.status.S", StringEquals: "VERIFIED", Next: "ActivateAccount" }],
          Default: "DeactivateAccount"
        },
        ActivateAccount: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ActivateAccountFn", "Payload.$": "$" },
          End: true
        },
        DeactivateAccount: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "DeactivateAccountFn", "Payload.$": "$" },
          Next: "RegistrationExpired"
        },
        RegistrationExpired: {
          Type: "Fail",
          Error: "VerificationExpired",
          Cause: "User did not verify email within 24 hours"
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        CreateUserRecord: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['documentdb']['connectionId']" } },
            method: "post",
            path: "/dbs/@{encodeURIComponent('Users')}/colls/@{encodeURIComponent('users')}/docs",
            body: {
              id: "@triggerBody()?['userId']",
              userId: "@triggerBody()?['userId']",
              email: "@triggerBody()?['email']",
              status: "PENDING_VERIFICATION",
              createdAt: "@utcNow()"
            }
          },
          runAfter: {}
        },
        SendVerificationEmail: {
          type: "Function",
          inputs: { function: { id: "/sub/rg/app/functions/SendVerificationEmailFn" }, body: "@triggerBody()" },
          runAfter: { CreateUserRecord: ["Succeeded"] }
        },
        WaitForVerification: {
          type: "Wait",
          inputs: { interval: { unit: "Day", count: 1 } },
          runAfter: { SendVerificationEmail: ["Succeeded"] }
        },
        CheckVerificationStatus: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['documentdb']['connectionId']" } },
            method: "get",
            path: "/dbs/@{encodeURIComponent('Users')}/colls/@{encodeURIComponent('users')}/docs/@{encodeURIComponent(triggerBody()?['userId'])}"
          },
          runAfter: { WaitForVerification: ["Succeeded"] }
        },
        IsVerified: {
          type: "If",
          expression: { and: [{ equals: ["@body('CheckVerificationStatus')?['status']", "VERIFIED"] }] },
          actions: {
            ActivateAccount: {
              type: "Function",
              inputs: { function: { id: "/sub/rg/app/functions/ActivateAccountFn" }, body: "@body('CheckVerificationStatus')" },
              runAfter: {}
            }
          },
          else: {
            actions: {
              DeactivateAccount: {
                type: "Function",
                inputs: { function: { id: "/sub/rg/app/functions/DeactivateAccountFn" }, body: "@body('CheckVerificationStatus')" },
                runAfter: {}
              },
              RegistrationExpired: {
                type: "Terminate",
                inputs: { runStatus: "Failed", runError: { code: "VerificationExpired", message: "User did not verify email within 24 hours" } },
                runAfter: { DeactivateAccount: ["Succeeded"] }
              }
            }
          },
          runAfter: { CheckVerificationStatus: ["Succeeded"] }
        }
      }
    })
  ));

  // ── Batch processing with progress tracking ───────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "InitBatch",
      States: {
        InitBatch: {
          Type: "Pass",
          Parameters: { batchId: "auto-generated", status: "STARTED", processedCount: 0, "items.$": "$.items" },
          Next: "ProcessBatch"
        },
        ProcessBatch: {
          Type: "Map",
          ItemsPath: "$.items",
          MaxConcurrency: 10,
          ItemProcessor: {
            ProcessorConfig: { Mode: "INLINE" },
            StartAt: "ProcessSingleItem",
            States: {
              ProcessSingleItem: {
                Type: "Task",
                Resource: "arn:aws:states:::lambda:invoke",
                Parameters: { FunctionName: "ProcessSingleItemFn", "Payload.$": "$" },
                Retry: [{ ErrorEquals: ["States.ALL"], IntervalSeconds: 2, MaxAttempts: 3, BackoffRate: 2 }],
                End: true
              }
            }
          },
          ResultPath: "$.processedItems",
          Next: "StoreBatchResult"
        },
        StoreBatchResult: {
          Type: "Task",
          Resource: "arn:aws:states:::s3:putObject",
          Parameters: {
            Bucket: "batch-results",
            "Key.$": "States.Format('{}.json', $.batchId)",
            "Body.$": "$.processedItems"
          },
          Next: "NotifyBatchComplete"
        },
        NotifyBatchComplete: {
          Type: "Task",
          Resource: "arn:aws:states:::sns:publish",
          Parameters: {
            TopicArn: "arn:aws:sns:us-east-1:123456789012:BatchComplete",
            "Message.$": "States.Format('Batch {} completed with {} items', $.batchId, States.JsonToString($.processedItems))"
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
        InitBatch: {
          type: "Compose",
          inputs: { batchId: "@{guid()}", status: "STARTED", processedCount: 0, items: "@triggerBody()?['items']" },
          runAfter: {}
        },
        ProcessBatch: {
          type: "Foreach",
          foreach: "@outputs('InitBatch')?['items']",
          actions: {
            ProcessSingleItem: {
              type: "Function",
              inputs: { function: { id: "/sub/rg/app/functions/ProcessSingleItemFn" }, body: "@items('ProcessBatch')" },
              retryPolicy: { type: "exponential", count: 3, interval: "PT2S", minimumInterval: "PT2S", maximumInterval: "PT1H" },
              runAfter: {}
            }
          },
          runAfter: { InitBatch: ["Succeeded"] }
        },
        StoreBatchResult: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['azureblob']['connectionId']" } },
            method: "put",
            path: `/v2/datasets/@{encodeURIComponent(encodeURIComponent('batch-results'))}/files/@{encodeURIComponent(encodeURIComponent(concat(outputs('InitBatch')?['batchId'], '.json')))}`,
            body: "@body('ProcessBatch')"
          },
          runAfter: { ProcessBatch: ["Succeeded"] }
        },
        NotifyBatchComplete: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['servicebus']['connectionId']" } },
            method: "post",
            path: "/@{encodeURIComponent('BatchComplete')}/messages",
            body: {
              ContentData: "@{base64(concat('Batch ', outputs('InitBatch')?['batchId'], ' completed'))}",
              ContentType: "application/json"
            }
          },
          runAfter: { StoreBatchResult: ["Succeeded"] }
        }
      }
    })
  ));

  // ── Multi-step approval workflow ──────────────────────────────────────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        ValidateRequest: {
          type: "Function",
          inputs: { function: { id: "/sub/rg/app/functions/ValidateRequestFn" }, body: "@triggerBody()" },
          runAfter: {}
        },
        RouteByAmount: {
          type: "Switch",
          expression: "@triggerBody()?['approvalTier']",
          cases: {
            manager: {
              case: "manager",
              actions: {
                ManagerApproval: {
                  type: "Function",
                  inputs: { function: { id: "/sub/rg/app/functions/ManagerApprovalFn" }, body: "@body('ValidateRequest')" },
                  runAfter: {}
                }
              }
            },
            director: {
              case: "director",
              actions: {
                DirectorApproval: {
                  type: "Function",
                  inputs: { function: { id: "/sub/rg/app/functions/DirectorApprovalFn" }, body: "@body('ValidateRequest')" },
                  runAfter: {}
                }
              }
            },
            executive: {
              case: "executive",
              actions: {
                ExecutiveApproval: {
                  type: "Function",
                  inputs: { function: { id: "/sub/rg/app/functions/ExecutiveApprovalFn" }, body: "@body('ValidateRequest')" },
                  runAfter: {}
                }
              }
            }
          },
          default: {
            actions: {
              AutoApprove: {
                type: "Function",
                inputs: { function: { id: "/sub/rg/app/functions/AutoApproveFn" }, body: "@body('ValidateRequest')" },
                runAfter: {}
              }
            }
          },
          runAfter: { ValidateRequest: ["Succeeded"] }
        }
      }
    }),
    j({
      StartAt: "ValidateRequest",
      States: {
        ValidateRequest: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ValidateRequestFn", "Payload.$": "$" },
          Next: "RouteByAmount"
        },
        RouteByAmount: {
          Type: "Choice",
          Choices: [
            { Variable: "$.approvalTier", StringEquals: "manager", Next: "ManagerApproval" },
            { Variable: "$.approvalTier", StringEquals: "director", Next: "DirectorApproval" },
            { Variable: "$.approvalTier", StringEquals: "executive", Next: "ExecutiveApproval" }
          ],
          Default: "AutoApprove"
        },
        ManagerApproval: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ManagerApprovalFn", "Payload.$": "$" },
          End: true
        },
        DirectorApproval: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "DirectorApprovalFn", "Payload.$": "$" },
          End: true
        },
        ExecutiveApproval: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ExecutiveApprovalFn", "Payload.$": "$" },
          End: true
        },
        AutoApprove: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "AutoApproveFn", "Payload.$": "$" },
          End: true
        }
      }
    })
  ));

  // ── Microservices orchestration with parallel health checks ───────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "ParallelHealthChecks",
      States: {
        ParallelHealthChecks: {
          Type: "Parallel",
          Branches: [
            {
              StartAt: "CheckOrderService",
              States: {
                CheckOrderService: {
                  Type: "Task",
                  Resource: "arn:aws:states:::http:invoke",
                  Parameters: { ApiEndpoint: "https://orders.internal.com/health", Method: "GET" },
                  End: true
                }
              }
            },
            {
              StartAt: "CheckPaymentService",
              States: {
                CheckPaymentService: {
                  Type: "Task",
                  Resource: "arn:aws:states:::http:invoke",
                  Parameters: { ApiEndpoint: "https://payments.internal.com/health", Method: "GET" },
                  End: true
                }
              }
            },
            {
              StartAt: "CheckInventoryService",
              States: {
                CheckInventoryService: {
                  Type: "Task",
                  Resource: "arn:aws:states:::http:invoke",
                  Parameters: { ApiEndpoint: "https://inventory.internal.com/health", Method: "GET" },
                  End: true
                }
              }
            }
          ],
          ResultPath: "$.healthChecks",
          Next: "EvaluateHealth"
        },
        EvaluateHealth: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "EvaluateHealthFn", "Payload.$": "$" },
          Next: "AllHealthy"
        },
        AllHealthy: {
          Type: "Choice",
          Choices: [{ Variable: "$.allHealthy", BooleanEquals: true, Next: "ProceedWithOperation" }],
          Default: "ServicesDegraded"
        },
        ProceedWithOperation: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ProceedWithOperationFn", "Payload.$": "$" },
          End: true
        },
        ServicesDegraded: {
          Type: "Fail",
          Error: "ServicesUnavailable",
          Cause: "One or more dependent services are unhealthy"
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        CheckOrderService: {
          type: "Http",
          inputs: { method: "get", uri: "https://orders.internal.com/health" },
          runAfter: {}
        },
        CheckPaymentService: {
          type: "Http",
          inputs: { method: "get", uri: "https://payments.internal.com/health" },
          runAfter: {}
        },
        CheckInventoryService: {
          type: "Http",
          inputs: { method: "get", uri: "https://inventory.internal.com/health" },
          runAfter: {}
        },
        EvaluateHealth: {
          type: "Function",
          inputs: {
            function: { id: "/sub/rg/app/functions/EvaluateHealthFn" },
            body: {
              orderHealth: "@body('CheckOrderService')",
              paymentHealth: "@body('CheckPaymentService')",
              inventoryHealth: "@body('CheckInventoryService')"
            }
          },
          runAfter: {
            CheckOrderService: ["Succeeded"],
            CheckPaymentService: ["Succeeded"],
            CheckInventoryService: ["Succeeded"]
          }
        },
        AllHealthy: {
          type: "If",
          expression: { and: [{ equals: ["@body('EvaluateHealth')?['allHealthy']", true] }] },
          actions: {
            ProceedWithOperation: {
              type: "Function",
              inputs: { function: { id: "/sub/rg/app/functions/ProceedWithOperationFn" }, body: "@body('EvaluateHealth')" },
              runAfter: {}
            }
          },
          else: {
            actions: {
              ServicesDegraded: {
                type: "Terminate",
                inputs: { runStatus: "Failed", runError: { code: "ServicesUnavailable", message: "One or more dependent services are unhealthy" } },
                runAfter: {}
              }
            }
          },
          runAfter: { EvaluateHealth: ["Succeeded"] }
        }
      }
    })
  ));

  // ── Document processing pipeline ─────────────────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "ReadDocument",
      States: {
        ReadDocument: {
          Type: "Task",
          Resource: "arn:aws:states:::s3:getObject",
          Parameters: { Bucket: "documents-input", "Key.$": "$.documentKey" },
          ResultPath: "$.document",
          Next: "ClassifyDocument"
        },
        ClassifyDocument: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ClassifyDocumentFn", "Payload.$": "$" },
          Next: "RouteByDocType"
        },
        RouteByDocType: {
          Type: "Choice",
          Choices: [
            { Variable: "$.docType", StringEquals: "invoice", Next: "ProcessInvoice" },
            { Variable: "$.docType", StringEquals: "contract", Next: "ProcessContract" },
            { Variable: "$.docType", StringEquals: "report", Next: "ProcessReport" }
          ],
          Default: "ProcessGeneric"
        },
        ProcessInvoice: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ProcessInvoiceFn", "Payload.$": "$" },
          Next: "StoreProcessedDoc"
        },
        ProcessContract: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ProcessContractFn", "Payload.$": "$" },
          Next: "StoreProcessedDoc"
        },
        ProcessReport: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ProcessReportFn", "Payload.$": "$" },
          Next: "StoreProcessedDoc"
        },
        ProcessGeneric: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ProcessGenericFn", "Payload.$": "$" },
          Next: "StoreProcessedDoc"
        },
        StoreProcessedDoc: {
          Type: "Task",
          Resource: "arn:aws:states:::s3:putObject",
          Parameters: { Bucket: "documents-processed", "Key.$": "$.documentKey", "Body.$": "$.processedContent" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        ReadDocument: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['azureblob']['connectionId']" } },
            method: "get",
            path: "/v2/datasets/@{encodeURIComponent(encodeURIComponent('documents-input'))}/files/@{encodeURIComponent(encodeURIComponent(triggerBody()?['documentKey']))}/content"
          },
          runAfter: {}
        },
        ClassifyDocument: {
          type: "Function",
          inputs: { function: { id: "/sub/rg/app/functions/ClassifyDocumentFn" }, body: "@body('ReadDocument')" },
          runAfter: { ReadDocument: ["Succeeded"] }
        },
        RouteByDocType: {
          type: "Switch",
          expression: "@body('ClassifyDocument')?['docType']",
          cases: {
            invoice: { case: "invoice", actions: { ProcessInvoice: { type: "Function", inputs: { function: { id: "/sub/rg/app/functions/ProcessInvoiceFn" }, body: "@body('ClassifyDocument')" }, runAfter: {} } } },
            contract: { case: "contract", actions: { ProcessContract: { type: "Function", inputs: { function: { id: "/sub/rg/app/functions/ProcessContractFn" }, body: "@body('ClassifyDocument')" }, runAfter: {} } } },
            report: { case: "report", actions: { ProcessReport: { type: "Function", inputs: { function: { id: "/sub/rg/app/functions/ProcessReportFn" }, body: "@body('ClassifyDocument')" }, runAfter: {} } } }
          },
          default: { actions: { ProcessGeneric: { type: "Function", inputs: { function: { id: "/sub/rg/app/functions/ProcessGenericFn" }, body: "@body('ClassifyDocument')" }, runAfter: {} } } },
          runAfter: { ClassifyDocument: ["Succeeded"] }
        },
        StoreProcessedDoc: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['azureblob']['connectionId']" } },
            method: "put",
            path: "/v2/datasets/@{encodeURIComponent(encodeURIComponent('documents-processed'))}/files/@{encodeURIComponent(encodeURIComponent(triggerBody()?['documentKey']))}",
            body: "@triggerBody()?['processedContent']"
          },
          runAfter: { RouteByDocType: ["Succeeded"] }
        }
      }
    })
  ));

  return pairs;
}
