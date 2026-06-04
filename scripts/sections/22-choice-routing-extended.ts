/**
 * Section 22 – Extended choice / routing patterns:
 *   More StringEquals, NumericComparisons, Boolean, IsNull, compound And/Or,
 *   StringMatches (wildcard), variable-path comparisons, Choice → Switch in both directions
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

// Helper: single binary Choice aws→azure
function binaryChoice(
  name: string,
  variable: string,
  awsOp: string,
  awsVal: unknown,
  azureExprFn: string,
  trueFn: string,
  falseFn: string
): TrainingPair {
  const azureVar = variable.replace("$.", "@triggerBody()?['").replace(/\./g, "']?['") + "']";

  return pair("aws-to-azure",
    j({
      StartAt: name,
      States: {
        [name]: {
          Type: "Choice",
          Choices: [{ Variable: variable, [awsOp]: awsVal, Next: trueFn }],
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
          expression: { and: [{ [azureExprFn]: [azureVar, awsVal] }] },
          actions: { [trueFn]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${trueFn}Fn` }, body: "@triggerBody()" }, runAfter: {} } },
          else: { actions: { [falseFn]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${falseFn}Fn` }, body: "@triggerBody()" }, runAfter: {} } } },
          runAfter: {}
        }
      }
    })
  );
}

export function choiceRoutingExtendedPairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // ── StringEquals additional cases ────────────────────────────────────────
  const stringEqCases: [string, string, string, string, string][] = [
    ["CheckCountry",    "$.country",     "US",         "ServeUSContent",   "ServeIntlContent"],
    ["CheckCurrency",   "$.currency",    "USD",        "ProcessUSD",       "ConvertCurrency"],
    ["CheckLanguage",   "$.lang",        "en",         "EnglishContent",   "TranslateContent"],
    ["CheckTier",       "$.tier",        "premium",    "PremiumService",   "BasicService"],
    ["CheckChannel",    "$.channel",     "web",        "WebHandler",       "MobileHandler"],
    ["CheckFormat",     "$.format",      "json",       "JsonProcessor",    "XmlProcessor"],
    ["CheckProtocol",   "$.protocol",    "https",      "SecureHandler",    "UpgradeProtocol"],
    ["CheckPlatform",   "$.platform",    "aws",        "AwsHandler",       "AzureHandler"],
    ["CheckVersion",    "$.apiVersion",  "v2",         "V2Handler",        "V1LegacyHandler"],
    ["CheckMode",       "$.mode",        "production", "ProdHandler",      "DevHandler"],
  ];
  for (const [name, variable, val, trueFn, falseFn] of stringEqCases) {
    pairs.push(binaryChoice(name, variable, "StringEquals", val, "equals", trueFn, falseFn));
  }

  // ── NumericEquals cases ───────────────────────────────────────────────────
  const numericEqCases: [string, string, number, string, string][] = [
    ["CheckAttemptLimit",  "$.attempts",    0,   "FirstAttempt",    "RetryAttempt"],
    ["CheckPageZero",      "$.page",        1,   "FirstPage",       "SubsequentPage"],
    ["CheckSingleItem",    "$.itemCount",   1,   "SingleItemFlow",  "MultiItemFlow"],
    ["CheckZeroErrors",    "$.errorCount",  0,   "CleanRun",        "HandleErrors"],
    ["CheckFullBatch",     "$.batchSize",   100, "FullBatchProcess","PartialBatch"],
    ["CheckMaxRetries",    "$.maxRetries",  3,   "StandardRetry",   "ExtendedRetry"],
  ];
  for (const [name, variable, val, trueFn, falseFn] of numericEqCases) {
    pairs.push(binaryChoice(name, variable, "NumericEquals", val, "equals", trueFn, falseFn));
  }

  // ── NumericLessThan cases ────────────────────────────────────────────────
  const numericLtCases: [string, string, number, string, string][] = [
    ["CheckLowStock",      "$.quantity",   10,  "LowStockAlert",    "NormalStock"],
    ["CheckMinAmount",     "$.amount",     100, "BelowMinimum",     "AboveMinimum"],
    ["CheckSmallBatch",    "$.batchSize",  50,  "SmallBatchFlow",   "LargeBatchFlow"],
    ["CheckShortTimeout",  "$.timeout",    30,  "FastPathTimeout",  "StandardTimeout"],
    ["CheckLowScore",      "$.score",      50,  "LowScoreAction",   "HighScoreAction"],
    ["CheckFewAttempts",   "$.attempts",   3,   "AllowRetry",       "MaxRetriesHit"],
    ["CheckSmallFile",     "$.fileSizeKB", 512, "InlineProcess",    "ChunkProcess"],
    ["CheckFewErrors",     "$.errors",     5,   "Minor",            "Major"],
  ];
  for (const [name, variable, val, trueFn, falseFn] of numericLtCases) {
    pairs.push(binaryChoice(name, variable, "NumericLessThan", val, "less", trueFn, falseFn));
  }

  // ── NumericGreaterThan cases ─────────────────────────────────────────────
  const numericGtCases: [string, string, number, string, string][] = [
    ["CheckHighVolume",    "$.requestCount", 1000, "ScaleOut",       "NormalScale"],
    ["CheckLargePayload",  "$.bytes",        1048576, "ChunkUpload", "DirectUpload"],
    ["CheckHighCPU",       "$.cpuPercent",   80, "ScaleUp",         "NormalLoad"],
    ["CheckBigOrder",      "$.amount",       10000, "BigOrderFlow", "NormalOrderFlow"],
    ["CheckHighPriority",  "$.priority",     8, "PriorityQueue",    "StandardQueue"],
    ["CheckOldRecord",     "$.ageInDays",    365, "ArchiveOldRecord","KeepRecord"],
    ["CheckDeepNesting",   "$.depth",        5, "FlattenStructure", "ProcessNested"],
    ["CheckLongDuration",  "$.durationSecs", 300, "AsyncProcess",   "SyncProcess"],
  ];
  for (const [name, variable, val, trueFn, falseFn] of numericGtCases) {
    pairs.push(binaryChoice(name, variable, "NumericGreaterThan", val, "greater", trueFn, falseFn));
  }

  // ── BooleanEquals cases ──────────────────────────────────────────────────
  const boolCases: [string, string, boolean, string, string][] = [
    ["CheckIsAdmin",       "$.isAdmin",       true,  "AdminFlow",        "UserFlow"],
    ["CheckIsPremium",     "$.isPremium",     true,  "PremiumFeature",   "UpgradeCTA"],
    ["CheckIsVerified",    "$.isVerified",    true,  "VerifiedAction",   "RequireVerification"],
    ["CheckIsEnabled",     "$.featureEnabled",true,  "UseFeature",       "FallbackFeature"],
    ["CheckIsDryRun",      "$.dryRun",        true,  "SimulateOnly",     "ExecuteForReal"],
    ["CheckIsLocked",      "$.isLocked",      false, "AllowEdit",        "BlockEdit"],
    ["CheckIsExpired",     "$.isExpired",      true, "RenewResource",    "UseResource"],
    ["CheckIsComplete",    "$.isComplete",     true, "MarkDone",         "ContinueProcessing"],
    ["CheckIsRetryable",   "$.retryable",      true, "QueueForRetry",    "FailPermanently"],
    ["CheckIsCached",      "$.isCached",       true, "ReturnCached",     "FetchFresh"],
  ];
  for (const [name, variable, val, trueFn, falseFn] of boolCases) {
    pairs.push(binaryChoice(name, variable, "BooleanEquals", val, "equals", trueFn, falseFn));
  }

  // ── IsNull / IsPresent patterns ──────────────────────────────────────────
  const nullCheckCases: [string, string, boolean, "IsNull" | "IsPresent", string, string][] = [
    ["CheckUserIdNull",    "$.userId",      true,  "IsNull",    "CreateNewUser",  "UseExistingUser"],
    ["CheckTokenPresent",  "$.authToken",   true,  "IsPresent", "UseToken",       "RequestNewToken"],
    ["CheckResultNull",    "$.cachedResult",true,  "IsNull",    "ComputeResult",  "ReturnCached"],
    ["CheckConfigPresent", "$.config",      true,  "IsPresent", "UseConfig",      "UseDefaults"],
    ["CheckErrorNull",     "$.error",       true,  "IsNull",    "ContinueHappy",  "HandleError"],
    ["CheckOverridePresent","$.override",   true,  "IsPresent", "ApplyOverride",  "UseDefault"],
  ];
  for (const [name, variable, val, op, trueFn, falseFn] of nullCheckCases) {
    const azureExpr = op === "IsNull" ? "equals" : "not";
    const azureVar = variable.replace("$.", "@triggerBody()?['") + "']";
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Choice",
            Choices: [{ Variable: variable, [op]: val, Next: trueFn }],
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
            expression: op === "IsNull"
              ? { and: [{ equals: [azureVar, null] }] }
              : { and: [{ not: { equals: [azureVar, null] } }] },
            actions: { [trueFn]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${trueFn}Fn` }, body: "@triggerBody()" }, runAfter: {} } },
            else: { actions: { [falseFn]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${falseFn}Fn` }, body: "@triggerBody()" }, runAfter: {} } } },
            runAfter: {}
          }
        }
      })
    ));
  }

  // ── StringMatches (wildcard) ─────────────────────────────────────────────
  const stringMatchCases: [string, string, string, string, string][] = [
    ["CheckEmailDomain",  "$.email",    "*@example.com",  "InternalUser",  "ExternalUser"],
    ["CheckS3Prefix",     "$.s3Key",    "uploads/*",      "ProcessUpload", "ProcessOther"],
    ["CheckErrorPrefix",  "$.errorCode","Throttling*",    "HandleThrottle","HandleGeneric"],
    ["CheckEnvPrefix",    "$.envName",  "prod-*",         "ProdFlow",      "NonProdFlow"],
    ["CheckPathPrefix",   "$.path",     "/api/v2/*",      "V2ApiHandler",  "LegacyHandler"],
  ];
  for (const [name, variable, pattern, trueFn, falseFn] of stringMatchCases) {
    const startsWithPrefix = pattern.replace("*", "");
    const azureVar = variable.replace("$.", "@triggerBody()?['") + "']";
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Choice",
            Choices: [{ Variable: variable, StringMatches: pattern, Next: trueFn }],
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
            expression: pattern.startsWith("*")
              ? { and: [{ endsWith: [azureVar, pattern.replace("*", "")] }] }
              : { and: [{ startsWith: [azureVar, startsWithPrefix] }] },
            actions: { [trueFn]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${trueFn}Fn` }, body: "@triggerBody()" }, runAfter: {} } },
            else: { actions: { [falseFn]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${falseFn}Fn` }, body: "@triggerBody()" }, runAfter: {} } } },
            runAfter: {}
          }
        }
      })
    ));
  }

  // ── And / Or compound conditions ─────────────────────────────────────────
  const compoundCases: [string, "And" | "Or", string, string, string | boolean, string | boolean, unknown, unknown][] = [
    ["CheckRegionAndEnv",  "And", "$.region", "$.env",    "us-east-1", "prod",    "FullProd",       "OtherPath"],
    ["CheckTypeAndStatus", "And", "$.type",   "$.status", "order",     "active",  "ActiveOrders",   "Others"],
    ["CheckAdminOrBeta",   "Or",  "$.isAdmin","$.isBeta", true,        true,      "PrivilegedPath", "StandardPath"],
    ["CheckProdOrStaging", "Or",  "$.env",    "$.env",    "prod",      "staging", "HighCare",       "Dev"],
  ];

  for (const [name, op, var1, var2, val1, val2, trueFn, falseFn] of compoundCases) {
    const azureVar1 = var1.replace("$.", "@triggerBody()?['") + "']";
    const azureVar2 = var2.replace("$.", "@triggerBody()?['") + "']";
    const awsChoiceCondition = op === "And"
      ? { And: [{ Variable: var1, ...(typeof val1 === "boolean" ? { BooleanEquals: val1 } : { StringEquals: val1 }) }, { Variable: var2, ...(typeof val2 === "boolean" ? { BooleanEquals: val2 } : { StringEquals: val2 }) }], Next: trueFn }
      : { Or: [{ Variable: var1, ...(typeof val1 === "boolean" ? { BooleanEquals: val1 } : { StringEquals: val1 }) }, { Variable: var2, ...(typeof val2 === "boolean" ? { BooleanEquals: val2 } : { StringEquals: val2 }) }], Next: trueFn };

    const azureExpr = op === "And"
      ? { and: [{ equals: [azureVar1, val1] }, { equals: [azureVar2, val2] }] }
      : { or: [{ equals: [azureVar1, val1] }, { equals: [azureVar2, val2] }] };

    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Choice",
            Choices: [awsChoiceCondition],
            Default: falseFn
          },
          [trueFn as string]: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${trueFn}Fn`, "Payload.$": "$" }, End: true },
          [falseFn as string]: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${falseFn}Fn`, "Payload.$": "$" }, End: true }
        }
      }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [name]: {
            type: "If",
            expression: azureExpr,
            actions: { [trueFn as string]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${trueFn}Fn` }, body: "@triggerBody()" }, runAfter: {} } },
            else: { actions: { [falseFn as string]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${falseFn}Fn` }, body: "@triggerBody()" }, runAfter: {} } } },
            runAfter: {}
          }
        }
      })
    ));
  }

  // ── 4-way Switch (Choice with 4 branches) ───────────────────────────────
  const switch4Cases: [string, string, [string, string, string][]][] = [
    ["RouteByEnv", "$.env",
      [["prod","ProdFlow","prod"], ["staging","StagingFlow","staging"], ["dev","DevFlow","dev"], ["test","TestFlow","test"]]],
    ["RouteBySize", "$.size",
      [["small","SmallHandler","small"], ["medium","MediumHandler","medium"], ["large","LargeHandler","large"], ["xlarge","XLargeHandler","xlarge"]]],
    ["RouteByLang", "$.lang",
      [["en","EnglishFlow","en"], ["es","SpanishFlow","es"], ["fr","FrenchFlow","fr"], ["de","GermanFlow","de"]]],
    ["RouteByDept", "$.department",
      [["engineering","EngFlow","engineering"], ["sales","SalesFlow","sales"], ["hr","HRFlow","hr"], ["finance","FinanceFlow","finance"]]],
    ["RouteByDay", "$.dayOfWeek",
      [["monday","MondayJob","monday"], ["wednesday","WedJob","wednesday"], ["friday","FriJob","friday"], ["weekend","WeekendJob","weekend"]]],
  ];

  for (const [name, variable, cases] of switch4Cases) {
    const azureVar = variable.replace("$.", "@triggerBody()?['") + "']";
    const awsChoices = cases.map(([val, next]) => ({ Variable: variable, StringEquals: val, Next: next }));
    const defaultFn = `${name}Default`;
    const awsStates: Record<string, unknown> = {
      [name]: { Type: "Choice", Choices: awsChoices, Default: defaultFn }
    };
    const azureCaseMap: Record<string, unknown> = {};
    for (const [val, fn] of cases) {
      awsStates[fn] = { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${fn}Fn`, "Payload.$": "$" }, End: true };
      azureCaseMap[val] = { case: val, actions: { [fn]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${fn}Fn` }, body: "@triggerBody()" }, runAfter: {} } } };
    }
    awsStates[defaultFn] = { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${defaultFn}Fn`, "Payload.$": "$" }, End: true };

    pairs.push(pair("aws-to-azure",
      j({ StartAt: name, States: awsStates }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [name]: {
            type: "Switch",
            expression: azureVar,
            cases: azureCaseMap,
            default: { actions: { [defaultFn]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${defaultFn}Fn` }, body: "@triggerBody()" }, runAfter: {} } } },
            runAfter: {}
          }
        }
      })
    ));
  }

  return pairs;
}
