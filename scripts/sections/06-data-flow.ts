/**
 * Section 06 – Data-flow patterns
 * InputPath / OutputPath / Parameters / ResultPath / ResultSelector
 *
 * Sources:
 *  AWS: https://docs.aws.amazon.com/step-functions/latest/dg/concepts-input-output-filtering.html
 *  Azure expressions: https://learn.microsoft.com/en-us/azure/logic-apps/workflow-definition-language-functions-reference
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

export function dataFlowPairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // ── 1. InputPath – filter input to specific subtree ──────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "ProcessSubset",
      States: {
        ProcessSubset: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          InputPath: "$.orderDetails",
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
        ProcessSubset: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ProcessFn" },
            body: "@triggerBody()?['orderDetails']"
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 2. OutputPath – expose only a sub-field from result ──────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "GetAndFilter",
      States: {
        GetAndFilter: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "GetDataFn", "Payload.$": "$" },
          OutputPath: "$.Payload.result",
          Next: "UseResult"
        },
        UseResult: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "UseResultFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        GetAndFilter: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/GetDataFn" }, body: "@triggerBody()" },
          runAfter: {}
        },
        UseResult: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/UseResultFn" },
            body: "@body('GetAndFilter')?['result']"
          },
          runAfter: { GetAndFilter: ["Succeeded"] }
        }
      }
    })
  ));

  // ── 3. ResultPath – merge result into input state ────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "EnrichWithLookup",
      States: {
        EnrichWithLookup: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "LookupFn", "Payload.$": "$" },
          ResultPath: "$.lookupResult",
          Next: "ProcessWithLookup"
        },
        ProcessWithLookup: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ProcessWithLookupFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        EnrichWithLookup: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/LookupFn" }, body: "@triggerBody()" },
          runAfter: {}
        },
        Store_lookupResult: {
          type: "InitializeVariable",
          inputs: { variables: [{ name: "lookupResult", type: "Object", value: "@body('EnrichWithLookup')" }] },
          runAfter: { EnrichWithLookup: ["Succeeded"] }
        },
        ProcessWithLookup: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ProcessWithLookupFn" },
            body: {
              original: "@triggerBody()",
              lookupResult: "@variables('lookupResult')"
            }
          },
          runAfter: { Store_lookupResult: ["Succeeded"] }
        }
      }
    })
  ));

  // ── 4. ResultPath null – discard result, keep original input ─────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "SideEffect",
      States: {
        SideEffect: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "AuditFn", "Payload.$": "$" },
          ResultPath: null,
          Next: "ContinueWithOriginal"
        },
        ContinueWithOriginal: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "MainFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        SideEffect: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/AuditFn" }, body: "@triggerBody()" },
          runAfter: {}
        },
        ContinueWithOriginal: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/MainFn" },
            body: "@triggerBody()"
          },
          runAfter: { SideEffect: ["Succeeded"] }
        }
      }
    })
  ));

  // ── 5. ResultSelector – reshape Lambda response ──────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "CallAndReshape",
      States: {
        CallAndReshape: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "GetDataFn", "Payload.$": "$" },
          ResultSelector: {
            "userId.$": "$.Payload.data.userId",
            "email.$": "$.Payload.data.email",
            "createdAt.$": "$.Payload.metadata.timestamp"
          },
          ResultPath: "$.user",
          Next: "UseUser"
        },
        UseUser: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "UseUserFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        CallAndReshape_raw: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/GetDataFn" }, body: "@triggerBody()" },
          runAfter: {}
        },
        CallAndReshape: {
          type: "Compose",
          inputs: {
            userId: "@body('CallAndReshape_raw')?['data']?['userId']",
            email: "@body('CallAndReshape_raw')?['data']?['email']",
            createdAt: "@body('CallAndReshape_raw')?['metadata']?['timestamp']"
          },
          runAfter: { CallAndReshape_raw: ["Succeeded"] }
        },
        UseUser: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/UseUserFn" },
            body: {
              original: "@triggerBody()",
              user: "@outputs('CallAndReshape')"
            }
          },
          runAfter: { CallAndReshape: ["Succeeded"] }
        }
      }
    })
  ));

  // ── 6. Parameters – construct new object from context ────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "InjectContext",
      States: {
        InjectContext: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: {
            FunctionName: "ContextAwareFn",
            Payload: {
              "orderId.$": "$.orderId",
              "executionId.$": "$$.Execution.Id",
              "executionName.$": "$$.Execution.Name",
              "startTime.$": "$$.Execution.StartTime",
              "stateMachineArn.$": "$$.StateMachine.Id"
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
        InjectContext: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ContextAwareFn" },
            body: {
              orderId: "@triggerBody()?['orderId']",
              executionId: "@{workflow()['run']['id']}",
              executionName: "@{workflow()['run']['name']}",
              startTime: "@{workflow()['run']['startTime']}",
              stateMachineArn: "@{workflow()['id']}"
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 7. Parameters – static + dynamic mix ────────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "CallWithMixedParams",
      States: {
        CallWithMixedParams: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: {
            FunctionName: "MixedParamsFn",
            Payload: {
              "dynamicId.$": "$.id",
              "dynamicAmount.$": "$.amount",
              staticEnv: "production",
              staticVersion: "v3",
              staticEnabled: true,
              staticMaxRetries: 5
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
        CallWithMixedParams: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/MixedParamsFn" },
            body: {
              dynamicId: "@triggerBody()?['id']",
              dynamicAmount: "@triggerBody()?['amount']",
              staticEnv: "production",
              staticVersion: "v3",
              staticEnabled: true,
              staticMaxRetries: 5
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 8. States.Format intrinsic → concat() ───────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "BuildMessage",
      States: {
        BuildMessage: {
          Type: "Task",
          Resource: "arn:aws:states:::sns:publish",
          Parameters: {
            TopicArn: "arn:aws:sns:us-east-1:123456789012:NotifyTopic",
            "Subject.$": "States.Format('Order {} confirmed for customer {}', $.orderId, $.customerId)",
            "Message.$": "States.Format('Your order {} has been placed. Total: ${}', $.orderId, $.total)"
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
        BuildMessage: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['servicebus']['connectionId']" } },
            method: "post",
            path: "/@{encodeURIComponent('NotifyTopic')}/messages",
            body: {
              ContentData: "@{base64(concat('Your order ', triggerBody()?['orderId'], ' has been placed. Total: $', triggerBody()?['total']))}",
              ContentType: "text/plain",
              Label: "@{concat('Order ', triggerBody()?['orderId'], ' confirmed for customer ', triggerBody()?['customerId'])}"
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 9. States.StringToJson intrinsic → json() ───────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "ParseStringInput",
      States: {
        ParseStringInput: {
          Type: "Pass",
          Parameters: {
            "parsedPayload.$": "States.StringToJson($.rawJsonString)"
          },
          Next: "Useparsed"
        },
        UseParsed: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "UseParsedFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        ParseStringInput: {
          type: "ParseJson",
          inputs: {
            content: "@triggerBody()?['rawJsonString']",
            schema: { type: "object" }
          },
          runAfter: {}
        },
        UseParsed: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/UseParsedFn" },
            body: "@body('ParseStringInput')"
          },
          runAfter: { ParseStringInput: ["Succeeded"] }
        }
      }
    })
  ));

  // ── 10. States.JsonToString → string() ──────────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "SerializeForQueue",
      States: {
        SerializeForQueue: {
          Type: "Task",
          Resource: "arn:aws:states:::sqs:sendMessage",
          Parameters: {
            QueueUrl: "https://sqs.us-east-1.amazonaws.com/123456789012/DataQueue",
            "MessageBody.$": "States.JsonToString($.payload)"
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
        SerializeForQueue: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['servicebus']['connectionId']" } },
            method: "post",
            path: "/@{encodeURIComponent('DataQueue')}/messages",
            body: {
              ContentData: "@{base64(string(triggerBody()?['payload']))}",
              ContentType: "application/json"
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 11. States.Array intrinsic → createArray() ───────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "BuildArray",
      States: {
        BuildArray: {
          Type: "Pass",
          Parameters: {
            "ids.$": "States.Array($.id1, $.id2, $.id3)"
          },
          Next: "ProcessArray"
        },
        ProcessArray: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ProcessArrayFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        BuildArray: {
          type: "Compose",
          inputs: {
            ids: "@createArray(triggerBody()?['id1'], triggerBody()?['id2'], triggerBody()?['id3'])"
          },
          runAfter: {}
        },
        ProcessArray: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ProcessArrayFn" },
            body: "@outputs('BuildArray')"
          },
          runAfter: { BuildArray: ["Succeeded"] }
        }
      }
    })
  ));

  // ── 12. States.MathAdd intrinsic → add() ─────────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "CalculateTotal",
      States: {
        CalculateTotal: {
          Type: "Pass",
          Parameters: {
            "total.$": "States.MathAdd($.subtotal, $.tax)"
          },
          Next: "RecordTotal"
        },
        RecordTotal: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "RecordTotalFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        CalculateTotal: {
          type: "Compose",
          inputs: {
            total: "@add(triggerBody()?['subtotal'], triggerBody()?['tax'])"
          },
          runAfter: {}
        },
        RecordTotal: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/RecordTotalFn" },
            body: "@outputs('CalculateTotal')"
          },
          runAfter: { CalculateTotal: ["Succeeded"] }
        }
      }
    })
  ));

  // ── 13. Variable actions pattern (Azure → AWS) ──────────────────────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        Initialize_counter: {
          type: "InitializeVariable",
          inputs: { variables: [{ name: "counter", type: "Integer", value: 0 }] },
          runAfter: {}
        },
        Initialize_results: {
          type: "InitializeVariable",
          inputs: { variables: [{ name: "results", type: "Array", value: [] }] },
          runAfter: { Initialize_counter: ["Succeeded"] }
        },
        Process: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ProcessFn" }, body: "@triggerBody()" },
          runAfter: { Initialize_results: ["Succeeded"] }
        },
        Increment_counter: {
          type: "IncrementVariable",
          inputs: { name: "counter", value: 1 },
          runAfter: { Process: ["Succeeded"] }
        }
      }
    }),
    j({
      StartAt: "InitializeState",
      States: {
        InitializeState: {
          Type: "Pass",
          Parameters: {
            "counter": 0,
            "results": [],
            "originalInput.$": "$"
          },
          Next: "Process"
        },
        Process: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ProcessFn", "Payload.$": "$" },
          ResultPath: "$.processResult",
          Next: "IncrementCounter"
        },
        IncrementCounter: {
          Type: "Pass",
          Parameters: {
            "counter.$": "States.MathAdd($.counter, 1)",
            "results.$": "$.results",
            "processResult.$": "$.processResult"
          },
          End: true
        }
      }
    })
  ));

  // ── 14. InitializeVariable types (Azure → AWS) ──────────────────────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        Init_String: {
          type: "InitializeVariable",
          inputs: { variables: [{ name: "statusMessage", type: "String", value: "pending" }] },
          runAfter: {}
        },
        Init_Boolean: {
          type: "InitializeVariable",
          inputs: { variables: [{ name: "isProcessed", type: "Boolean", value: false }] },
          runAfter: { Init_String: ["Succeeded"] }
        },
        Init_Float: {
          type: "InitializeVariable",
          inputs: { variables: [{ name: "totalAmount", type: "Float", value: 0.0 }] },
          runAfter: { Init_Boolean: ["Succeeded"] }
        },
        DoWork: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/WorkFn" }, body: "@triggerBody()" },
          runAfter: { Init_Float: ["Succeeded"] }
        }
      }
    }),
    j({
      StartAt: "InitializeState",
      States: {
        InitializeState: {
          Type: "Pass",
          Parameters: {
            statusMessage: "pending",
            isProcessed: false,
            totalAmount: 0.0,
            "originalInput.$": "$"
          },
          Next: "DoWork"
        },
        DoWork: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "WorkFn", "Payload.$": "$" },
          End: true
        }
      }
    })
  ));

  // ── 15. SetVariable then use in action (Azure → AWS) ────────────────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        Init_Status: {
          type: "InitializeVariable",
          inputs: { variables: [{ name: "orderStatus", type: "String", value: "new" }] },
          runAfter: {}
        },
        ProcessOrder: {
          type: "Function",
          inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ProcessFn" }, body: "@triggerBody()" },
          runAfter: { Init_Status: ["Succeeded"] }
        },
        Set_Status_Processed: {
          type: "SetVariable",
          inputs: { name: "orderStatus", value: "processed" },
          runAfter: { ProcessOrder: ["Succeeded"] }
        },
        SendConfirmation: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['servicebus']['connectionId']" } },
            method: "post",
            path: "/@{encodeURIComponent('OrderTopic')}/messages",
            body: { ContentData: "@{base64(variables('orderStatus'))}" }
          },
          runAfter: { Set_Status_Processed: ["Succeeded"] }
        }
      }
    }),
    j({
      StartAt: "InitStatus",
      States: {
        InitStatus: {
          Type: "Pass",
          Parameters: { orderStatus: "new", "input.$": "$" },
          Next: "ProcessOrder"
        },
        ProcessOrder: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ProcessFn", "Payload.$": "$" },
          ResultPath: "$.processResult",
          Next: "UpdateStatus"
        },
        UpdateStatus: {
          Type: "Pass",
          Parameters: { orderStatus: "processed", "input.$": "$.input", "processResult.$": "$.processResult" },
          Next: "SendConfirmation"
        },
        SendConfirmation: {
          Type: "Task",
          Resource: "arn:aws:states:::sqs:sendMessage",
          Parameters: {
            QueueUrl: "https://sqs.us-east-1.amazonaws.com/123456789012/OrderTopic",
            "MessageBody.$": "$.orderStatus"
          },
          End: true
        }
      }
    })
  ));

  // ── 16. Nested field access – deep path expressions ──────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "UseDeepPath",
      States: {
        UseDeepPath: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: {
            FunctionName: "DeepPathFn",
            Payload: {
              "city.$":    "$.customer.address.city",
              "zipcode.$": "$.customer.address.zipcode",
              "tier.$":    "$.customer.subscription.tier"
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
        UseDeepPath: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/DeepPathFn" },
            body: {
              city:    "@triggerBody()?['customer']?['address']?['city']",
              zipcode: "@triggerBody()?['customer']?['address']?['zipcode']",
              tier:    "@triggerBody()?['customer']?['subscription']?['tier']"
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 17. Map item context variables – $$.Map.Item.Index/Value ─────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "ProcessIndexed",
      States: {
        ProcessIndexed: {
          Type: "Map",
          ItemsPath: "$.items",
          ItemSelector: {
            "index.$": "$$.Map.Item.Index",
            "value.$": "$$.Map.Item.Value",
            "total.$": "States.ArrayLength($.items)"
          },
          ItemProcessor: {
            ProcessorConfig: { Mode: "INLINE" },
            StartAt: "ProcessItem",
            States: {
              ProcessItem: {
                Type: "Task",
                Resource: "arn:aws:states:::lambda:invoke",
                Parameters: { FunctionName: "IndexedProcessFn", "Payload.$": "$" },
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
        ProcessIndexed: {
          type: "Foreach",
          foreach: "@triggerBody()?['items']",
          actions: {
            ProcessItem: {
              type: "Function",
              inputs: {
                function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/IndexedProcessFn" },
                body: {
                  index: "@indexOf(triggerBody()?['items'], items('ProcessIndexed'))",
                  value: "@items('ProcessIndexed')",
                  total: "@length(triggerBody()?['items'])"
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

  return pairs;
}
