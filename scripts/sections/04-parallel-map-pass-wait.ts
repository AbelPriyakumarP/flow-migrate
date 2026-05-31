/**
 * Section 04 – Parallel / Map / Pass / Wait / Succeed / Fail
 *
 * Sources:
 *  AWS Parallel: https://docs.aws.amazon.com/step-functions/latest/dg/amazon-states-language-parallel-state.html
 *  AWS Map:      https://docs.aws.amazon.com/step-functions/latest/dg/amazon-states-language-map-state.html
 *  AWS Pass:     https://docs.aws.amazon.com/step-functions/latest/dg/amazon-states-language-pass-state.html
 *  AWS Wait:     https://docs.aws.amazon.com/step-functions/latest/dg/amazon-states-language-wait-state.html
 *  AWS Succeed:  https://docs.aws.amazon.com/step-functions/latest/dg/amazon-states-language-succeed-state.html
 *  AWS Fail:     https://docs.aws.amazon.com/step-functions/latest/dg/amazon-states-language-fail-state.html
 *  Azure Scope:  https://learn.microsoft.com/en-us/azure/logic-apps/logic-apps-workflow-actions-triggers#scope-action
 *  Azure Select: https://learn.microsoft.com/en-us/azure/logic-apps/workflow-definition-language-functions-reference#select
 *  Azure Foreach:https://learn.microsoft.com/en-us/azure/logic-apps/logic-apps-workflow-actions-triggers#foreach-action
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

export function parallelMapPassWaitPairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // ════════════════════════════════════════════════════════════
  // PARALLEL STATE
  // ════════════════════════════════════════════════════════════

  // 1. Parallel – 2 concurrent branches, independent tasks
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "FetchDataInParallel",
      States: {
        FetchDataInParallel: {
          Type: "Parallel",
          Branches: [
            {
              StartAt: "GetUserProfile",
              States: {
                GetUserProfile: {
                  Type: "Task",
                  Resource: "arn:aws:states:::lambda:invoke",
                  Parameters: { FunctionName: "UserProfileFn", "Payload.$": "$" },
                  End: true
                }
              }
            },
            {
              StartAt: "GetOrderHistory",
              States: {
                GetOrderHistory: {
                  Type: "Task",
                  Resource: "arn:aws:states:::lambda:invoke",
                  Parameters: { FunctionName: "OrderHistoryFn", "Payload.$": "$" },
                  End: true
                }
              }
            }
          ],
          Next: "MergeResults"
        },
        MergeResults: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "MergeFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        GetUserProfile: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/UserProfileFn" }, body: "@triggerBody()" },
          runAfter: {}
        },
        GetOrderHistory: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/OrderHistoryFn" }, body: "@triggerBody()" },
          runAfter: {}
        },
        MergeResults: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/MergeFn" },
            body: {
              userProfile: "@body('GetUserProfile')",
              orderHistory: "@body('GetOrderHistory')"
            }
          },
          runAfter: { GetUserProfile: ["Succeeded"], GetOrderHistory: ["Succeeded"] }
        }
      }
    })
  ));

  // 2. Parallel – 3 branches
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "RunChecks",
      States: {
        RunChecks: {
          Type: "Parallel",
          Branches: [
            {
              StartAt: "FraudCheck",
              States: { FraudCheck: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "FraudCheckFn", "Payload.$": "$" }, End: true } }
            },
            {
              StartAt: "CreditCheck",
              States: { CreditCheck: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "CreditCheckFn", "Payload.$": "$" }, End: true } }
            },
            {
              StartAt: "InventoryCheck",
              States: { InventoryCheck: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "InventoryCheckFn", "Payload.$": "$" }, End: true } }
            }
          ],
          ResultPath: "$.checks",
          Next: "EvaluateChecks"
        },
        EvaluateChecks: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "EvaluateFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        FraudCheck: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/FraudCheckFn" }, body: "@triggerBody()" },
          runAfter: {}
        },
        CreditCheck: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/CreditCheckFn" }, body: "@triggerBody()" },
          runAfter: {}
        },
        InventoryCheck: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/InventoryCheckFn" }, body: "@triggerBody()" },
          runAfter: {}
        },
        EvaluateChecks: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/EvaluateFn" },
            body: {
              fraud: "@body('FraudCheck')",
              credit: "@body('CreditCheck')",
              inventory: "@body('InventoryCheck')"
            }
          },
          runAfter: {
            FraudCheck: ["Succeeded"],
            CreditCheck: ["Succeeded"],
            InventoryCheck: ["Succeeded"]
          }
        }
      }
    })
  ));

  // 3. Parallel – with Catch (error in any branch)
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "ParallelWithCatch",
      States: {
        ParallelWithCatch: {
          Type: "Parallel",
          Branches: [
            {
              StartAt: "BranchA",
              States: { BranchA: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "BranchAFn", "Payload.$": "$" }, End: true } }
            },
            {
              StartAt: "BranchB",
              States: { BranchB: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "BranchBFn", "Payload.$": "$" }, End: true } }
            }
          ],
          Catch: [{ ErrorEquals: ["States.ALL"], Next: "ParallelErrorHandler" }],
          End: true
        },
        ParallelErrorHandler: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ParallelErrorFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        BranchA: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/BranchAFn" }, body: "@triggerBody()" },
          runAfter: {}
        },
        BranchB: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/BranchBFn" }, body: "@triggerBody()" },
          runAfter: {}
        },
        ParallelErrorHandler: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ParallelErrorFn" }, body: "@triggerBody()" },
          runAfter: { BranchA: ["Failed", "TimedOut"], BranchB: ["Failed", "TimedOut"] }
        }
      }
    })
  ));

  // 4. Parallel – Scope wrapping a group of related actions
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "ProcessOrder",
      States: {
        ProcessOrder: {
          Type: "Parallel",
          Branches: [
            {
              StartAt: "SendConfirmationEmail",
              States: {
                SendConfirmationEmail: {
                  Type: "Task",
                  Resource: "arn:aws:states:::lambda:invoke",
                  Parameters: { FunctionName: "EmailFn", "Payload.$": "$" },
                  Next: "LogEmailSent"
                },
                LogEmailSent: {
                  Type: "Task",
                  Resource: "arn:aws:states:::lambda:invoke",
                  Parameters: { FunctionName: "LogFn", "Payload.$": "$" },
                  End: true
                }
              }
            }
          ],
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        ProcessOrder: {
          type: "Scope",
          actions: {
            SendConfirmationEmail: {
              type: "Function",
              inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/EmailFn" }, body: "@triggerBody()" },
              runAfter: {}
            },
            LogEmailSent: {
              type: "Function",
              inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/LogFn" }, body: "@body('SendConfirmationEmail')" },
              runAfter: { SendConfirmationEmail: ["Succeeded"] }
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // ════════════════════════════════════════════════════════════
  // MAP STATE
  // ════════════════════════════════════════════════════════════

  // 5. Map – data transform (pure) → Select
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "TransformItems",
      States: {
        TransformItems: {
          Type: "Map",
          ItemsPath: "$.items",
          ItemSelector: {
            "id.$": "$$.Map.Item.Value.id",
            "name.$": "$$.Map.Item.Value.name",
            "total.$": "$$.Map.Item.Value.price"
          },
          ItemProcessor: {
            ProcessorConfig: { Mode: "INLINE" },
            StartAt: "FormatItem",
            States: {
              FormatItem: {
                Type: "Pass",
                Parameters: {
                  "itemId.$": "$.id",
                  "displayName.$": "$.name",
                  "amount.$": "$.total"
                },
                End: true
              }
            }
          },
          ResultPath: "$.formattedItems",
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        TransformItems: {
          type: "Select",
          inputs: {
            from: "@triggerBody()?['items']",
            select: {
              itemId: "@item()?['id']",
              displayName: "@item()?['name']",
              amount: "@item()?['price']"
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // 6. Map – side-effects (calling API per item) → Foreach
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "ProcessEachOrder",
      States: {
        ProcessEachOrder: {
          Type: "Map",
          ItemsPath: "$.orders",
          MaxConcurrency: 5,
          ItemProcessor: {
            ProcessorConfig: { Mode: "INLINE" },
            StartAt: "ProcessSingleOrder",
            States: {
              ProcessSingleOrder: {
                Type: "Task",
                Resource: "arn:aws:states:::lambda:invoke",
                Parameters: { FunctionName: "ProcessSingleOrderFn", "Payload.$": "$" },
                End: true
              }
            }
          },
          ResultPath: "$.processedOrders",
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        ProcessEachOrder: {
          type: "Foreach",
          foreach: "@triggerBody()?['orders']",
          operationOptions: "Sequential",
          actions: {
            ProcessSingleOrder: {
              type: "Function",
              inputs: {
                function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ProcessSingleOrderFn" },
                body: "@items('ProcessEachOrder')"
              },
              runAfter: {}
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // 7. Map – MaxConcurrency 1 (sequential) → Foreach Sequential
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "SequentialProcess",
      States: {
        SequentialProcess: {
          Type: "Map",
          ItemsPath: "$.records",
          MaxConcurrency: 1,
          ItemProcessor: {
            ProcessorConfig: { Mode: "INLINE" },
            StartAt: "ProcessRecord",
            States: {
              ProcessRecord: {
                Type: "Task",
                Resource: "arn:aws:states:::dynamodb:putItem",
                Parameters: {
                  TableName: "RecordsTable",
                  Item: {
                    "id": { "S.$": "$.recordId" },
                    "data": { "S.$": "States.JsonToString($)" }
                  }
                },
                End: true
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
        SequentialProcess: {
          type: "Foreach",
          foreach: "@triggerBody()?['records']",
          operationOptions: "Sequential",
          actions: {
            ProcessRecord: {
              type: "ApiConnection",
              inputs: {
                host: { connection: { name: "@parameters('$connections')['documentdb']['connectionId']" } },
                method: "post",
                path: "/dbs/@{encodeURIComponent('RecordsTable')}/colls/@{encodeURIComponent('records')}/docs",
                body: {
                  id: "@items('SequentialProcess')?['recordId']",
                  data: "@items('SequentialProcess')"
                }
              },
              runAfter: {}
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // 8. Map – with Retry inside ItemProcessor
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "ProcessWithRetry",
      States: {
        ProcessWithRetry: {
          Type: "Map",
          ItemsPath: "$.events",
          MaxConcurrency: 10,
          ItemProcessor: {
            ProcessorConfig: { Mode: "INLINE" },
            StartAt: "HandleEvent",
            States: {
              HandleEvent: {
                Type: "Task",
                Resource: "arn:aws:states:::lambda:invoke",
                Parameters: { FunctionName: "HandleEventFn", "Payload.$": "$" },
                Retry: [{ ErrorEquals: ["States.ALL"], IntervalSeconds: 2, MaxAttempts: 3, BackoffRate: 2 }],
                End: true
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
        ProcessWithRetry: {
          type: "Foreach",
          foreach: "@triggerBody()?['events']",
          actions: {
            HandleEvent: {
              type: "Function",
              inputs: {
                function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/HandleEventFn" },
                body: "@items('ProcessWithRetry')"
              },
              retryPolicy: { type: "exponential", count: 3, interval: "PT2S", minimumInterval: "PT2S", maximumInterval: "PT1H" },
              runAfter: {}
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // 9. Map – extract single field from array (pure Select pattern)
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "ExtractIds",
      States: {
        ExtractIds: {
          Type: "Map",
          ItemsPath: "$.users",
          ItemSelector: { "userId.$": "$$.Map.Item.Value.id" },
          ItemProcessor: {
            ProcessorConfig: { Mode: "INLINE" },
            StartAt: "PassId",
            States: {
              PassId: {
                Type: "Pass",
                Parameters: { "id.$": "$.userId" },
                End: true
              }
            }
          },
          ResultPath: "$.userIds",
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        ExtractIds: {
          type: "Select",
          inputs: {
            from: "@triggerBody()?['users']",
            select: { id: "@item()?['id']" }
          },
          runAfter: {}
        }
      }
    })
  ));

  // ════════════════════════════════════════════════════════════
  // PASS STATE
  // ════════════════════════════════════════════════════════════

  // 10. Pass – inject static values → Compose
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "InjectDefaults",
      States: {
        InjectDefaults: {
          Type: "Pass",
          Parameters: {
            "orderId.$": "$.orderId",
            source: "web",
            currency: "USD",
            version: "2.0"
          },
          Next: "ProcessWithDefaults"
        },
        ProcessWithDefaults: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ProcessFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        InjectDefaults: {
          type: "Compose",
          inputs: {
            orderId: "@triggerBody()?['orderId']",
            source: "web",
            currency: "USD",
            version: "2.0"
          },
          runAfter: {}
        },
        ProcessWithDefaults: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ProcessFn" },
            body: "@outputs('InjectDefaults')"
          },
          runAfter: { InjectDefaults: ["Succeeded"] }
        }
      }
    })
  ));

  // 11. Pass – reshape input with Result → Compose
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "ReshapeInput",
      States: {
        ReshapeInput: {
          Type: "Pass",
          Result: {
            status: "initialized",
            metadata: { version: "1.0", source: "system" }
          },
          ResultPath: "$.context",
          Next: "UseContext"
        },
        UseContext: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ContextFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        ReshapeInput: {
          type: "Compose",
          inputs: { status: "initialized", metadata: { version: "1.0", source: "system" } },
          runAfter: {}
        },
        UseContext: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ContextFn" },
            body: {
              original: "@triggerBody()",
              context: "@outputs('ReshapeInput')"
            }
          },
          runAfter: { ReshapeInput: ["Succeeded"] }
        }
      }
    })
  ));

  // 12. Pass – no-op pass-through → Compose identity
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "Passthrough",
      States: {
        Passthrough: {
          Type: "Pass",
          Next: "NextStep"
        },
        NextStep: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "NextStepFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        Passthrough: {
          type: "Compose",
          inputs: "@triggerBody()",
          runAfter: {}
        },
        NextStep: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/NextStepFn" },
            body: "@outputs('Passthrough')"
          },
          runAfter: { Passthrough: ["Succeeded"] }
        }
      }
    })
  ));

  // ════════════════════════════════════════════════════════════
  // WAIT STATE
  // ════════════════════════════════════════════════════════════

  // 13. Wait – Seconds (fixed delay)
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "WaitThenNotify",
      States: {
        WaitThenNotify: {
          Type: "Wait",
          Seconds: 300,
          Next: "SendReminder"
        },
        SendReminder: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ReminderFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        WaitThenNotify: {
          type: "Wait",
          inputs: { interval: { unit: "Second", count: 300 } },
          runAfter: {}
        },
        SendReminder: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ReminderFn" },
            body: "@triggerBody()"
          },
          runAfter: { WaitThenNotify: ["Succeeded"] }
        }
      }
    })
  ));

  // 14. Wait – SecondsPath (dynamic delay from input)
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "DynamicWait",
      States: {
        DynamicWait: {
          Type: "Wait",
          SecondsPath: "$.waitSeconds",
          Next: "ProceedAfterWait"
        },
        ProceedAfterWait: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ProceedFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        DynamicWait: {
          type: "Wait",
          inputs: { interval: { unit: "Second", count: "@triggerBody()?['waitSeconds']" } },
          runAfter: {}
        },
        ProceedAfterWait: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ProceedFn" },
            body: "@triggerBody()"
          },
          runAfter: { DynamicWait: ["Succeeded"] }
        }
      }
    })
  ));

  // 15. Wait – Timestamp (fixed future time)
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "WaitUntilMidnight",
      States: {
        WaitUntilMidnight: {
          Type: "Wait",
          Timestamp: "2024-12-31T00:00:00Z",
          Next: "NewYearTask"
        },
        NewYearTask: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "NewYearFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        WaitUntilMidnight: {
          type: "Wait",
          inputs: { until: { timestamp: "2024-12-31T00:00:00Z" } },
          runAfter: {}
        },
        NewYearTask: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/NewYearFn" },
            body: "@triggerBody()"
          },
          runAfter: { WaitUntilMidnight: ["Succeeded"] }
        }
      }
    })
  ));

  // 16. Wait – TimestampPath (timestamp from input)
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "WaitUntilScheduled",
      States: {
        WaitUntilScheduled: {
          Type: "Wait",
          TimestampPath: "$.scheduledAt",
          Next: "ExecuteScheduled"
        },
        ExecuteScheduled: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ScheduledFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        WaitUntilScheduled: {
          type: "Wait",
          inputs: { until: { timestamp: "@triggerBody()?['scheduledAt']" } },
          runAfter: {}
        },
        ExecuteScheduled: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ScheduledFn" },
            body: "@triggerBody()"
          },
          runAfter: { WaitUntilScheduled: ["Succeeded"] }
        }
      }
    })
  ));

  // ════════════════════════════════════════════════════════════
  // SUCCEED / FAIL
  // ════════════════════════════════════════════════════════════

  // 17. Succeed → Terminate runStatus Succeeded
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "Validate",
      States: {
        Validate: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ValidateFn", "Payload.$": "$" },
          Next: "Done"
        },
        Done: {
          Type: "Succeed"
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        Validate: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ValidateFn" },
            body: "@triggerBody()"
          },
          runAfter: {}
        },
        Done: {
          type: "Terminate",
          inputs: { runStatus: "Succeeded" },
          runAfter: { Validate: ["Succeeded"] }
        }
      }
    })
  ));

  // 18. Fail with Error and Cause → Terminate runStatus Failed
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "ValidateInput",
      States: {
        ValidateInput: {
          Type: "Choice",
          Choices: [
            { Variable: "$.amount", NumericGreaterThan: 0, Next: "Process" }
          ],
          Default: "FailInvalidAmount"
        },
        Process: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ProcessFn", "Payload.$": "$" },
          End: true
        },
        FailInvalidAmount: {
          Type: "Fail",
          Error: "InvalidInput",
          Cause: "Amount must be greater than zero"
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        ValidateInput: {
          type: "If",
          expression: { and: [{ greater: ["@triggerBody()?['amount']", 0] }] },
          actions: {
            Process: {
              type: "Function",
              inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ProcessFn" }, body: "@triggerBody()" },
              runAfter: {}
            }
          },
          else: {
            actions: {
              FailInvalidAmount: {
                type: "Terminate",
                inputs: { runStatus: "Failed", runError: { code: "InvalidInput", message: "Amount must be greater than zero" } },
                runAfter: {}
              }
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // 19. Fail after task error
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "CheckAuthorization",
      States: {
        CheckAuthorization: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "AuthCheckFn", "Payload.$": "$" },
          Next: "RouteByAuth"
        },
        RouteByAuth: {
          Type: "Choice",
          Choices: [
            { Variable: "$.authorized", BooleanEquals: true, Next: "ExecuteAction" }
          ],
          Default: "FailUnauthorized"
        },
        ExecuteAction: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ActionFn", "Payload.$": "$" },
          End: true
        },
        FailUnauthorized: {
          Type: "Fail",
          Error: "Unauthorized",
          Cause: "User is not authorized to perform this action"
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        CheckAuthorization: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/AuthCheckFn" }, body: "@triggerBody()" },
          runAfter: {}
        },
        RouteByAuth: {
          type: "If",
          expression: { and: [{ equals: ["@body('CheckAuthorization')?['authorized']", true] }] },
          actions: {
            ExecuteAction: {
              type: "Function",
              inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ActionFn" }, body: "@body('CheckAuthorization')" },
              runAfter: {}
            }
          },
          else: {
            actions: {
              FailUnauthorized: {
                type: "Terminate",
                inputs: { runStatus: "Failed", runError: { code: "Unauthorized", message: "User is not authorized to perform this action" } },
                runAfter: {}
              }
            }
          },
          runAfter: { CheckAuthorization: ["Succeeded"] }
        }
      }
    })
  ));

  return pairs;
}
