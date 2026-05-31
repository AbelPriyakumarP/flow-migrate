/**
 * Section 30 – Extended intrinsic functions
 *
 * AWS Step Functions intrinsic functions not covered in earlier sections:
 *   States.UUID()             → @guid()
 *   States.Base64Encode(x)    → @base64(x)
 *   States.Base64Decode(x)    → @base64ToString(x)
 *   States.StringSplit(s,d)   → @split(s,d)
 *   States.ArrayUnique(a)     → @union(a) / @intersection(a) pattern
 *   States.ArrayContains(a,x) → @contains(a,x)
 *   States.ArrayLength(a)     → @length(a)
 *   States.MathRandom(lo,hi)  → @rand() scaled
 *   States.MathAdd(a,b)       → @add(a,b)
 *   States.StringToJson(s)    → type: "ParseJson"
 *   States.JsonToString(o)    → @string(o)
 *
 * References:
 *   https://docs.aws.amazon.com/step-functions/latest/dg/intrinsic-functions.html
 *   https://learn.microsoft.com/en-us/azure/logic-apps/workflow-definition-language-functions-reference
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

export function intrinsicFunctionExtendedPairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // ── States.UUID → @guid() ─────────────────────────────────────────────────
  const uuidCases: [string, string][] = [
    ["GenerateOrderId",  "ProcessOrder"],
    ["GenerateRequestId","RouteRequest"],
    ["GenerateTraceId",  "TraceExecution"],
    ["GenerateEventId",  "PublishEvent"],
    ["GenerateSessionId","StartSession"],
  ];

  for (const [name, next] of uuidCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Pass",
            Parameters: {
              "correlationId.$": "States.UUID()",
              "payload.$": "$"
            },
            ResultPath: "$",
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
            type: "Compose",
            inputs: {
              correlationId: "@guid()",
              payload: "@triggerBody()"
            },
            runAfter: {}
          },
          [next]: {
            type: "Function",
            inputs: {
              function: { id: `/sub/rg/app/functions/${next}Fn` },
              body: `@outputs('${name}')`
            },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── States.Base64Encode → @base64() ──────────────────────────────────────
  const base64EncodeCases: [string, string, string][] = [
    ["EncodePayload",    "token",    "SendEncoded"],
    ["EncodeCredentials","credentials","TransmitCreds"],
    ["EncodeDocument",  "content",  "StoreEncoded"],
    ["EncodeConfig",    "configData","ApplyConfig"],
  ];

  for (const [name, field, next] of base64EncodeCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Pass",
            Parameters: {
              [`encoded${field.charAt(0).toUpperCase() + field.slice(1)}.$`]: `States.Base64Encode($.${field})`,
              "original.$": "$"
            },
            ResultPath: "$",
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
            type: "Compose",
            inputs: {
              [`encoded${field.charAt(0).toUpperCase() + field.slice(1)}`]: `@base64(triggerBody()?['${field}'])`,
              original: "@triggerBody()"
            },
            runAfter: {}
          },
          [next]: {
            type: "Function",
            inputs: {
              function: { id: `/sub/rg/app/functions/${next}Fn` },
              body: `@outputs('${name}')`
            },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── States.Base64Decode → @base64ToString() ───────────────────────────────
  const base64DecodeCases: [string, string, string][] = [
    ["DecodeJWTPayload",  "jwtToken",   "ValidateDecoded"],
    ["DecodeFileContent", "fileData",   "ProcessDecoded"],
    ["DecodeApiResponse", "encodedBody","ParseResponse"],
  ];

  for (const [name, field, next] of base64DecodeCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Pass",
            Parameters: {
              "decodedContent.$": `States.Base64Decode($.${field})`,
              "raw.$": "$"
            },
            ResultPath: "$",
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
            type: "Compose",
            inputs: {
              decodedContent: `@base64ToString(triggerBody()?['${field}'])`,
              raw: "@triggerBody()"
            },
            runAfter: {}
          },
          [next]: {
            type: "Function",
            inputs: {
              function: { id: `/sub/rg/app/functions/${next}Fn` },
              body: `@outputs('${name}')`
            },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── States.StringSplit → @split() ─────────────────────────────────────────
  const stringSplitCases: [string, string, string, string][] = [
    ["SplitCSVLine",   "csvRow",   ",",  "ProcessFields"],
    ["SplitPathParts", "filePath", "/",  "RouteByFolder"],
    ["SplitTagList",   "tags",     ";",  "ProcessTags"],
    ["SplitEmailDomain","email",   "@",  "RouteByDomain"],
    ["SplitVersionStr","version",  ".",  "CheckMajorVersion"],
  ];

  for (const [name, field, delimiter, next] of stringSplitCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Pass",
            Parameters: {
              "parts.$": `States.StringSplit($.${field}, '${delimiter}')`,
              "source.$": "$"
            },
            ResultPath: "$",
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
            type: "Compose",
            inputs: {
              parts: `@split(triggerBody()?['${field}'], '${delimiter}')`,
              source: "@triggerBody()"
            },
            runAfter: {}
          },
          [next]: {
            type: "Function",
            inputs: {
              function: { id: `/sub/rg/app/functions/${next}Fn` },
              body: `@outputs('${name}')`
            },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── States.ArrayUnique → @union() ────────────────────────────────────────
  const arrayUniqueCases: [string, string, string][] = [
    ["DeduplicateTags",     "tags",     "StoreTags"],
    ["DeduplicateUserIds",  "userIds",  "NotifyUsers"],
    ["DeduplicateEvents",   "eventIds", "ProcessEvents"],
    ["DeduplicateCategories","categories","IndexCategories"],
  ];

  for (const [name, field, next] of arrayUniqueCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Pass",
            Parameters: {
              "uniqueItems.$": `States.ArrayUnique($.${field})`,
              "source.$": "$"
            },
            ResultPath: "$",
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
            type: "Compose",
            inputs: {
              // Azure: @union() deduplicates when given the same array twice
              uniqueItems: `@union(triggerBody()?['${field}'], triggerBody()?['${field}'])`,
              source: "@triggerBody()"
            },
            runAfter: {}
          },
          [next]: {
            type: "Function",
            inputs: {
              function: { id: `/sub/rg/app/functions/${next}Fn` },
              body: `@outputs('${name}')`
            },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── States.ArrayContains → @contains() ───────────────────────────────────
  const arrayContainsCases: [string, string, string, string][] = [
    ["CheckRoleAccess",    "roles",       "admin",    "AdminRoute"],
    ["CheckFeatureFlag",   "enabledFlags","betaUser", "BetaRoute"],
    ["CheckPermission",    "permissions", "write",    "WriteRoute"],
    ["CheckSupportedLang", "languages",   "en",       "EnglishRoute"],
  ];

  for (const [name, arrayField, searchVal, next] of arrayContainsCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Choice",
            Choices: [{
              Variable: `$.${arrayField}`,
              StringMatches: `*${searchVal}*`,
              Next: next
            }],
            Default: "DefaultRoute"
          },
          [next]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${next}Fn`, "Payload.$": "$" },
            End: true
          },
          DefaultRoute: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: "DefaultRouteFn", "Payload.$": "$" },
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
            type: "If",
            expression: { and: [{ contains: [`@triggerBody()?['${arrayField}']`, searchVal] }] },
            actions: {
              [next]: {
                type: "Function",
                inputs: {
                  function: { id: `/sub/rg/app/functions/${next}Fn` },
                  body: "@triggerBody()"
                },
                runAfter: {}
              }
            },
            else: {
              actions: {
                DefaultRoute: {
                  type: "Function",
                  inputs: {
                    function: { id: "/sub/rg/app/functions/DefaultRouteFn" },
                    body: "@triggerBody()"
                  },
                  runAfter: {}
                }
              }
            },
            runAfter: {}
          }
        }
      })
    ));
  }

  // ── States.ArrayLength → @length() ───────────────────────────────────────
  const arrayLengthCases: [string, string, number, string, string][] = [
    ["CheckItemCount",   "items",   0,  "EmptyItems",    "ProcessItems"],
    ["CheckUserCount",   "users",   10, "SmallBatch",    "LargeBatch"],
    ["CheckErrorCount",  "errors",  1,  "NoErrors",      "HandleErrors"],
    ["CheckResultCount", "results", 100,"NormalResults", "PaginateResults"],
  ];

  for (const [name, field, threshold, trueNext, falseNext] of arrayLengthCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Choice",
            Choices: [{
              Variable: `$.${field}`,
              IsPresent: true,
              Next: trueNext
            }],
            Default: falseNext
          },
          [trueNext]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${trueNext}Fn`, "Payload.$": "$" },
            End: true
          },
          [falseNext]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${falseNext}Fn`, "Payload.$": "$" },
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
            type: "If",
            expression: { and: [{ greater: [`@length(triggerBody()?['${field}'])`, threshold] }] },
            actions: {
              [trueNext]: {
                type: "Function",
                inputs: {
                  function: { id: `/sub/rg/app/functions/${trueNext}Fn` },
                  body: "@triggerBody()"
                },
                runAfter: {}
              }
            },
            else: {
              actions: {
                [falseNext]: {
                  type: "Function",
                  inputs: {
                    function: { id: `/sub/rg/app/functions/${falseNext}Fn` },
                    body: "@triggerBody()"
                  },
                  runAfter: {}
                }
              }
            },
            runAfter: {}
          }
        }
      })
    ));
  }

  // ── States.MathAdd → @add() ──────────────────────────────────────────────
  const mathAddCases: [string, string, string, number, string][] = [
    ["IncrementCounter",   "counter",  "retryCount", 1,    "RetryOrFail"],
    ["AddProcessingFee",   "amount",   "fee",        100,  "ChargeCustomer"],
    ["BumpVersion",        "patchNum", "patch",      1,    "PublishVersion"],
    ["AccumulateScore",    "score",    "bonus",      10,   "CheckHighScore"],
  ];

  for (const [name, resultField, sourceField, addVal, next] of mathAddCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Pass",
            Parameters: {
              [`${resultField}.$`]: `States.MathAdd($.${sourceField}, ${addVal})`,
              "context.$": "$"
            },
            ResultPath: "$",
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
            type: "Compose",
            inputs: {
              [resultField]: `@add(triggerBody()?['${sourceField}'], ${addVal})`,
              context: "@triggerBody()"
            },
            runAfter: {}
          },
          [next]: {
            type: "Function",
            inputs: {
              function: { id: `/sub/rg/app/functions/${next}Fn` },
              body: `@outputs('${name}')`
            },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── States.StringToJson + States.JsonToString ─────────────────────────────
  const jsonStringCases: [string, "encode" | "decode", string, string][] = [
    ["ParseConfigString",  "decode", "configJson",    "ApplyConfig"],
    ["ParseEventPayload",  "decode", "eventPayload",  "RouteEvent"],
    ["SerializeForStorage","encode", "workflowState", "StoreState"],
    ["SerializeForQueue",  "encode", "messageBody",   "SendToQueue"],
  ];

  for (const [name, direction, field, next] of jsonStringCases) {
    if (direction === "decode") {
      // States.StringToJson → Azure ParseJson
      pairs.push(pair("aws-to-azure",
        j({
          StartAt: name,
          States: {
            [name]: {
              Type: "Pass",
              Parameters: {
                [`parsed.$`]: `States.StringToJson($.${field})`,
                "raw.$": "$"
              },
              ResultPath: "$",
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
              type: "ParseJson",
              inputs: {
                content: `@triggerBody()?['${field}']`,
                schema: { type: "object" }
              },
              runAfter: {}
            },
            [next]: {
              type: "Function",
              inputs: {
                function: { id: `/sub/rg/app/functions/${next}Fn` },
                body: `@body('${name}')`
              },
              runAfter: { [name]: ["Succeeded"] }
            }
          }
        })
      ));
    } else {
      // States.JsonToString → Azure @string()
      pairs.push(pair("aws-to-azure",
        j({
          StartAt: name,
          States: {
            [name]: {
              Type: "Pass",
              Parameters: {
                "serialized.$": `States.JsonToString($.${field})`,
                "source.$": "$"
              },
              ResultPath: "$",
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
              type: "Compose",
              inputs: {
                serialized: `@string(triggerBody()?['${field}'])`,
                source: "@triggerBody()"
              },
              runAfter: {}
            },
            [next]: {
              type: "Function",
              inputs: {
                function: { id: `/sub/rg/app/functions/${next}Fn` },
                body: `@outputs('${name}')`
              },
              runAfter: { [name]: ["Succeeded"] }
            }
          }
        })
      ));
    }
  }

  // ── States.Format → concat / format ──────────────────────────────────────
  const formatCases: [string, string, string, string][] = [
    ["BuildS3Key",     "s3://bucket/{}/{}", ["userId", "filename"], "UploadFile"],
    ["BuildArn",       "arn:aws:sns:us-east-1:{}:{}",  ["accountId","topicName"], "PublishToTopic"],
    ["BuildMessage",   "Hello {}, your order {} is ready", ["name","orderId"],    "SendNotification"],
    ["BuildLogPrefix", "[{}] Service:{} -", ["traceId","serviceName"],            "WriteLog"],
  ] as unknown as [string, string, string, string][];

  const rawFormatCases: [string, string, string[], string][] = [
    ["BuildS3Key",     "s3://bucket/{}/{}", ["userId", "filename"], "UploadFile"],
    ["BuildArn",       "arn:aws:sns:us-east-1:{}:{}", ["accountId", "topicName"], "PublishToTopic"],
    ["BuildMessage",   "Hello {}, your order {} is ready", ["name", "orderId"], "SendNotification"],
    ["BuildLogPrefix", "[{}] Service:{} -", ["traceId", "serviceName"], "WriteLog"],
  ];

  for (const [name, template, fields, next] of rawFormatCases) {
    const fmtArgs = fields.map(f => `$.${f}`).join(", ");
    const azureConcat = fields.reduce((tpl, f) =>
      tpl.replace("{}", `', triggerBody()?['${f}'], '`), template);

    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Pass",
            Parameters: {
              "formatted.$": `States.Format('${template}', ${fmtArgs})`,
              "context.$": "$"
            },
            ResultPath: "$",
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
            type: "Compose",
            inputs: {
              formatted: `@concat('${azureConcat}')`,
              context: "@triggerBody()"
            },
            runAfter: {}
          },
          [next]: {
            type: "Function",
            inputs: {
              function: { id: `/sub/rg/app/functions/${next}Fn` },
              body: `@outputs('${name}')`
            },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── States.ArrayGetItem + States.ArrayRange ───────────────────────────────
  const arrayGetCases: [string, string, number, string][] = [
    ["GetFirstItem",  "items",  0,  "ProcessFirst"],
    ["GetLastResult", "results",-1, "HandleLast"],
    ["GetSecondUser", "users",  1,  "NotifySecond"],
  ];

  for (const [name, field, index, next] of arrayGetCases) {
    const azureIndex = index < 0
      ? `@last(triggerBody()?['${field}'])`
      : `@triggerBody()?['${field}'][${index}]`;

    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Pass",
            Parameters: {
              "item.$": `States.ArrayGetItem($.${field}, ${index})`,
              "source.$": "$"
            },
            ResultPath: "$",
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
            type: "Compose",
            inputs: {
              item: azureIndex,
              source: "@triggerBody()"
            },
            runAfter: {}
          },
          [next]: {
            type: "Function",
            inputs: {
              function: { id: `/sub/rg/app/functions/${next}Fn` },
              body: `@outputs('${name}')`
            },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  return pairs;
}
