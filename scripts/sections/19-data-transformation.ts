/**
 * Section 19 – Data transformation patterns:
 *   AWS intrinsic functions, ResultSelector, Parameters reshaping,
 *   States.Format, States.StringToJson, States.JsonToString,
 *   States.Array, States.MathAdd, context object usage
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

export function dataTransformationPairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // ── States.Format string interpolation ───────────────────────────────────
  const formatCases: [string, string, string[], string][] = [
    ["BuildS3Key",    "data/{}/{}.json",           ["$.userId", "$.timestamp"],    "UploadToS3"],
    ["BuildMessage",  "Order {} has been {}",      ["$.orderId", "$.status"],      "SendNotification"],
    ["BuildLogEntry", "[{}] {} - {}",              ["$.timestamp", "$.level", "$.message"], "WriteLog"],
    ["BuildUrl",      "https://api.example.com/{}/{}", ["$.version", "$.resource"], "CallAPI"],
    ["BuildKey",      "tenant/{}/user/{}/data",    ["$.tenantId", "$.userId"],     "StoreData"],
    ["BuildFileName", "report-{}-{}.csv",          ["$.reportDate", "$.reportId"], "SaveReport"],
    ["BuildQueueMsg", "TASK:{} STATUS:{} TS:{}",   ["$.taskId", "$.status", "$.ts"], "QueueMessage"],
    ["BuildSubject",  "Alert: {} in {} at {}",     ["$.alertType", "$.region", "$.time"], "SendAlert"],
  ];

  for (const [name, template, vars, nextFn] of formatCases) {
    const formatArgs = vars.map(v => `"${v}"`).join(", ");
    const azureExpr = template.replace(/\{\}/g, () => {
      const v = vars.shift() || "";
      return `@{triggerBody()?['${v.replace("$.", "")}']}`;
    });
    // Reset vars for AWS usage
    const awsArgs = formatCases.find(([n]) => n === name)?.[2] || vars;

    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Pass",
            Parameters: {
              [`formattedValue.$`]: `States.Format('${template}', ${awsArgs.join(", ")})`
            },
            ResultPath: "$.formatted",
            Next: nextFn
          },
          [nextFn]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${nextFn}Fn`, "Payload.$": "$" },
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
            inputs: { formattedValue: `@concat('${template.split("{}").join("', '")}'.split(', '))` },
            runAfter: {}
          },
          [nextFn]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${nextFn}Fn` }, body: "@triggerBody()" },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── ResultSelector reshaping ─────────────────────────────────────────────
  const resultSelectorCases: [string, Record<string, string>, string][] = [
    ["GetUserDetails",   { "userId.$": "$.Payload.id", "email.$": "$.Payload.email", "name.$": "$.Payload.displayName" }, "ProcessUser"],
    ["FetchConfig",      { "maxRetries.$": "$.Payload.config.retries", "timeout.$": "$.Payload.config.timeoutSecs" }, "ApplyConfig"],
    ["CallExternalAPI",  { "statusCode.$": "$.StatusCode", "responseBody.$": "$.Payload.body", "headers.$": "$.Payload.headers" }, "HandleResponse"],
    ["QueryDatabase",    { "records.$": "$.Payload.Items", "count.$": "$.Payload.Count", "hasMore.$": "$.Payload.hasMore" }, "ProcessRecords"],
    ["GetJobStatus",     { "jobId.$": "$.Payload.jobId", "status.$": "$.Payload.status", "progress.$": "$.Payload.progress" }, "CheckDone"],
    ["FetchMetrics",     { "cpu.$": "$.Payload.metrics.cpu", "memory.$": "$.Payload.metrics.memory" }, "StoreMetrics"],
  ];

  for (const [name, selector, nextFn] of resultSelectorCases) {
    const azureBody: Record<string, string> = {};
    for (const [k, v] of Object.entries(selector)) {
      const cleanKey = k.replace(".$", "");
      const cleanVal = v.replace("$.Payload.", "@body('" + name + "')?['").replace("$.", "@body('" + name + "')?['").replace(/\./g, "']?['");
      azureBody[cleanKey] = cleanVal.endsWith("']") ? cleanVal : cleanVal + "']";
    }

    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${name}Fn`, "Payload.$": "$" },
            ResultSelector: selector,
            ResultPath: "$.taskResult",
            Next: nextFn
          },
          [nextFn]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${nextFn}Fn`, "Payload.$": "$" },
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
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${name}Fn` }, body: "@triggerBody()" },
            runAfter: {}
          },
          [`Reshape_${name}`]: {
            type: "Compose",
            inputs: azureBody,
            runAfter: { [name]: ["Succeeded"] }
          },
          [nextFn]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${nextFn}Fn` }, body: `@outputs('Reshape_${name}')` },
            runAfter: { [`Reshape_${name}`]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── States.StringToJson / States.JsonToString ────────────────────────────
  const jsonConvertCases: [string, "toJson" | "toString", string, string][] = [
    ["ParseEventPayload",   "toJson",   "$.rawPayload",   "HandleEvent"],
    ["ParseConfigString",   "toJson",   "$.configString", "ApplyConfig"],
    ["ParseQueryResult",    "toJson",   "$.resultString", "ProcessResult"],
    ["SerializeForQueue",   "toString", "$.objectData",   "EnqueueMessage"],
    ["SerializeForLog",     "toString", "$.logObject",    "WriteToLog"],
    ["SerializeForStorage", "toString", "$.payload",      "StoreBlob"],
  ];

  for (const [name, direction, inputPath, nextFn] of jsonConvertCases) {
    const isToJson = direction === "toJson";
    const fieldName = inputPath.replace("$.", "");

    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Pass",
            Parameters: {
              [`converted.$`]: isToJson
                ? `States.StringToJson(${inputPath})`
                : `States.JsonToString(${inputPath})`
            },
            ResultPath: "$.converted",
            Next: nextFn
          },
          [nextFn]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${nextFn}Fn`, "Payload.$": "$" },
            End: true
          }
        }
      }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [name]: isToJson
            ? {
                type: "ParseJson",
                inputs: {
                  content: `@triggerBody()?['${fieldName}']`,
                  schema: { type: "object" }
                },
                runAfter: {}
              }
            : {
                type: "Compose",
                inputs: { converted: `@string(triggerBody()?['${fieldName}'])` },
                runAfter: {}
              },
          [nextFn]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${nextFn}Fn` }, body: "@triggerBody()" },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── States.Array and States.MathAdd ──────────────────────────────────────
  const mathOpCases: [string, string, string, number, string][] = [
    ["IncrementPageIndex",  "$.page",        "$.pageSize", 1, "FetchNextPage"],
    ["AddItemToTotal",      "$.runningTotal","$.itemPrice",1, "UpdateTotal"],
    ["CalculateOffset",     "$.offset",      "$.limit",    1, "FetchWithOffset"],
    ["BumpVersion",         "$.version",     "$.patch",    1, "TagRelease"],
    ["AccumulateScore",     "$.score",       "$.points",   1, "UpdateLeaderboard"],
  ];

  for (const [name, acc, addend, factor, nextFn] of mathOpCases) {
    const accField = acc.replace("$.", "");
    const addField = addend.replace("$.", "");

    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Pass",
            Parameters: {
              [`newValue.$`]: `States.MathAdd(${acc}, ${addend})`
            },
            ResultPath: "$.computed",
            Next: nextFn
          },
          [nextFn]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${nextFn}Fn`, "Payload.$": "$" },
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
            inputs: { newValue: `@add(triggerBody()?['${accField}'], triggerBody()?['${addField}'])` },
            runAfter: {}
          },
          [nextFn]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${nextFn}Fn` }, body: "@triggerBody()" },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── Context object ($$.Execution, $$.Task.Token) ──────────────────────────
  const contextCases: [string, Record<string, string>, string][] = [
    ["StampWithExecutionId",   { "executionId.$": "$$.Execution.Id", "startTime.$": "$$.Execution.StartTime" }, "LogExecution"],
    ["InjectExecutionName",    { "workflowName.$": "$$.Execution.Name", "input.$": "$" }, "TraceRequest"],
    ["TagWithStateMachine",    { "stateMachineArn.$": "$$.StateMachine.Id", "data.$": "$" }, "AuditState"],
    ["ExtractTaskToken",       { "taskToken.$": "$$.Task.Token", "input.$": "$" }, "SendCallbackUrl"],
    ["BuildTraceContext",      { "executionId.$": "$$.Execution.Id", "executionName.$": "$$.Execution.Name", "startedAt.$": "$$.Execution.StartTime" }, "StartTrace"],
  ];

  for (const [name, params, nextFn] of contextCases) {
    const azureInputs: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
      const cleanKey = k.replace(".$", "");
      if (v.startsWith("$$.Execution.Id")) {
        azureInputs[cleanKey] = "@{workflow().run.name}";
      } else if (v.startsWith("$$.Execution.StartTime")) {
        azureInputs[cleanKey] = "@{workflow().run.startTime}";
      } else if (v.startsWith("$$.Execution.Name")) {
        azureInputs[cleanKey] = "@{workflow().name}";
      } else if (v.startsWith("$$.StateMachine.Id")) {
        azureInputs[cleanKey] = "@{workflow().id}";
      } else if (v.startsWith("$$.Task.Token")) {
        azureInputs[cleanKey] = "@{workflow().run.name}-callback";
      } else if (v === "$") {
        azureInputs[cleanKey] = "@triggerBody()";
      } else {
        azureInputs[cleanKey] = v;
      }
    }

    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Pass",
            Parameters: params,
            Next: nextFn
          },
          [nextFn]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${nextFn}Fn`, "Payload.$": "$" },
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
            inputs: azureInputs,
            runAfter: {}
          },
          [nextFn]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${nextFn}Fn` }, body: `@outputs('${name}')` },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── InputPath / OutputPath patterns ──────────────────────────────────────
  const ioPathCases: [string, string, string, string][] = [
    ["ProcessOrder",     "$.order",        "$.result",    "SaveResult"],
    ["ValidateProfile",  "$.userProfile",  "$.validation","ApplyValidation"],
    ["TransformPayment", "$.payment",      "$.transformed","StorePayment"],
    ["ExtractAddress",   "$.customer.address","$.cleanAddress","ValidateAddress"],
    ["FilterMetadata",   "$.eventMetadata","$.normalized", "IndexEvent"],
    ["SliceConfig",      "$.config.network","$.networkConfig","ApplyNetworkConfig"],
  ];

  for (const [name, inputPath, outputPath, nextFn] of ioPathCases) {
    const inputField = inputPath.replace("$.", "").split(".").map(s => `['${s}']`).join("?");
    const outputField = outputPath.replace("$.", "");

    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${name}Fn`, "Payload.$": "$" },
            InputPath: inputPath,
            OutputPath: outputPath,
            Next: nextFn
          },
          [nextFn]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${nextFn}Fn`, "Payload.$": "$" },
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
            type: "Function",
            inputs: {
              function: { id: `/sub/rg/app/functions/${name}Fn` },
              body: `@triggerBody()?${inputField}`
            },
            runAfter: {}
          },
          [nextFn]: {
            type: "Function",
            inputs: {
              function: { id: `/sub/rg/app/functions/${nextFn}Fn` },
              body: `@body('${name}')?['${outputField}']`
            },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── ResultPath → null (discard output, keep original input) ──────────────
  const resultPathNullCases: [string, string][] = [
    ["SendAlert",      "ContinueAfterAlert"],
    ["LogEvent",       "ContinueAfterLog"],
    ["AuditAccess",    "ProceedAfterAudit"],
    ["RecordMetric",   "ContinueAfterMetric"],
    ["EmitHeartbeat",  "ContinueAfterHeartbeat"],
    ["TraceRequest",   "ContinueAfterTrace"],
  ];

  for (const [name, nextFn] of resultPathNullCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${name}Fn`, "Payload.$": "$" },
            ResultPath: null,
            Next: nextFn
          },
          [nextFn]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${nextFn}Fn`, "Payload.$": "$" },
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
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${name}Fn` }, body: "@triggerBody()" },
            runAfter: {}
          },
          [nextFn]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${nextFn}Fn` }, body: "@triggerBody()" },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  return pairs;
}
