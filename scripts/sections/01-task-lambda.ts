/**
 * Section 01 – Task states: Lambda invoke & HTTP invoke → Azure Function / Http
 *
 * Sources:
 *  AWS: https://docs.aws.amazon.com/step-functions/latest/dg/concepts-amazon-states-language.html
 *       https://docs.aws.amazon.com/step-functions/latest/dg/connect-lambda.html
 *       https://docs.aws.amazon.com/step-functions/latest/dg/connect-third-party-apis.html
 *  Azure: https://learn.microsoft.com/en-us/azure/logic-apps/workflow-definition-language-functions-reference
 *         https://learn.microsoft.com/en-us/azure/logic-apps/logic-apps-workflow-actions-triggers
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

export function taskLambdaPairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // ── 1. Lambda:invoke – minimal (sync, no retry) ──────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "InvokeProcessor",
      States: {
        InvokeProcessor: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "arn:aws:lambda:us-east-1:123456789012:function:ProcessOrder", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: {
        manual: { type: "Request", kind: "Http", inputs: { schema: {} } }
      },
      actions: {
        InvokeProcessor: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.Web/sites/{functionAppName}/functions/ProcessOrder" },
            body: "@triggerBody()"
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 2. Lambda:invoke – with Next state ──────────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "ValidateInput",
      States: {
        ValidateInput: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ValidateInputFn", "Payload.$": "$" },
          Next: "StoreResult"
        },
        StoreResult: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "StoreResultFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: {
        manual: { type: "Request", kind: "Http", inputs: { schema: {} } }
      },
      actions: {
        ValidateInput: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ValidateInputFn" },
            body: "@triggerBody()"
          },
          runAfter: {}
        },
        StoreResult: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/StoreResultFn" },
            body: "@body('ValidateInput')"
          },
          runAfter: { ValidateInput: ["Succeeded"] }
        }
      }
    })
  ));

  // ── 3. Lambda:invoke – with TimeoutSeconds ───────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "CallWithTimeout",
      States: {
        CallWithTimeout: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "LongRunningFn", "Payload.$": "$" },
          TimeoutSeconds: 300,
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: {
        manual: { type: "Request", kind: "Http", inputs: { schema: {} } }
      },
      actions: {
        CallWithTimeout: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/LongRunningFn" },
            body: "@triggerBody()"
          },
          operationOptions: "DisableAsyncPattern",
          runAfter: {}
        }
      }
    })
  ));

  // ── 4. Lambda:invoke – with single Retry ────────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "CallLambda",
      States: {
        CallLambda: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "MyFn", "Payload.$": "$" },
          Retry: [{ ErrorEquals: ["States.ALL"], IntervalSeconds: 2, MaxAttempts: 3, BackoffRate: 2 }],
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: {
        manual: { type: "Request", kind: "Http", inputs: { schema: {} } }
      },
      actions: {
        CallLambda: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/MyFn" },
            body: "@triggerBody()"
          },
          retryPolicy: { type: "exponential", count: 3, interval: "PT2S", minimumInterval: "PT2S", maximumInterval: "PT1H" },
          runAfter: {}
        }
      }
    })
  ));

  // ── 5. Lambda:invoke – with Retry (fixed, BackoffRate=1) ────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "FixedRetryTask",
      States: {
        FixedRetryTask: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "IdempotentFn", "Payload.$": "$" },
          Retry: [{ ErrorEquals: ["States.TaskFailed"], IntervalSeconds: 5, MaxAttempts: 4, BackoffRate: 1 }],
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: {
        manual: { type: "Request", kind: "Http", inputs: { schema: {} } }
      },
      actions: {
        FixedRetryTask: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/IdempotentFn" },
            body: "@triggerBody()"
          },
          retryPolicy: { type: "fixed", count: 4, interval: "PT5S" },
          runAfter: {}
        }
      }
    })
  ));

  // ── 6. Lambda:invoke – MaxAttempts 0 (no retry) ─────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "NoRetryTask",
      States: {
        NoRetryTask: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "CriticalFn", "Payload.$": "$" },
          Retry: [{ ErrorEquals: ["States.ALL"], MaxAttempts: 0 }],
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: {
        manual: { type: "Request", kind: "Http", inputs: { schema: {} } }
      },
      actions: {
        NoRetryTask: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/CriticalFn" },
            body: "@triggerBody()"
          },
          retryPolicy: { type: "none" },
          runAfter: {}
        }
      }
    })
  ));

  // ── 7. Lambda:invoke – with Catch (States.ALL → error handler) ───────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "RiskyTask",
      States: {
        RiskyTask: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "RiskyFn", "Payload.$": "$" },
          Catch: [{ ErrorEquals: ["States.ALL"], Next: "HandleError", ResultPath: "$.error" }],
          End: true
        },
        HandleError: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ErrorHandlerFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: {
        manual: { type: "Request", kind: "Http", inputs: { schema: {} } }
      },
      actions: {
        RiskyTask: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/RiskyFn" },
            body: "@triggerBody()"
          },
          runAfter: {}
        },
        HandleError: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ErrorHandlerFn" },
            body: "@body('RiskyTask')"
          },
          runAfter: { RiskyTask: ["Failed", "TimedOut", "Skipped"] }
        }
      }
    })
  ));

  // ── 8. Lambda:invoke – with Catch (States.Timeout) ───────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "TimedTask",
      States: {
        TimedTask: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "SlowFn", "Payload.$": "$" },
          TimeoutSeconds: 60,
          Catch: [{ ErrorEquals: ["States.Timeout"], Next: "TimeoutFallback" }],
          End: true
        },
        TimeoutFallback: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "FallbackFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: {
        manual: { type: "Request", kind: "Http", inputs: { schema: {} } }
      },
      actions: {
        TimedTask: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/SlowFn" },
            body: "@triggerBody()"
          },
          runAfter: {}
        },
        TimeoutFallback: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/FallbackFn" },
            body: "@triggerBody()"
          },
          runAfter: { TimedTask: ["TimedOut"] }
        }
      }
    })
  ));

  // ── 9. Lambda:invoke – with ResultPath ───────────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "EnrichData",
      States: {
        EnrichData: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "EnrichFn", "Payload.$": "$" },
          ResultPath: "$.enriched",
          Next: "UseEnrichedData"
        },
        UseEnrichedData: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ConsumerFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: {
        manual: { type: "Request", kind: "Http", inputs: { schema: {} } }
      },
      actions: {
        EnrichData: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/EnrichFn" },
            body: "@triggerBody()"
          },
          runAfter: {}
        },
        Initialize_enriched: {
          type: "InitializeVariable",
          inputs: { variables: [{ name: "enriched", type: "Object", value: "@body('EnrichData')" }] },
          runAfter: { EnrichData: ["Succeeded"] }
        },
        UseEnrichedData: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ConsumerFn" },
            body: {
              "original": "@triggerBody()",
              "enriched": "@variables('enriched')"
            }
          },
          runAfter: { Initialize_enriched: ["Succeeded"] }
        }
      }
    })
  ));

  // ── 10. Lambda:invoke – with Parameters (static injection) ───────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "ClassifyDocument",
      States: {
        ClassifyDocument: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: {
            FunctionName: "ClassifyFn",
            Payload: {
              "documentId.$": "$.id",
              "contentType.$": "$.contentType",
              threshold: 0.85,
              model: "bert-v2"
            }
          },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: {
        manual: { type: "Request", kind: "Http", inputs: { schema: {} } }
      },
      actions: {
        ClassifyDocument: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ClassifyFn" },
            body: {
              documentId: "@triggerBody()?['id']",
              contentType: "@triggerBody()?['contentType']",
              threshold: 0.85,
              model: "bert-v2"
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 11. Lambda:invoke.waitForTaskToken – human-approval pattern ──────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "WaitForApproval",
      States: {
        WaitForApproval: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke.waitForTaskToken",
          Parameters: {
            FunctionName: "SendApprovalEmailFn",
            Payload: {
              "taskToken.$": "$$.Task.Token",
              "orderId.$": "$.orderId",
              "approverEmail.$": "$.approverEmail"
            }
          },
          HeartbeatSeconds: 3600,
          Next: "ApprovalGranted"
        },
        ApprovalGranted: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ProcessApprovalFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: {
        manual: { type: "Request", kind: "Http", inputs: { schema: {} } }
      },
      actions: {
        WaitForApproval: {
          type: "ApiConnection",
          inputs: {
            host: {
              connection: { name: "@parameters('$connections')['office365']['connectionId']" }
            },
            method: "post",
            path: "/Mail",
            body: {
              To: "@triggerBody()?['approverEmail']",
              Subject: "Approval required for order @{triggerBody()?['orderId']}",
              Body: "Please approve or reject this order. Callback URL: @{listCallbackUrl()}",
              Importance: "High"
            }
          },
          runAfter: {}
        },
        ApprovalGranted: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ProcessApprovalFn" },
            body: "@triggerBody()"
          },
          runAfter: { WaitForApproval: ["Succeeded"] }
        }
      }
    })
  ));

  // ── 12. Lambda:invoke.waitForTaskToken – SQS callback pattern ────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "SubmitJobAndWait",
      States: {
        SubmitJobAndWait: {
          Type: "Task",
          Resource: "arn:aws:states:::sqs:sendMessage.waitForTaskToken",
          Parameters: {
            QueueUrl: "https://sqs.us-east-1.amazonaws.com/123456789012/JobQueue",
            MessageBody: {
              "Input.$": "$",
              "TaskToken.$": "$$.Task.Token"
            }
          },
          HeartbeatSeconds: 600,
          Next: "ProcessJobResult"
        },
        ProcessJobResult: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ProcessJobResultFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: {
        manual: { type: "Request", kind: "Http", inputs: { schema: {} } }
      },
      actions: {
        SubmitJobAndWait: {
          type: "ApiConnection",
          inputs: {
            host: {
              connection: { name: "@parameters('$connections')['servicebus']['connectionId']" }
            },
            method: "post",
            path: "/@{encodeURIComponent('JobQueue')}/messages",
            body: {
              ContentData: "@{base64(string(triggerBody()))}",
              ContentType: "application/json"
            }
          },
          runAfter: {}
        },
        ProcessJobResult: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ProcessJobResultFn" },
            body: "@triggerBody()"
          },
          runAfter: { SubmitJobAndWait: ["Succeeded"] }
        }
      }
    })
  ));

  // ── 13. http:invoke – GET request ────────────────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "FetchUserProfile",
      States: {
        FetchUserProfile: {
          Type: "Task",
          Resource: "arn:aws:states:::http:invoke",
          Parameters: {
            ApiEndpoint: "https://api.example.com/users",
            Method: "GET",
            Headers: { Accept: "application/json", Authorization: "Bearer mytoken" },
            QueryParameters: { "userId.$": "$.userId" }
          },
          ResultSelector: { "profile.$": "$.ResponseBody" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: {
        manual: { type: "Request", kind: "Http", inputs: { schema: {} } }
      },
      actions: {
        FetchUserProfile: {
          type: "Http",
          inputs: {
            method: "GET",
            uri: "https://api.example.com/users",
            headers: { Accept: "application/json", Authorization: "Bearer mytoken" },
            queries: { userId: "@triggerBody()?['userId']" }
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 14. http:invoke – POST with body ─────────────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "CreateOrder",
      States: {
        CreateOrder: {
          Type: "Task",
          Resource: "arn:aws:states:::http:invoke",
          Parameters: {
            ApiEndpoint: "https://api.example.com/orders",
            Method: "POST",
            Headers: { "Content-Type": "application/json" },
            RequestBody: {
              "customerId.$": "$.customerId",
              "items.$": "$.items",
              "total.$": "$.total"
            }
          },
          Next: "ConfirmOrder"
        },
        ConfirmOrder: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ConfirmOrderFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: {
        manual: { type: "Request", kind: "Http", inputs: { schema: {} } }
      },
      actions: {
        CreateOrder: {
          type: "Http",
          inputs: {
            method: "POST",
            uri: "https://api.example.com/orders",
            headers: { "Content-Type": "application/json" },
            body: {
              customerId: "@triggerBody()?['customerId']",
              items: "@triggerBody()?['items']",
              total: "@triggerBody()?['total']"
            }
          },
          runAfter: {}
        },
        ConfirmOrder: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ConfirmOrderFn" },
            body: "@body('CreateOrder')"
          },
          runAfter: { CreateOrder: ["Succeeded"] }
        }
      }
    })
  ));

  // ── 15. http:invoke – PUT with authentication ─────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "UpdateRecord",
      States: {
        UpdateRecord: {
          Type: "Task",
          Resource: "arn:aws:states:::http:invoke",
          Parameters: {
            ApiEndpoint: "https://api.example.com/records/update",
            Method: "PUT",
            Headers: { "Content-Type": "application/json", "X-API-Key": "secret" },
            RequestBody: {
              "recordId.$": "$.recordId",
              "data.$": "$.data"
            }
          },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: {
        manual: { type: "Request", kind: "Http", inputs: { schema: {} } }
      },
      actions: {
        UpdateRecord: {
          type: "Http",
          inputs: {
            method: "PUT",
            uri: "https://api.example.com/records/update",
            headers: { "Content-Type": "application/json", "X-API-Key": "secret" },
            body: {
              recordId: "@triggerBody()?['recordId']",
              data: "@triggerBody()?['data']"
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 16. Lambda chain – 3 sequential tasks ────────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "Step1",
      States: {
        Step1: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "Step1Fn", "Payload.$": "$" },
          Next: "Step2"
        },
        Step2: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "Step2Fn", "Payload.$": "$" },
          Next: "Step3"
        },
        Step3: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "Step3Fn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: {
        manual: { type: "Request", kind: "Http", inputs: { schema: {} } }
      },
      actions: {
        Step1: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/Step1Fn" },
            body: "@triggerBody()"
          },
          runAfter: {}
        },
        Step2: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/Step2Fn" },
            body: "@body('Step1')"
          },
          runAfter: { Step1: ["Succeeded"] }
        },
        Step3: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/Step3Fn" },
            body: "@body('Step2')"
          },
          runAfter: { Step2: ["Succeeded"] }
        }
      }
    })
  ));

  // ── 17. Lambda with MaxDelaySeconds retry ────────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "CappedRetryTask",
      States: {
        CappedRetryTask: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ThrottledFn", "Payload.$": "$" },
          Retry: [{
            ErrorEquals: ["States.TaskFailed"],
            IntervalSeconds: 1,
            MaxAttempts: 10,
            BackoffRate: 2,
            MaxDelaySeconds: 60
          }],
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: {
        manual: { type: "Request", kind: "Http", inputs: { schema: {} } }
      },
      actions: {
        CappedRetryTask: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ThrottledFn" },
            body: "@triggerBody()"
          },
          retryPolicy: {
            type: "exponential",
            count: 10,
            interval: "PT1S",
            minimumInterval: "PT1S",
            maximumInterval: "PT60S"
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 18. Lambda with JitterStrategy FULL ──────────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "JitteredRetry",
      States: {
        JitteredRetry: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "JitteredFn", "Payload.$": "$" },
          Retry: [{
            ErrorEquals: ["States.ALL"],
            IntervalSeconds: 2,
            MaxAttempts: 5,
            BackoffRate: 1.5,
            JitterStrategy: "FULL"
          }],
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: {
        manual: { type: "Request", kind: "Http", inputs: { schema: {} } }
      },
      actions: {
        JitteredRetry: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/JitteredFn" },
            body: "@triggerBody()"
          },
          retryPolicy: {
            type: "exponential",
            count: 5,
            interval: "PT2S",
            minimumInterval: "PT2S",
            maximumInterval: "PT1H"
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 19. Lambda with multiple Catch clauses ───────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "MultiCatchTask",
      States: {
        MultiCatchTask: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ComplexFn", "Payload.$": "$" },
          Catch: [
            { ErrorEquals: ["States.Timeout"], Next: "HandleTimeout", ResultPath: "$.timeoutError" },
            { ErrorEquals: ["CustomError"], Next: "HandleCustomError", ResultPath: "$.customError" },
            { ErrorEquals: ["States.ALL"], Next: "HandleGenericError", ResultPath: "$.error" }
          ],
          End: true
        },
        HandleTimeout: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "TimeoutHandlerFn", "Payload.$": "$" },
          End: true
        },
        HandleCustomError: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "CustomErrorHandlerFn", "Payload.$": "$" },
          End: true
        },
        HandleGenericError: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "GenericErrorHandlerFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: {
        manual: { type: "Request", kind: "Http", inputs: { schema: {} } }
      },
      actions: {
        MultiCatchTask: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ComplexFn" },
            body: "@triggerBody()"
          },
          runAfter: {}
        },
        HandleTimeout: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/TimeoutHandlerFn" },
            body: "@triggerBody()"
          },
          runAfter: { MultiCatchTask: ["TimedOut"] }
        },
        HandleCustomError: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/CustomErrorHandlerFn" },
            body: "@triggerBody()"
          },
          runAfter: { MultiCatchTask: ["Failed"] }
        },
        HandleGenericError: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/GenericErrorHandlerFn" },
            body: "@triggerBody()"
          },
          runAfter: { MultiCatchTask: ["Failed", "TimedOut", "Skipped"] }
        }
      }
    })
  ));

  // ── 20. Lambda – states:startExecution (nested workflow) ─────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "TriggerSubWorkflow",
      States: {
        TriggerSubWorkflow: {
          Type: "Task",
          Resource: "arn:aws:states:::states:startExecution.sync:2",
          Parameters: {
            StateMachineArn: "arn:aws:states:us-east-1:123456789012:stateMachine:SubWorkflow",
            Input: {
              "orderId.$": "$.orderId",
              "customerId.$": "$.customerId"
            }
          },
          Next: "ProcessSubResult"
        },
        ProcessSubResult: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ProcessSubResultFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: {
        manual: { type: "Request", kind: "Http", inputs: { schema: {} } }
      },
      actions: {
        TriggerSubWorkflow: {
          type: "Workflow",
          inputs: {
            host: {
              triggerName: "manual",
              workflow: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Logic/workflows/SubWorkflow" }
            },
            body: {
              orderId: "@triggerBody()?['orderId']",
              customerId: "@triggerBody()?['customerId']"
            }
          },
          runAfter: {}
        },
        ProcessSubResult: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ProcessSubResultFn" },
            body: "@body('TriggerSubWorkflow')"
          },
          runAfter: { TriggerSubWorkflow: ["Succeeded"] }
        }
      }
    })
  ));

  // ── 21. Lambda – Bedrock invokeModel ─────────────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "InvokeAIModel",
      States: {
        InvokeAIModel: {
          Type: "Task",
          Resource: "arn:aws:states:::bedrock:invokeModel",
          Parameters: {
            ModelId: "anthropic.claude-3-sonnet-20240229-v1:0",
            Body: {
              "prompt.$": "$.prompt",
              max_tokens: 1024,
              temperature: 0.7
            }
          },
          ResultSelector: { "response.$": "$.Body.content[0].text" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: {
        manual: { type: "Request", kind: "Http", inputs: { schema: {} } }
      },
      actions: {
        InvokeAIModel: {
          type: "Http",
          inputs: {
            method: "POST",
            uri: "https://{openai-resource-name}.openai.azure.com/openai/deployments/{deployment-id}/chat/completions?api-version=2024-02-01",
            headers: { "Content-Type": "application/json", "api-key": "@parameters('openAIKey')" },
            body: {
              messages: [{ role: "user", content: "@triggerBody()?['prompt']" }],
              max_tokens: 1024,
              temperature: 0.7
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 22. Lambda – ECS runTask ───────────────────────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "RunContainerTask",
      States: {
        RunContainerTask: {
          Type: "Task",
          Resource: "arn:aws:states:::ecs:runTask.sync",
          Parameters: {
            LaunchType: "FARGATE",
            Cluster: "arn:aws:ecs:us-east-1:123456789012:cluster/MyCluster",
            TaskDefinition: "arn:aws:ecs:us-east-1:123456789012:task-definition/MyTaskDef:1",
            Overrides: {
              ContainerOverrides: [{
                Name: "myContainer",
                Environment: [
                  { Name: "INPUT_DATA", "Value.$": "$.inputData" }
                ]
              }]
            },
            NetworkConfiguration: {
              AwsvpcConfiguration: {
                Subnets: ["subnet-12345"],
                SecurityGroups: ["sg-12345"],
                AssignPublicIp: "ENABLED"
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
      triggers: {
        manual: { type: "Request", kind: "Http", inputs: { schema: {} } }
      },
      actions: {
        RunContainerTask: {
          type: "ApiConnection",
          inputs: {
            host: {
              connection: { name: "@parameters('$connections')['aci']['connectionId']" }
            },
            method: "put",
            path: "/subscriptions/@{encodeURIComponent(parameters('subscriptionId'))}/resourceGroups/@{encodeURIComponent(parameters('resourceGroupName'))}/providers/Microsoft.ContainerInstance/containerGroups/@{encodeURIComponent('myContainerGroup')}",
            body: {
              location: "eastus",
              properties: {
                containers: [{
                  name: "myContainer",
                  properties: {
                    image: "myregistry.azurecr.io/myimage:latest",
                    environmentVariables: [{ name: "INPUT_DATA", value: "@triggerBody()?['inputData']" }],
                    resources: { requests: { cpu: 1, memoryInGB: 1.5 } }
                  }
                }],
                osType: "Linux",
                restartPolicy: "Never"
              }
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 23. Lambda – SageMaker createTrainingJob ─────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "TrainMLModel",
      States: {
        TrainMLModel: {
          Type: "Task",
          Resource: "arn:aws:states:::sagemaker:createTrainingJob.sync",
          Parameters: {
            TrainingJobName: "MyTrainingJob",
            AlgorithmSpecification: {
              TrainingImage: "382416733822.dkr.ecr.us-east-1.amazonaws.com/linear-learner:1",
              TrainingInputMode: "File"
            },
            RoleArn: "arn:aws:iam::123456789012:role/SageMakerRole",
            InputDataConfig: [{
              ChannelName: "train",
              DataSource: { S3DataSource: { S3DataType: "S3Prefix", "S3Uri.$": "$.trainingDataUri" } }
            }],
            OutputDataConfig: { "S3OutputPath.$": "$.outputPath" },
            ResourceConfig: { InstanceType: "ml.m4.xlarge", InstanceCount: 1, VolumeSizeInGB: 10 },
            StoppingCondition: { MaxRuntimeInSeconds: 3600 }
          },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: {
        manual: { type: "Request", kind: "Http", inputs: { schema: {} } }
      },
      actions: {
        TrainMLModel: {
          type: "ApiConnection",
          inputs: {
            host: {
              connection: { name: "@parameters('$connections')['azureml']['connectionId']" }
            },
            method: "post",
            path: "/subscriptions/@{encodeURIComponent(parameters('subscriptionId'))}/resourceGroups/@{encodeURIComponent(parameters('resourceGroupName'))}/providers/Microsoft.MachineLearningServices/workspaces/@{encodeURIComponent(parameters('workspaceName'))}/jobs",
            body: {
              jobType: "Command",
              displayName: "MyTrainingJob",
              inputs: { trainingData: { jobInputType: "uri_folder", uri: "@triggerBody()?['trainingDataUri']" } },
              outputs: { output: { jobOutputType: "uri_folder", uri: "@triggerBody()?['outputPath']" } },
              resources: { instanceType: "Standard_DS3_v2", instanceCount: 1 }
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 24. Lambda – Glue startJobRun ────────────────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "RunETLJob",
      States: {
        RunETLJob: {
          Type: "Task",
          Resource: "arn:aws:states:::glue:startJobRun.sync",
          Parameters: {
            JobName: "MyGlueETLJob",
            Arguments: {
              "--source-path.$": "$.sourcePath",
              "--output-path.$": "$.outputPath",
              "--job-bookmark-option": "job-bookmark-enable"
            }
          },
          Next: "NotifyCompletion"
        },
        NotifyCompletion: {
          Type: "Task",
          Resource: "arn:aws:states:::sns:publish",
          Parameters: {
            TopicArn: "arn:aws:sns:us-east-1:123456789012:ETLCompletionTopic",
            Message: "ETL job completed successfully"
          },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: {
        manual: { type: "Request", kind: "Http", inputs: { schema: {} } }
      },
      actions: {
        RunETLJob: {
          type: "ApiConnection",
          inputs: {
            host: {
              connection: { name: "@parameters('$connections')['azuredatafactory']['connectionId']" }
            },
            method: "post",
            path: "/subscriptions/@{encodeURIComponent(parameters('subscriptionId'))}/resourceGroups/@{encodeURIComponent(parameters('resourceGroupName'))}/providers/Microsoft.DataFactory/factories/@{encodeURIComponent(parameters('factoryName'))}/pipelines/MyETLPipeline/createRun",
            body: {
              sourcePath: "@triggerBody()?['sourcePath']",
              outputPath: "@triggerBody()?['outputPath']"
            }
          },
          runAfter: {}
        },
        NotifyCompletion: {
          type: "ApiConnection",
          inputs: {
            host: {
              connection: { name: "@parameters('$connections')['servicebus']['connectionId']" }
            },
            method: "post",
            path: "/@{encodeURIComponent('ETLCompletionTopic')}/messages",
            body: { ContentData: "@{base64('ETL job completed successfully')}" }
          },
          runAfter: { RunETLJob: ["Succeeded"] }
        }
      }
    })
  ));

  // ── 25. Lambda – http:invoke with retry ──────────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "CallExternalAPI",
      States: {
        CallExternalAPI: {
          Type: "Task",
          Resource: "arn:aws:states:::http:invoke",
          Parameters: {
            ApiEndpoint: "https://api.thirdparty.com/data",
            Method: "GET",
            Headers: { "X-API-Key": "secret123" }
          },
          Retry: [{ ErrorEquals: ["States.ALL"], IntervalSeconds: 3, MaxAttempts: 3, BackoffRate: 2 }],
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: {
        manual: { type: "Request", kind: "Http", inputs: { schema: {} } }
      },
      actions: {
        CallExternalAPI: {
          type: "Http",
          inputs: {
            method: "GET",
            uri: "https://api.thirdparty.com/data",
            headers: { "X-API-Key": "secret123" }
          },
          retryPolicy: { type: "exponential", count: 3, interval: "PT3S", minimumInterval: "PT3S", maximumInterval: "PT1H" },
          runAfter: {}
        }
      }
    })
  ));

  return pairs;
}
