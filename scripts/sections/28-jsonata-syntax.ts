/**
 * Section 28 – JSONata query language (new AWS Step Functions 2024 syntax)
 *
 * AWS added JSONata as an alternative to JSONPath. When QueryLanguage is "JSONata":
 *   - Parameters block is replaced by Arguments block
 *   - Field references use {% expression %} syntax
 *   - $states.input  replaces $  (input data)
 *   - $states.context replaces $$ (context object)
 *   - $states.result  is the task output
 *   - $states.errorOutput is the caught error
 *
 * Azure WDL uses the same @expression() syntax regardless of AWS query language.
 * Reference: https://docs.aws.amazon.com/step-functions/latest/dg/transforming-data.html
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

export function jsonataSyntaxPairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // ── JSONata Lambda invocations ────────────────────────────────────────────
  const jsonataLambdaCases: [string, Record<string, string>, string][] = [
    ["InvokeLambdaJsonata",
      { userId: "{% $states.input.userId %}", action: "{% $states.input.action %}", ts: "{% $now() %}" },
      "ProcessResult"],
    ["CallProcessorJsonata",
      { orderId: "{% $states.input.orderId %}", amount: "{% $states.input.amount %}", currency: "{% $states.input.currency %}" },
      "HandleProcessed"],
    ["EnrichRecordJsonata",
      { recordId: "{% $states.input.id %}", data: "{% $states.input %}", executionId: "{% $states.context.Execution.Id %}" },
      "StoreEnriched"],
    ["ValidatePayloadJsonata",
      { payload: "{% $states.input %}", schema: "{% $states.input.schemaVersion %}", requestId: "{% $states.context.Execution.Name %}" },
      "ApplyValidation"],
    ["TransformDataJsonata",
      { source: "{% $states.input.source %}", target: "{% $states.input.target %}", transform: "{% $states.input.transformType %}" },
      "StoreTransformed"],
    ["AuthCheckJsonata",
      { token: "{% $states.input.authToken %}", resource: "{% $states.input.resource %}", method: "{% $states.input.method %}" },
      "AuthorizeRequest"],
    ["PublishEventJsonata",
      { eventType: "{% $states.input.type %}", payload: "{% $states.input.data %}", version: "{% $states.input.version %}" },
      "ConfirmPublished"],
    ["ComputeScoreJsonata",
      { features: "{% $states.input.features %}", model: "{% $states.input.modelId %}", threshold: "{% $states.input.threshold %}" },
      "EvaluateScore"],
  ];

  for (const [name, argsMap, nextFn] of jsonataLambdaCases) {
    // Build Azure inputs from JSONata expressions
    const azureBody: Record<string, string> = {};
    for (const [k, v] of Object.entries(argsMap)) {
      if (v.includes("$states.input.")) {
        const field = v.replace("{% $states.input.", "").replace(" %}", "").replace(".", "']?['");
        azureBody[k] = `@triggerBody()?['${field}']`;
      } else if (v.includes("$states.context.Execution.Id")) {
        azureBody[k] = "@{workflow().run.name}";
      } else if (v.includes("$states.context.Execution.Name")) {
        azureBody[k] = "@{workflow().name}";
      } else if (v.includes("$states.input %")) {
        azureBody[k] = "@triggerBody()";
      } else if (v.includes("$now()")) {
        azureBody[k] = "@utcNow()";
      } else {
        azureBody[k] = v;
      }
    }

    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            QueryLanguage: "JSONata",
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Arguments: { FunctionName: `${name}Fn`, Payload: argsMap },
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
            inputs: { function: { id: `/sub/rg/app/functions/${name}Fn` }, body: azureBody },
            runAfter: {}
          },
          [nextFn]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${nextFn}Fn` }, body: `@body('${name}')` },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── JSONata Output / Assign ───────────────────────────────────────────────
  const jsonataOutputCases: [string, string][] = [
    ["ExtractWithJsonata",   "UseExtracted"],
    ["ReshapeWithJsonata",   "UseReshaped"],
    ["FilterWithJsonata",    "UseFiltered"],
    ["MapFieldsWithJsonata", "UseMapped"],
    ["MergeWithJsonata",     "UseMerged"],
  ];

  for (const [name, nextFn] of jsonataOutputCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            QueryLanguage: "JSONata",
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Arguments: { FunctionName: `${name}Fn`, Payload: "{% $states.input %}" },
            Output: "{% $states.result.Payload %}",
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
            inputs: { function: { id: `/sub/rg/app/functions/${nextFn}Fn` }, body: `@body('${name}')` },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── JSONata Choice conditions ─────────────────────────────────────────────
  const jsonataChoiceCases: [string, string, string, string][] = [
    ["RouteByAmountJsonata",  "{% $states.input.amount > 1000 %}",           "HighValueRoute",  "StandardRoute"],
    ["CheckActiveJsonata",    "{% $states.input.status = 'active' %}",       "HandleActive",    "HandleInactive"],
    ["CheckNullJsonata",      "{% $exists($states.input.userId) %}",         "ProcessUser",     "CreateUser"],
    ["CheckArrayJsonata",     "{% $count($states.input.items) > 0 %}",       "ProcessItems",    "EmptyItems"],
    ["CheckRegexJsonata",     "{% $match($states.input.email, /.*@.+\\..+/) %}","ValidEmail",  "InvalidEmail"],
    ["CheckNestedJsonata",    "{% $states.input.user.role = 'admin' %}",     "AdminFlow",       "UserFlow"],
  ];

  for (const [name, condition, trueFn, falseFn] of jsonataChoiceCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            QueryLanguage: "JSONata",
            Type: "Choice",
            Choices: [{ Condition: condition, Next: trueFn }],
            Default: falseFn
          },
          [trueFn]: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${trueFn}Fn`, "Payload.$": "$" }, End: true },
          [falseFn]: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${falseFn}Fn`, "Payload.$": "$" }, End: true }
        }
      }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [name]: {
            type: "If",
            // Map JSONata condition to nearest Azure WDL equivalent
            expression: condition.includes("> 1000")
              ? { and: [{ greater: ["@triggerBody()?['amount']", 1000] }] }
              : condition.includes("= 'active'")
              ? { and: [{ equals: ["@triggerBody()?['status']", "active"] }] }
              : condition.includes("$exists")
              ? { and: [{ not: { equals: ["@triggerBody()?['userId']", null] } }] }
              : condition.includes("$count")
              ? { and: [{ greater: ["@length(triggerBody()?['items'])", 0] }] }
              : condition.includes("$match")
              ? { and: [{ not: { equals: ["@triggerBody()?['email']", null] } }] }
              : { and: [{ equals: ["@triggerBody()?['user']?['role']", "admin"] }] },
            actions: { [trueFn]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${trueFn}Fn` }, body: "@triggerBody()" }, runAfter: {} } },
            else: { actions: { [falseFn]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${falseFn}Fn` }, body: "@triggerBody()" }, runAfter: {} } } },
            runAfter: {}
          }
        }
      })
    ));
  }

  // ── JSONata with error handling (Catch using errorOutput) ─────────────────
  const jsonataCatchCases: [string, string][] = [
    ["RiskyOpJsonata",    "HandleJsonataError"],
    ["CallExternalJsonata","OnExternalFail"],
    ["WriteDBJsonata",    "OnDBFailJsonata"],
    ["PublishMsgJsonata", "OnPublishFail"],
  ];

  for (const [name, handler] of jsonataCatchCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            QueryLanguage: "JSONata",
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Arguments: { FunctionName: `${name}Fn`, Payload: "{% $states.input %}" },
            Catch: [{
              ErrorEquals: ["States.ALL"],
              Next: handler,
              Output: "{% { 'error': $states.errorOutput.Error, 'cause': $states.errorOutput.Cause, 'input': $states.input } %}"
            }],
            End: true
          },
          [handler]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${handler}Fn`, "Payload.$": "$" },
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
          [handler]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${handler}Fn` }, body: "@triggerBody()" },
            runAfter: { [name]: ["Failed", "TimedOut", "Skipped"] }
          }
        }
      })
    ));
  }

  return pairs;
}
