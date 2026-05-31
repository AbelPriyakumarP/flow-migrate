/**
 * Section 07 – Azure Logic Apps → AWS Step Functions (reverse direction)
 * Covers all major Azure action types mapped back to correct ASL constructs.
 *
 * Sources:
 *  Azure WDL:  https://learn.microsoft.com/en-us/azure/logic-apps/logic-apps-workflow-actions-triggers
 *  ASL:        https://docs.aws.amazon.com/step-functions/latest/dg/concepts-amazon-states-language.html
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

export function azureToAwsPairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // ── 1. Http GET → Task http:invoke ───────────────────────────────────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        FetchProducts: {
          type: "Http",
          inputs: {
            method: "GET",
            uri: "https://api.example.com/products",
            headers: { Authorization: "Bearer @{parameters('apiToken')}" },
            queries: { category: "@triggerBody()?['category']" }
          },
          runAfter: {}
        }
      }
    }),
    j({
      StartAt: "FetchProducts",
      States: {
        FetchProducts: {
          Type: "Task",
          Resource: "arn:aws:states:::http:invoke",
          Parameters: {
            ApiEndpoint: "https://api.example.com/products",
            Method: "GET",
            Headers: { Authorization: "Bearer #{apiToken}" },
            QueryParameters: { "category.$": "$.category" }
          },
          End: true
        }
      }
    })
  ));

  // ── 2. Http POST → Task http:invoke ──────────────────────────────────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        SubmitPayment: {
          type: "Http",
          inputs: {
            method: "POST",
            uri: "https://payments.example.com/charge",
            headers: { "Content-Type": "application/json" },
            body: {
              amount: "@triggerBody()?['amount']",
              currency: "@triggerBody()?['currency']",
              customerId: "@triggerBody()?['customerId']"
            }
          },
          runAfter: {}
        },
        HandleResult: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/HandleResultFn" }, body: "@body('SubmitPayment')" },
          runAfter: { SubmitPayment: ["Succeeded"] }
        }
      }
    }),
    j({
      StartAt: "SubmitPayment",
      States: {
        SubmitPayment: {
          Type: "Task",
          Resource: "arn:aws:states:::http:invoke",
          Parameters: {
            ApiEndpoint: "https://payments.example.com/charge",
            Method: "POST",
            Headers: { "Content-Type": "application/json" },
            RequestBody: {
              "amount.$": "$.amount",
              "currency.$": "$.currency",
              "customerId.$": "$.customerId"
            }
          },
          Next: "HandleResult"
        },
        HandleResult: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "HandleResultFn", "Payload.$": "$" },
          End: true
        }
      }
    })
  ));

  // ── 3. Http with retry → Task http:invoke with Retry ─────────────────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        CallThirdParty: {
          type: "Http",
          inputs: { method: "GET", uri: "https://api.partner.com/data" },
          retryPolicy: { type: "exponential", count: 4, interval: "PT5S", minimumInterval: "PT5S", maximumInterval: "PT300S" },
          runAfter: {}
        }
      }
    }),
    j({
      StartAt: "CallThirdParty",
      States: {
        CallThirdParty: {
          Type: "Task",
          Resource: "arn:aws:states:::http:invoke",
          Parameters: { ApiEndpoint: "https://api.partner.com/data", Method: "GET" },
          Retry: [{ ErrorEquals: ["States.ALL"], IntervalSeconds: 5, MaxAttempts: 4, BackoffRate: 2, MaxDelaySeconds: 300 }],
          End: true
        }
      }
    })
  ));

  // ── 4. Function → Task lambda:invoke ────────────────────────────────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        ValidateOrder: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/myapp/functions/ValidateOrderFn" },
            body: "@triggerBody()"
          },
          runAfter: {}
        },
        FulfillOrder: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/myapp/functions/FulfillOrderFn" },
            body: "@body('ValidateOrder')"
          },
          runAfter: { ValidateOrder: ["Succeeded"] }
        }
      }
    }),
    j({
      StartAt: "ValidateOrder",
      States: {
        ValidateOrder: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ValidateOrderFn", "Payload.$": "$" },
          Next: "FulfillOrder"
        },
        FulfillOrder: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "FulfillOrderFn", "Payload.$": "$" },
          End: true
        }
      }
    })
  ));

  // ── 5. Function with retry → Task lambda:invoke with Retry ───────────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        ProcessEvent: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/myapp/functions/ProcessEventFn" },
            body: "@triggerBody()"
          },
          retryPolicy: { type: "fixed", count: 3, interval: "PT10S" },
          runAfter: {}
        }
      }
    }),
    j({
      StartAt: "ProcessEvent",
      States: {
        ProcessEvent: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ProcessEventFn", "Payload.$": "$" },
          Retry: [{ ErrorEquals: ["States.ALL"], IntervalSeconds: 10, MaxAttempts: 3, BackoffRate: 1.0 }],
          End: true
        }
      }
    })
  ));

  // ── 6. Function with error handler → Task lambda:invoke with Catch ────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        RiskyOperation: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/myapp/functions/RiskyFn" },
            body: "@triggerBody()"
          },
          runAfter: {}
        },
        ErrorRecovery: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/myapp/functions/RecoveryFn" },
            body: "@triggerBody()"
          },
          runAfter: { RiskyOperation: ["Failed", "TimedOut"] }
        }
      }
    }),
    j({
      StartAt: "RiskyOperation",
      States: {
        RiskyOperation: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "RiskyFn", "Payload.$": "$" },
          Catch: [{ ErrorEquals: ["States.ALL"], Next: "ErrorRecovery", ResultPath: "$.error" }],
          End: true
        },
        ErrorRecovery: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "RecoveryFn", "Payload.$": "$" },
          End: true
        }
      }
    })
  ));

  // ── 7. If → Choice (2 branches) ──────────────────────────────────────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        IsHighValue: {
          type: "If",
          expression: { and: [{ greater: ["@triggerBody()?['amount']", 500] }] },
          actions: {
            HighValueProcess: {
              type: "Function",
              inputs: { function: { id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/app/functions/HighValueFn" }, body: "@triggerBody()" },
              runAfter: {}
            }
          },
          else: {
            actions: {
              StandardProcess: {
                type: "Function",
                inputs: { function: { id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/app/functions/StandardFn" }, body: "@triggerBody()" },
                runAfter: {}
              }
            }
          },
          runAfter: {}
        }
      }
    }),
    j({
      StartAt: "IsHighValue",
      States: {
        IsHighValue: {
          Type: "Choice",
          Choices: [
            { Variable: "$.amount", NumericGreaterThan: 500, Next: "HighValueProcess" }
          ],
          Default: "StandardProcess"
        },
        HighValueProcess: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "HighValueFn", "Payload.$": "$" },
          End: true
        },
        StandardProcess: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "StandardFn", "Payload.$": "$" },
          End: true
        }
      }
    })
  ));

  // ── 8. If with nested actions → Choice + nested states ───────────────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        CheckAccount: {
          type: "If",
          expression: { and: [{ equals: ["@triggerBody()?['accountType']", "premium"] }] },
          actions: {
            PremiumValidate: {
              type: "Function",
              inputs: { function: { id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/app/functions/PremiumValidateFn" }, body: "@triggerBody()" },
              runAfter: {}
            },
            PremiumProcess: {
              type: "Function",
              inputs: { function: { id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/app/functions/PremiumProcessFn" }, body: "@body('PremiumValidate')" },
              runAfter: { PremiumValidate: ["Succeeded"] }
            }
          },
          else: {
            actions: {
              BasicProcess: {
                type: "Function",
                inputs: { function: { id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/app/functions/BasicProcessFn" }, body: "@triggerBody()" },
                runAfter: {}
              }
            }
          },
          runAfter: {}
        }
      }
    }),
    j({
      StartAt: "CheckAccount",
      States: {
        CheckAccount: {
          Type: "Choice",
          Choices: [{ Variable: "$.accountType", StringEquals: "premium", Next: "PremiumValidate" }],
          Default: "BasicProcess"
        },
        PremiumValidate: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "PremiumValidateFn", "Payload.$": "$" },
          Next: "PremiumProcess"
        },
        PremiumProcess: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "PremiumProcessFn", "Payload.$": "$" },
          End: true
        },
        BasicProcess: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "BasicProcessFn", "Payload.$": "$" },
          End: true
        }
      }
    })
  ));

  // ── 9. Switch → Choice (multi-branch) ────────────────────────────────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        RouteByPlan: {
          type: "Switch",
          expression: "@triggerBody()?['plan']",
          cases: {
            free:       { case: "free",       actions: { FreeTier:   { type: "Function", inputs: { function: { id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/app/functions/FreeFn"   }, body: "@triggerBody()" }, runAfter: {} } } },
            basic:      { case: "basic",      actions: { BasicTier:  { type: "Function", inputs: { function: { id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/app/functions/BasicFn"  }, body: "@triggerBody()" }, runAfter: {} } } },
            enterprise: { case: "enterprise", actions: { EnterpriseTier: { type: "Function", inputs: { function: { id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/app/functions/EntFn" }, body: "@triggerBody()" }, runAfter: {} } } }
          },
          default: {
            actions: {
              DefaultTier: { type: "Function", inputs: { function: { id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/app/functions/DefaultFn" }, body: "@triggerBody()" }, runAfter: {} }
            }
          },
          runAfter: {}
        }
      }
    }),
    j({
      StartAt: "RouteByPlan",
      States: {
        RouteByPlan: {
          Type: "Choice",
          Choices: [
            { Variable: "$.plan", StringEquals: "free",       Next: "FreeTier" },
            { Variable: "$.plan", StringEquals: "basic",      Next: "BasicTier" },
            { Variable: "$.plan", StringEquals: "enterprise", Next: "EnterpriseTier" }
          ],
          Default: "DefaultTier"
        },
        FreeTier:       { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "FreeFn",    "Payload.$": "$" }, End: true },
        BasicTier:      { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "BasicFn",   "Payload.$": "$" }, End: true },
        EnterpriseTier: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "EntFn",     "Payload.$": "$" }, End: true },
        DefaultTier:    { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "DefaultFn", "Payload.$": "$" }, End: true }
      }
    })
  ));

  // ── 10. Foreach → Map state ───────────────────────────────────────────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        ProcessInvoices: {
          type: "Foreach",
          foreach: "@triggerBody()?['invoices']",
          actions: {
            ProcessSingleInvoice: {
              type: "Function",
              inputs: {
                function: { id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/app/functions/InvoiceFn" },
                body: "@items('ProcessInvoices')"
              },
              runAfter: {}
            }
          },
          runAfter: {}
        }
      }
    }),
    j({
      StartAt: "ProcessInvoices",
      States: {
        ProcessInvoices: {
          Type: "Map",
          ItemsPath: "$.invoices",
          MaxConcurrency: 0,
          ItemProcessor: {
            ProcessorConfig: { Mode: "INLINE" },
            StartAt: "ProcessSingleInvoice",
            States: {
              ProcessSingleInvoice: {
                Type: "Task",
                Resource: "arn:aws:states:::lambda:invoke",
                Parameters: { FunctionName: "InvoiceFn", "Payload.$": "$" },
                End: true
              }
            }
          },
          End: true
        }
      }
    })
  ));

  // ── 11. Foreach Sequential → Map MaxConcurrency 1 ────────────────────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        ProcessRecordsSeq: {
          type: "Foreach",
          foreach: "@triggerBody()?['records']",
          operationOptions: "Sequential",
          actions: {
            SaveRecord: {
              type: "ApiConnection",
              inputs: {
                host: { connection: { name: "@parameters('$connections')['documentdb']['connectionId']" } },
                method: "post",
                path: "/dbs/mydb/colls/records/docs",
                body: "@items('ProcessRecordsSeq')"
              },
              runAfter: {}
            }
          },
          runAfter: {}
        }
      }
    }),
    j({
      StartAt: "ProcessRecordsSeq",
      States: {
        ProcessRecordsSeq: {
          Type: "Map",
          ItemsPath: "$.records",
          MaxConcurrency: 1,
          ItemProcessor: {
            ProcessorConfig: { Mode: "INLINE" },
            StartAt: "SaveRecord",
            States: {
              SaveRecord: {
                Type: "Task",
                Resource: "arn:aws:states:::dynamodb:putItem",
                Parameters: {
                  TableName: "records",
                  Item: { "id": { "S.$": "$.id" }, "data": { "S.$": "States.JsonToString($)" } }
                },
                End: true
              }
            }
          },
          End: true
        }
      }
    })
  ));

  // ── 12. Select (data transform) → Map with Pass ItemProcessor ─────────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        NormalizeUsers: {
          type: "Select",
          inputs: {
            from: "@triggerBody()?['users']",
            select: {
              id: "@item()?['userId']",
              name: "@item()?['fullName']",
              email: "@item()?['emailAddress']"
            }
          },
          runAfter: {}
        }
      }
    }),
    j({
      StartAt: "NormalizeUsers",
      States: {
        NormalizeUsers: {
          Type: "Map",
          ItemsPath: "$.users",
          ItemSelector: {
            "id.$":    "$$.Map.Item.Value.userId",
            "name.$":  "$$.Map.Item.Value.fullName",
            "email.$": "$$.Map.Item.Value.emailAddress"
          },
          ItemProcessor: {
            ProcessorConfig: { Mode: "INLINE" },
            StartAt: "PassThrough",
            States: {
              PassThrough: { Type: "Pass", End: true }
            }
          },
          End: true
        }
      }
    })
  ));

  // ── 13. Scope → Parallel with single branch ───────────────────────────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        NotificationScope: {
          type: "Scope",
          actions: {
            SendEmail: {
              type: "Function",
              inputs: { function: { id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/app/functions/EmailFn" }, body: "@triggerBody()" },
              runAfter: {}
            },
            SendSMS: {
              type: "Function",
              inputs: { function: { id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/app/functions/SMSFn" }, body: "@triggerBody()" },
              runAfter: {}
            },
            LogNotification: {
              type: "Function",
              inputs: { function: { id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/app/functions/LogFn" }, body: "@triggerBody()" },
              runAfter: { SendEmail: ["Succeeded"], SendSMS: ["Succeeded"] }
            }
          },
          runAfter: {}
        }
      }
    }),
    j({
      StartAt: "NotificationScope",
      States: {
        NotificationScope: {
          Type: "Parallel",
          Branches: [
            {
              StartAt: "SendEmail",
              States: {
                SendEmail: {
                  Type: "Task",
                  Resource: "arn:aws:states:::lambda:invoke",
                  Parameters: { FunctionName: "EmailFn", "Payload.$": "$" },
                  End: true
                }
              }
            },
            {
              StartAt: "SendSMS",
              States: {
                SendSMS: {
                  Type: "Task",
                  Resource: "arn:aws:states:::lambda:invoke",
                  Parameters: { FunctionName: "SMSFn", "Payload.$": "$" },
                  End: true
                }
              }
            }
          ],
          Next: "LogNotification"
        },
        LogNotification: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "LogFn", "Payload.$": "$" },
          End: true
        }
      }
    })
  ));

  // ── 14. Compose → Pass ───────────────────────────────────────────────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        BuildPayload: {
          type: "Compose",
          inputs: {
            orderId: "@triggerBody()?['orderId']",
            source: "azure-workflow",
            timestamp: "@utcNow()",
            version: "2.0"
          },
          runAfter: {}
        },
        SendToQueue: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['servicebus']['connectionId']" } },
            method: "post",
            path: "/@{encodeURIComponent('orders')}/messages",
            body: { ContentData: "@{base64(string(outputs('BuildPayload')))}" }
          },
          runAfter: { BuildPayload: ["Succeeded"] }
        }
      }
    }),
    j({
      StartAt: "BuildPayload",
      States: {
        BuildPayload: {
          Type: "Pass",
          Parameters: {
            "orderId.$": "$.orderId",
            source: "step-functions",
            "timestamp.$": "$$.Execution.StartTime",
            version: "2.0"
          },
          Next: "SendToQueue"
        },
        SendToQueue: {
          Type: "Task",
          Resource: "arn:aws:states:::sqs:sendMessage",
          Parameters: {
            QueueUrl: "https://sqs.us-east-1.amazonaws.com/123456789012/orders",
            "MessageBody.$": "States.JsonToString($)"
          },
          End: true
        }
      }
    })
  ));

  // ── 15. ParseJson → Pass with Parameters ─────────────────────────────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        ParseEventPayload: {
          type: "ParseJson",
          inputs: {
            content: "@triggerBody()?['rawEvent']",
            schema: {
              type: "object",
              properties: {
                eventType: { type: "string" },
                timestamp: { type: "string" },
                data: { type: "object" }
              }
            }
          },
          runAfter: {}
        },
        ProcessEvent: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/app/functions/ProcessEventFn" },
            body: "@body('ParseEventPayload')"
          },
          runAfter: { ParseEventPayload: ["Succeeded"] }
        }
      }
    }),
    j({
      StartAt: "ParseEventPayload",
      States: {
        ParseEventPayload: {
          Type: "Pass",
          Parameters: {
            "parsedEvent.$": "States.StringToJson($.rawEvent)"
          },
          Next: "ProcessEvent"
        },
        ProcessEvent: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: {
            FunctionName: "ProcessEventFn",
            Payload: { "parsedEvent.$": "$.parsedEvent" }
          },
          End: true
        }
      }
    })
  ));

  // ── 16. Terminate Succeeded → Succeed state ──────────────────────────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        ProcessRequest: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/app/functions/ProcessFn" }, body: "@triggerBody()" },
          runAfter: {}
        },
        CompleteSuccessfully: {
          type: "Terminate",
          inputs: { runStatus: "Succeeded" },
          runAfter: { ProcessRequest: ["Succeeded"] }
        }
      }
    }),
    j({
      StartAt: "ProcessRequest",
      States: {
        ProcessRequest: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ProcessFn", "Payload.$": "$" },
          Next: "CompleteSuccessfully"
        },
        CompleteSuccessfully: { Type: "Succeed" }
      }
    })
  ));

  // ── 17. Terminate Failed → Fail state ────────────────────────────────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        ValidateInput: {
          type: "If",
          expression: { and: [{ equals: ["@triggerBody()?['valid']", false] }] },
          actions: {
            FailWorkflow: {
              type: "Terminate",
              inputs: { runStatus: "Failed", runError: { code: "ValidationError", message: "Input validation failed" } },
              runAfter: {}
            }
          },
          else: {
            actions: {
              ContinueProcessing: {
                type: "Function",
                inputs: { function: { id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/app/functions/ContinueFn" }, body: "@triggerBody()" },
                runAfter: {}
              }
            }
          },
          runAfter: {}
        }
      }
    }),
    j({
      StartAt: "ValidateInput",
      States: {
        ValidateInput: {
          Type: "Choice",
          Choices: [{ Variable: "$.valid", BooleanEquals: false, Next: "FailWorkflow" }],
          Default: "ContinueProcessing"
        },
        FailWorkflow: {
          Type: "Fail",
          Error: "ValidationError",
          Cause: "Input validation failed"
        },
        ContinueProcessing: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ContinueFn", "Payload.$": "$" },
          End: true
        }
      }
    })
  ));

  // ── 18. Wait interval → Wait Seconds ─────────────────────────────────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        CoolDownPeriod: {
          type: "Wait",
          inputs: { interval: { unit: "Second", count: 60 } },
          runAfter: {}
        },
        RetryAfterCooldown: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/app/functions/RetryFn" }, body: "@triggerBody()" },
          runAfter: { CoolDownPeriod: ["Succeeded"] }
        }
      }
    }),
    j({
      StartAt: "CoolDownPeriod",
      States: {
        CoolDownPeriod: {
          Type: "Wait",
          Seconds: 60,
          Next: "RetryAfterCooldown"
        },
        RetryAfterCooldown: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "RetryFn", "Payload.$": "$" },
          End: true
        }
      }
    })
  ));

  // ── 19. Wait until timestamp → Wait Timestamp ────────────────────────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        WaitForScheduledTime: {
          type: "Wait",
          inputs: { until: { timestamp: "@triggerBody()?['runAt']" } },
          runAfter: {}
        },
        ExecuteScheduledJob: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/app/functions/ScheduledJobFn" }, body: "@triggerBody()" },
          runAfter: { WaitForScheduledTime: ["Succeeded"] }
        }
      }
    }),
    j({
      StartAt: "WaitForScheduledTime",
      States: {
        WaitForScheduledTime: {
          Type: "Wait",
          TimestampPath: "$.runAt",
          Next: "ExecuteScheduledJob"
        },
        ExecuteScheduledJob: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ScheduledJobFn", "Payload.$": "$" },
          End: true
        }
      }
    })
  ));

  // ── 20. ApiConnection (Blob storage) → Task s3:getObject ─────────────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        ReadBlob: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['azureblob']['connectionId']" } },
            method: "get",
            path: "/datasets/default/files/@{encodeURIComponent(encodeURIComponent(triggerBody()?['blobPath']))}/content"
          },
          runAfter: {}
        },
        ProcessBlob: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/app/functions/BlobProcessFn" },
            body: "@body('ReadBlob')"
          },
          runAfter: { ReadBlob: ["Succeeded"] }
        }
      }
    }),
    j({
      StartAt: "ReadBlob",
      States: {
        ReadBlob: {
          Type: "Task",
          Resource: "arn:aws:states:::s3:getObject",
          Parameters: {
            Bucket: "my-storage-bucket",
            "Key.$": "$.blobPath"
          },
          ResultSelector: { "fileContent.$": "$.Body" },
          ResultPath: "$.fileData",
          Next: "ProcessBlob"
        },
        ProcessBlob: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "BlobProcessFn", "Payload.$": "$" },
          End: true
        }
      }
    })
  ));

  // ── 21. ApiConnection (Cosmos DB create) → Task dynamodb:putItem ──────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        SaveDocument: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['documentdb']['connectionId']" } },
            method: "post",
            path: "/dbs/@{encodeURIComponent('Events')}/colls/@{encodeURIComponent('events')}/docs",
            body: {
              id: "@triggerBody()?['eventId']",
              type: "@triggerBody()?['type']",
              payload: "@triggerBody()?['payload']",
              createdAt: "@utcNow()"
            }
          },
          runAfter: {}
        }
      }
    }),
    j({
      StartAt: "SaveDocument",
      States: {
        SaveDocument: {
          Type: "Task",
          Resource: "arn:aws:states:::dynamodb:putItem",
          Parameters: {
            TableName: "Events",
            Item: {
              id:        { "S.$": "$.eventId" },
              type:      { "S.$": "$.type" },
              payload:   { "S.$": "States.JsonToString($.payload)" },
              createdAt: { "S.$": "$$.Execution.StartTime" }
            }
          },
          End: true
        }
      }
    })
  ));

  // ── 22. ApiConnection (Service Bus send) → Task sqs:sendMessage ───────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        EnqueueTask: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['servicebus']['connectionId']" } },
            method: "post",
            path: "/@{encodeURIComponent('work-queue')}/messages",
            body: {
              ContentData: "@{base64(string(triggerBody()))}",
              ContentType: "application/json"
            }
          },
          runAfter: {}
        }
      }
    }),
    j({
      StartAt: "EnqueueTask",
      States: {
        EnqueueTask: {
          Type: "Task",
          Resource: "arn:aws:states:::sqs:sendMessage",
          Parameters: {
            QueueUrl: "https://sqs.us-east-1.amazonaws.com/123456789012/work-queue",
            "MessageBody.$": "States.JsonToString($)"
          },
          End: true
        }
      }
    })
  ));

  // ── 23. ApiConnection (Event Grid publish) → Task events:putEvents ────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        PublishEvent: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['eventgrid']['connectionId']" } },
            method: "post",
            path: "/@{encodeURIComponent(parameters('topicEndpoint'))}/events",
            body: [{
              id: "@{guid()}",
              eventType: "@triggerBody()?['eventType']",
              subject: "@triggerBody()?['subject']",
              eventTime: "@utcNow()",
              data: "@triggerBody()?['data']",
              dataVersion: "1.0"
            }]
          },
          runAfter: {}
        }
      }
    }),
    j({
      StartAt: "PublishEvent",
      States: {
        PublishEvent: {
          Type: "Task",
          Resource: "arn:aws:states:::events:putEvents",
          Parameters: {
            Entries: [{
              EventBusName: "default",
              Source: "com.myapp",
              "DetailType.$": "$.eventType",
              Detail: {
                "subject.$": "$.subject",
                "data.$": "$.data"
              }
            }]
          },
          End: true
        }
      }
    })
  ));

  // ── 24. Until loop → Map + Choice polling pattern ─────────────────────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        PollUntilDone: {
          type: "Until",
          expression: "@equals(variables('jobStatus'), 'completed')",
          limit: { count: 20, timeout: "PT1H" },
          actions: {
            CheckJobStatus: {
              type: "Function",
              inputs: {
                function: { id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/app/functions/CheckStatusFn" },
                body: "@triggerBody()"
              },
              runAfter: {}
            },
            Update_Status: {
              type: "SetVariable",
              inputs: { name: "jobStatus", value: "@body('CheckJobStatus')?['status']" },
              runAfter: { CheckJobStatus: ["Succeeded"] }
            },
            Wait_Between_Polls: {
              type: "Wait",
              inputs: { interval: { unit: "Second", count: 30 } },
              runAfter: { Update_Status: ["Succeeded"] }
            }
          },
          runAfter: {}
        }
      }
    }),
    j({
      StartAt: "CheckJobStatus",
      States: {
        CheckJobStatus: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "CheckStatusFn", "Payload.$": "$" },
          ResultPath: "$.statusResult",
          Next: "IsJobDone"
        },
        IsJobDone: {
          Type: "Choice",
          Choices: [
            { Variable: "$.statusResult.Payload.status", StringEquals: "completed", Next: "Done" }
          ],
          Default: "WaitAndRetry"
        },
        WaitAndRetry: {
          Type: "Wait",
          Seconds: 30,
          Next: "CheckJobStatus"
        },
        Done: {
          Type: "Succeed"
        }
      }
    })
  ));

  // ── 25. runAfter multiple statuses → Catch ────────────────────────────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        MainTask: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/app/functions/MainFn" }, body: "@triggerBody()" },
          runAfter: {}
        },
        OnSuccess: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/app/functions/SuccessFn" }, body: "@body('MainTask')" },
          runAfter: { MainTask: ["Succeeded"] }
        },
        OnFailure: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Web/sites/app/functions/FailureFn" }, body: "@triggerBody()" },
          runAfter: { MainTask: ["Failed", "TimedOut", "Skipped"] }
        }
      }
    }),
    j({
      StartAt: "MainTask",
      States: {
        MainTask: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "MainFn", "Payload.$": "$" },
          Catch: [{ ErrorEquals: ["States.ALL"], Next: "OnFailure", ResultPath: "$.error" }],
          Next: "OnSuccess"
        },
        OnSuccess: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "SuccessFn", "Payload.$": "$" },
          End: true
        },
        OnFailure: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "FailureFn", "Payload.$": "$" },
          End: true
        }
      }
    })
  ));

  return pairs;
}
