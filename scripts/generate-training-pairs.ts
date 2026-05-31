/**
 * generate-training-pairs.ts
 *
 * Generates 1000+ JSONL training pairs for fine-tuning a workflow-migration model.
 * Every mapping is sourced from official documentation only:
 *   AWS Step Functions / ASL: https://docs.aws.amazon.com/step-functions/latest/dg/
 *   Azure Logic Apps WDL:     https://learn.microsoft.com/en-us/azure/logic-apps/
 *
 * Run:
 *   npx ts-node --skip-project scripts/generate-training-pairs.ts
 * Output:
 *   scripts/training-pairs.jsonl
 */

import { writeFileSync } from "fs";
import { join } from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  role: "system" | "user" | "model";
  content: string;
}

export interface TrainingPair {
  messages: Message[];
}

// ─── System Prompt ────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `You are an expert workflow migration assistant specialising in bidirectional
conversion between AWS Step Functions (Amazon States Language – ASL) and
Azure Logic Apps Workflow Definition Language (WDL).

CORE RULES – apply without exception:
1. Output ONLY valid JSON. No markdown, no prose, no code fences.
2. Preserve all business logic, branching, error-handling, and retry behaviour.
3. Use ONLY documented action/state types. Never invent types.
4. Map every construct to its closest documented equivalent.

AWS → AZURE MAPPING TABLE (authoritative):
  Task + lambda:invoke                          → type: "Function"
  Task + lambda:invoke.waitForTaskToken         → type: "ApiConnection" (webhook callback)
  Task + dynamodb:getItem/putItem/updateItem/deleteItem → type: "ApiConnection" (Cosmos DB)
  Task + sns:publish                            → type: "ApiConnection" (Service Bus / Event Grid)
  Task + sqs:sendMessage                        → type: "ApiConnection" (Service Bus)
  Task + events:putEvents                       → type: "ApiConnection" (Event Grid)
  Task + s3:getObject / putObject / listObjectsV2 → type: "ApiConnection" (Blob Storage)
  Task + ecs:runTask                            → type: "ApiConnection" (Container Instances)
  Task + glue:startJobRun                       → type: "ApiConnection" (Data Factory)
  Task + sagemaker:createTrainingJob            → type: "ApiConnection" (Azure ML)
  Task + states:startExecution                  → type: "Workflow"
  Task + http:invoke                            → type: "Http"
  Choice (2 branches)                           → type: "If"
  Choice (3+ branches same variable)            → type: "Switch"
  Parallel                                      → concurrent actions sharing runAfter, or Scope
  Map (pure data transform, no side-effects)    → type: "Select"
  Map (side-effects / API calls per item)       → type: "Foreach"
  Pass                                          → type: "Compose"
  Wait (Seconds / SecondsPath)                  → type: "Wait" with interval (ISO 8601)
  Wait (Timestamp / TimestampPath)              → type: "Wait" with until
  Succeed                                       → type: "Terminate" runStatus "Succeeded"
  Fail                                          → type: "Terminate" runStatus "Failed"

RETRY MAPPING (authoritative):
  AWS IntervalSeconds  → Azure retryPolicy.minimumInterval  (ISO 8601 e.g. "PT5S")
  AWS MaxAttempts      → Azure retryPolicy.count
  AWS BackoffRate > 1  → Azure retryPolicy.type "exponential", multiplier = BackoffRate
  AWS BackoffRate = 1  → Azure retryPolicy.type "fixed"
  AWS MaxAttempts = 0  → Azure retryPolicy.type "none"
  AWS MaxDelaySeconds  → Azure retryPolicy.maximumInterval  (ISO 8601)

CATCH / ERROR MAPPING (authoritative):
  States.ALL              → runAfter with ["Failed","TimedOut","Skipped"]
  States.Timeout          → runAfter with ["TimedOut"]
  States.TaskFailed       → runAfter with ["Failed"]
  States.HeartbeatTimeout → runAfter with ["TimedOut"]
  States.Permissions      → runAfter with ["Failed"]
  States.Runtime          → runAfter with ["Failed"]
  States.NoChoiceMatched  → Switch default branch or Terminate Failed

AZURE → AWS MAPPING TABLE (authoritative):
  type: "Function"       → Task + arn:aws:states:::lambda:invoke
  type: "Http"           → Task + arn:aws:states:::http:invoke
  type: "ApiConnection"  → Task + appropriate AWS SDK integration ARN
  type: "If"             → Choice state (2 branches)
  type: "Switch"         → Choice state (N branches)
  type: "Foreach"        → Map state (side-effects ItemProcessor)
  type: "Select"         → Map state (pure data transform Pass ItemProcessor)
  type: "Scope"          → Parallel state (or sequential group)
  type: "Compose"        → Pass state
  type: "ParseJson"      → Pass state with States.StringToJson Parameters
  type: "InitializeVariable" → Pass state (inject into initial context)
  type: "SetVariable"    → Pass state (ResultPath overwrite)
  type: "Terminate" runStatus "Succeeded" → Succeed state
  type: "Terminate" runStatus "Failed"    → Fail state
  type: "Wait" interval  → Wait state SecondsPath / Seconds
  type: "Wait" until     → Wait state TimestampPath / Timestamp

RUNAFTER → ASL SEQUENCING:
  runAfter: { A: ["Succeeded"] }                 → A.Next = current state
  runAfter: { A: ["Failed","TimedOut"] }          → Catch block on A, Next = current state
  runAfter: { A: ["Succeeded"], B: ["Succeeded"] }→ both A and B have Next here (fan-in via Pass)`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function pair(
  direction: "aws-to-azure" | "azure-to-aws",
  userContent: string,
  assistantContent: string
): TrainingPair {
  const dirLabel =
    direction === "aws-to-azure"
      ? "Convert this AWS Step Functions state machine to Azure Logic Apps Workflow Definition Language (WDL). Return ONLY valid JSON."
      : "Convert this Azure Logic Apps workflow to AWS Step Functions Amazon States Language (ASL). Return ONLY valid JSON.";

  return {
    messages: [
      { role: "system",  content: SYSTEM_PROMPT },
      { role: "user",    content: `${dirLabel}\n\n${userContent}` },
      { role: "model",   content: assistantContent },
    ],
  };
}

export function j(obj: unknown): string {
  return JSON.stringify(obj, null, 2);
}

// ─── Section imports ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { taskLambdaPairs }                   = require("./sections/01-task-lambda");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { taskServicePairs }                  = require("./sections/02-task-services");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { choicePairs }                       = require("./sections/03-choice");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { parallelMapPassWaitPairs }          = require("./sections/04-parallel-map-pass-wait");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { retryCatchPairs }                   = require("./sections/05-retry-catch");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { dataFlowPairs }                     = require("./sections/06-data-flow");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { azureToAwsPairs }                   = require("./sections/07-azure-to-aws");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { complexWorkflowPairs }              = require("./sections/08-complex-workflows");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { taskVariationPairs }                = require("./sections/09-task-variations");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { choiceVariationPairs }              = require("./sections/10-choice-variations");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { errorHandlingAdvancedPairs }        = require("./sections/11-error-handling-advanced");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { parallelMapVariationPairs }         = require("./sections/12-parallel-map-variations");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { waitPassSucceedFailVariationPairs } = require("./sections/13-wait-pass-succeed-fail-variations");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { extendedServicePairs }              = require("./sections/14-extended-service-integrations");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { variableManagementPairs }           = require("./sections/15-variable-management");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { nestedPatternPairs }                = require("./sections/16-nested-patterns");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { azureReverseExtendedPairs }         = require("./sections/17-azure-reverse-extended");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { complexWorkflowExtendedPairs }      = require("./sections/18-complex-workflows-extended");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { dataTransformationPairs }           = require("./sections/19-data-transformation");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { timerPollingPairs }                 = require("./sections/20-timer-polling");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { taskChainVariationPairs }           = require("./sections/21-task-chain-variations");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { choiceRoutingExtendedPairs }        = require("./sections/22-choice-routing-extended");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { errorHandlingScenarioPairs }        = require("./sections/23-error-handling-scenarios");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { azureToAwsComprehensivePairs }      = require("./sections/24-azure-to-aws-comprehensive");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { parallelMapExtendedPairs }          = require("./sections/25-parallel-map-extended");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { mixedIntegrationPairs }             = require("./sections/26-mixed-integration-patterns");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { additionalPatternPairs }            = require("./sections/27-additional-patterns");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { jsonataSyntaxPairs }                = require("./sections/28-jsonata-syntax");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { azureNonHttpTriggerPairs }          = require("./sections/29-azure-non-http-triggers");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { intrinsicFunctionExtendedPairs }    = require("./sections/30-intrinsic-functions-extended");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { distributedMapPairs }               = require("./sections/31-distributed-map");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { aiMlServicePairs }                  = require("./sections/32-ai-ml-services");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { deepNestingPairs }                  = require("./sections/33-deep-nesting");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { activityWorkerPairs }               = require("./sections/34-activity-workers");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { paginationPatternPairs }            = require("./sections/35-pagination-patterns");

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const sections: [string, () => TrainingPair[]][] = [
    ["01 Task/Lambda/HTTP",              taskLambdaPairs],
    ["02 Task/Services (DB/SNS/SQS…)",   taskServicePairs],
    ["03 Choice → If/Switch",            choicePairs],
    ["04 Parallel/Map/Pass/Wait",         parallelMapPassWaitPairs],
    ["05 Retry & Catch",                 retryCatchPairs],
    ["06 Data-flow",                     dataFlowPairs],
    ["07 Azure→AWS reverse",             azureToAwsPairs],
    ["08 Complex workflows",             complexWorkflowPairs],
    ["09 Task variations (many)",        taskVariationPairs],
    ["10 Choice variations (many)",      choiceVariationPairs],
    ["11 Error handling advanced",       errorHandlingAdvancedPairs],
    ["12 Parallel/Map variations",       parallelMapVariationPairs],
    ["13 Wait/Pass/Succeed/Fail",        waitPassSucceedFailVariationPairs],
    ["14 Extended service integrations", extendedServicePairs],
    ["15 Variable management",           variableManagementPairs],
    ["16 Nested patterns",               nestedPatternPairs],
    ["17 Azure reverse extended",        azureReverseExtendedPairs],
    ["18 Complex workflows extended",    complexWorkflowExtendedPairs],
    ["19 Data transformation",           dataTransformationPairs],
    ["20 Timer/polling patterns",        timerPollingPairs],
    ["21 Task chain variations",         taskChainVariationPairs],
    ["22 Choice/routing extended",       choiceRoutingExtendedPairs],
    ["23 Error handling scenarios",      errorHandlingScenarioPairs],
    ["24 Azure→AWS comprehensive",       azureToAwsComprehensivePairs],
    ["25 Parallel/Map extended",         parallelMapExtendedPairs],
    ["26 Mixed integration patterns",    mixedIntegrationPairs],
    ["27 Additional patterns",           additionalPatternPairs],
    ["28 JSONata syntax",                jsonataSyntaxPairs],
    ["29 Azure non-HTTP triggers",       azureNonHttpTriggerPairs],
    ["30 Intrinsic functions extended",  intrinsicFunctionExtendedPairs],
    ["31 Distributed Map",               distributedMapPairs],
    ["32 AI/ML services",                aiMlServicePairs],
    ["33 Deep nesting",                  deepNestingPairs],
    ["34 Activity workers",              activityWorkerPairs],
    ["35 Pagination patterns",           paginationPatternPairs],
  ];

  const allPairs: TrainingPair[] = [];
  for (const [name, fn] of sections) {
    const batch = fn();
    console.log(`  ${name.padEnd(40)} ${batch.length} pairs`);
    allPairs.push(...batch);
  }

  console.log(`\nTotal pairs: ${allPairs.length}`);

  if (allPairs.length < 1000) {
    console.warn(`WARNING: only ${allPairs.length} pairs — target is 1000+`);
  }

  const outputPath = join(__dirname, "training-pairs.jsonl");
  const lines = allPairs.map((p) => JSON.stringify(p));
  writeFileSync(outputPath, lines.join("\n") + "\n", "utf-8");
  console.log(`\nWritten to: ${outputPath}`);
}

main();
