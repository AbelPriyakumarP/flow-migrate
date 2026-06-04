/**
 * Section 13 – Wait / Pass / Succeed / Fail variations (both directions)
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

export function waitPassSucceedFailVariationPairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // ── Wait Seconds variations ───────────────────────────────────────────────
  const waitSecondsCases: [number, string, string][] = [
    [5,    "ShortDelay",   "AfterShortDelay"],
    [10,   "TenSecWait",   "AfterTenSec"],
    [30,   "ThirtySecWait","AfterThirtySec"],
    [60,   "OneMinWait",   "AfterOneMin"],
    [120,  "TwoMinWait",   "AfterTwoMin"],
    [300,  "FiveMinWait",  "AfterFiveMin"],
    [600,  "TenMinWait",   "AfterTenMin"],
    [1800, "HalfHourWait", "AfterHalfHour"],
    [3600, "OneHourWait",  "AfterOneHour"],
    [86400,"OneDayWait",   "AfterOneDay"],
  ];

  for (const [secs, waitName, nextName] of waitSecondsCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: waitName,
        States: {
          [waitName]: { Type: "Wait", Seconds: secs, Next: nextName },
          [nextName]: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${nextName}Fn`, "Payload.$": "$" }, End: true }
        }
      }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [waitName]: { type: "Wait", inputs: { interval: { unit: "Second", count: secs } }, runAfter: {} },
          [nextName]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${nextName}Fn` }, body: "@triggerBody()" }, runAfter: { [waitName]: ["Succeeded"] } }
        }
      })
    ));
  }

  // ── Azure Wait interval → AWS Wait SecondsPath ────────────────────────────
  const azureWaitCases: [string, number, string, string][] = [
    ["Cooldown",     15,  "afterCooldown",  "CooldownNext"],
    ["BackoffWait",  45,  "backoffDelay",   "BackoffNext"],
    ["RateLimit",    2,   "rateLimitDelay", "RateLimitNext"],
  ];

  for (const [name, secs, expr, nextFn] of azureWaitCases) {
    pairs.push(pair("azure-to-aws",
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [name]: { type: "Wait", inputs: { interval: { unit: "Second", count: secs } }, runAfter: {} },
          [nextFn]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${nextFn}Fn` }, body: "@triggerBody()" }, runAfter: { [name]: ["Succeeded"] } }
        }
      }),
      j({
        StartAt: name,
        States: {
          [name]:  { Type: "Wait", Seconds: secs, Next: nextFn },
          [nextFn]:{ Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${nextFn}Fn`, "Payload.$": "$" }, End: true }
        }
      })
    ));
  }

  // ── Pass state with static result injection ───────────────────────────────
  const passStaticCases: [string, Record<string, unknown>, string][] = [
    ["SetDefaults",     { environment: "prod", region: "us-east-1", version: "2.0" },   "AfterDefaults"],
    ["InitContext",     { step: 0, status: "started", errors: [] },                      "AfterInit"],
    ["TagRequest",      { source: "api", priority: "high", retryable: true },            "AfterTag"],
    ["SetLocale",       { locale: "en-US", timezone: "America/New_York", currency: "USD" },"AfterLocale"],
    ["MarkProcessing",  { state: "processing", startedBy: "workflow" },                  "AfterMark"],
    ["SetMetadata",     { workflow: "order-processing", schemaVersion: 3 },              "AfterMetadata"],
    ["InjectHeaders",   { "x-request-id": "auto", "x-source": "step-functions" },       "AfterHeaders"],
    ["SetBatchConfig",  { batchSize: 100, parallelism: 5, timeout: 300 },               "AfterBatchConfig"],
  ];

  for (const [name, result, nextFn] of passStaticCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]:  { Type: "Pass", Parameters: { ...Object.fromEntries(Object.entries(result)), "originalInput.$": "$" }, Next: nextFn },
          [nextFn]:{ Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${nextFn}Fn`, "Payload.$": "$" }, End: true }
        }
      }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [name]: {
            type: "Compose",
            inputs: { ...result, originalInput: "@triggerBody()" },
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

  // ── Succeed state variations ──────────────────────────────────────────────
  const succeedCases: [string, string][] = [
    ["ProcessAndSucceed",   "AllGood"],
    ["ValidateAndFinish",   "ValidationPassed"],
    ["ExecuteAndComplete",  "ExecutionDone"],
    ["ReturnSuccess",       "SuccessTerminal"],
    ["MarkComplete",        "WorkflowComplete"],
  ];

  for (const [taskFn, succeedName] of succeedCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: taskFn,
        States: {
          [taskFn]:    { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${taskFn}Fn`, "Payload.$": "$" }, Next: succeedName },
          [succeedName]:{ Type: "Succeed" }
        }
      }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [taskFn]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${taskFn}Fn` }, body: "@triggerBody()" }, runAfter: {} },
          [succeedName]: { type: "Terminate", inputs: { runStatus: "Succeeded" }, runAfter: { [taskFn]: ["Succeeded"] } }
        }
      })
    ));
  }

  // ── Fail state variations (with Error and Cause) ──────────────────────────
  const failCases: [string, string, string][] = [
    ["InvalidInput",      "ValidationError",     "Input failed schema validation"],
    ["Unauthorized",      "AuthorizationError",  "User does not have required permissions"],
    ["ResourceNotFound",  "NotFoundError",       "The requested resource does not exist"],
    ["RateLimitExceeded", "ThrottlingError",     "API rate limit exceeded"],
    ["QuotaExceeded",     "QuotaError",          "Service quota has been exceeded"],
    ["ServiceUnavailable","ServiceError",        "Downstream service is unavailable"],
    ["DataCorrupted",     "DataIntegrityError",  "Data integrity check failed"],
    ["DuplicateRequest",  "IdempotencyError",    "This request has already been processed"],
  ];

  for (const [name, error, cause] of failCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: "Check",
        States: {
          Check: {
            Type: "Choice",
            Choices: [{ Variable: "$.valid", BooleanEquals: true, Next: "Continue" }],
            Default: name
          },
          Continue: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "ContinueFn", "Payload.$": "$" }, End: true },
          [name]: { Type: "Fail", Error: error, Cause: cause }
        }
      }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          Check: {
            type: "If",
            expression: { and: [{ equals: ["@triggerBody()?['valid']", true] }] },
            actions: { Continue: { type: "Function", inputs: { function: { id: "/sub/rg/app/functions/ContinueFn" }, body: "@triggerBody()" }, runAfter: {} } },
            else: {
              actions: {
                [name]: {
                  type: "Terminate",
                  inputs: { runStatus: "Failed", runError: { code: error, message: cause } },
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

  // ── Terminate Succeeded (Azure → AWS Succeed) ────────────────────────────
  const terminateSucceededCases: string[] = ["EndAfterSync","FinalStep","CompletePipeline","DoneWithWork","FinishSuccessfully"];
  for (const name of terminateSucceededCases) {
    pairs.push(pair("azure-to-aws",
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          DoWork: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/DoWorkFn` }, body: "@triggerBody()" }, runAfter: {} },
          [name]: { type: "Terminate", inputs: { runStatus: "Succeeded" }, runAfter: { DoWork: ["Succeeded"] } }
        }
      }),
      j({
        StartAt: "DoWork",
        States: {
          DoWork: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "DoWorkFn", "Payload.$": "$" }, Next: name },
          [name]: { Type: "Succeed" }
        }
      })
    ));
  }

  return pairs;
}
