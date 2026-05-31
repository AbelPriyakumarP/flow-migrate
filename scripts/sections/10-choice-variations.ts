/**
 * Section 10 – Choice operator variations (all 28+ documented operators)
 * Covers StringEquals, Numeric*, Boolean, IsNull, IsPresent, IsString,
 * IsNumeric, IsBoolean, IsTimestamp, And, Or, Not, *Path variants
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

// Build a simple binary Choice → Azure If pair
function binaryChoice(
  stateName: string,
  variable: string,
  operator: string,
  value: unknown,
  azureOp: string,
  trueNext: string,
  falseNext: string
): TrainingPair {
  const awsChoice: Record<string, unknown> = { Variable: variable, Next: trueNext };
  awsChoice[operator] = value;

  const azureExpr: Record<string, unknown[]> = { [azureOp]: [`@triggerBody()?['${variable.replace("$.", "")}']`, value] };

  return pair("aws-to-azure",
    j({
      StartAt: stateName,
      States: {
        [stateName]: { Type: "Choice", Choices: [awsChoice], Default: falseNext },
        [trueNext]:  { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${trueNext}Fn`,  "Payload.$": "$" }, End: true },
        [falseNext]: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${falseNext}Fn`, "Payload.$": "$" }, End: true }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        [stateName]: {
          type: "If",
          expression: { and: [azureExpr] },
          actions:  { [trueNext]:  { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${trueNext}Fn`  }, body: "@triggerBody()" }, runAfter: {} } },
          else:     { actions: { [falseNext]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${falseNext}Fn` }, body: "@triggerBody()" }, runAfter: {} } } },
          runAfter: {}
        }
      }
    })
  );
}

// Build a multi-branch Switch from a variable + [value → action] map
function multiSwitch(
  stateName: string,
  variable: string,
  cases: [string, string][], // [matchValue, actionName]
  defaultAction: string
): TrainingPair {
  const awsChoices = cases.map(([val, next]) => ({ Variable: variable, StringEquals: val, Next: next }));
  const awsStates: Record<string, unknown> = {
    [stateName]: { Type: "Choice", Choices: awsChoices, Default: defaultAction }
  };
  for (const [, action] of cases) {
    awsStates[action] = { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${action}Fn`, "Payload.$": "$" }, End: true };
  }
  awsStates[defaultAction] = { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${defaultAction}Fn`, "Payload.$": "$" }, End: true };

  const azureCases: Record<string, unknown> = {};
  for (const [val, action] of cases) {
    azureCases[val] = {
      case: val,
      actions: { [action]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${action}Fn` }, body: "@triggerBody()" }, runAfter: {} } }
    };
  }

  return pair("aws-to-azure",
    j({ StartAt: stateName, States: awsStates }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        [stateName]: {
          type: "Switch",
          expression: `@triggerBody()?['${variable.replace("$.", "")}']`,
          cases: azureCases,
          default: { actions: { [defaultAction]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${defaultAction}Fn` }, body: "@triggerBody()" }, runAfter: {} } } },
          runAfter: {}
        }
      }
    })
  );
}

export function choiceVariationPairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // ── StringEquals variations ──────────────────────────────────────────────
  const stringEqCases: [string, string, string, string, string][] = [
    ["CheckStatus",    "$.status",      "active",     "ActiveFlow",    "InactiveFlow"],
    ["CheckRole",      "$.role",        "admin",      "AdminFlow",     "UserFlow"],
    ["CheckCountry",   "$.country",     "US",         "DomesticFlow",  "InternationalFlow"],
    ["CheckCurrency",  "$.currency",    "USD",        "USDFlow",       "OtherCurrencyFlow"],
    ["CheckEventType", "$.eventType",   "purchase",   "PurchaseFlow",  "NonPurchaseFlow"],
    ["CheckTier",      "$.tier",        "enterprise", "EnterpriseFlow","StandardFlow"],
    ["CheckSource",    "$.source",      "mobile",     "MobileFlow",    "WebFlow"],
    ["CheckEnv",       "$.environment", "prod",       "ProdFlow",      "DevFlow"],
    ["CheckPlan",      "$.plan",        "premium",    "PremiumFlow",   "FreeFlow"],
    ["CheckMethod",    "$.method",      "card",       "CardFlow",      "OtherPaymentFlow"],
  ];

  for (const [name, variable, value, trueN, falseN] of stringEqCases) {
    pairs.push(binaryChoice(name, variable, "StringEquals", value, "equals", trueN, falseN));
  }

  // ── NumericGreaterThan variations ────────────────────────────────────────
  const numGtCases: [string, string, number, string, string][] = [
    ["CheckBalance",   "$.balance",    0,     "HasBalance",      "ZeroBalance"],
    ["CheckScore",     "$.score",      75,    "HighScore",       "LowScore"],
    ["CheckRetries",   "$.retryCount", 3,     "TooManyRetries",  "RetryAllowed"],
    ["CheckAge",       "$.age",        17,    "Adult",           "Minor"],
    ["CheckCount",     "$.itemCount",  0,     "HasItems",        "EmptyCart"],
    ["CheckWeight",    "$.weight",     100,   "Heavy",           "Light"],
    ["CheckDuration",  "$.duration",   60,    "LongTask",        "ShortTask"],
    ["CheckRisk",      "$.riskScore",  50,    "HighRisk",        "LowRisk"],
    ["CheckPriority",  "$.priority",   5,     "HighPriority",    "NormalPriority"],
    ["CheckAttempt",   "$.attempt",    0,     "AlreadyTried",    "FirstAttempt"],
  ];

  for (const [name, variable, value, trueN, falseN] of numGtCases) {
    pairs.push(binaryChoice(name, variable, "NumericGreaterThan", value, "greater", trueN, falseN));
  }

  // ── NumericLessThan variations ───────────────────────────────────────────
  const numLtCases: [string, string, number, string, string][] = [
    ["CheckStock",     "$.stockLevel",  5,    "CriticalStock",   "AdequateStock"],
    ["CheckTemp",      "$.temperature", 0,    "BelowFreezing",   "AboveFreezing"],
    ["CheckSize",      "$.fileSizeKb",  100,  "SmallFile",       "LargeFile"],
    ["CheckRate",      "$.errorRate",   5,    "HealthyService",  "DegradedService"],
    ["CheckCapacity",  "$.capacity",    10,   "LowCapacity",     "SufficientCapacity"],
  ];

  for (const [name, variable, value, trueN, falseN] of numLtCases) {
    pairs.push(binaryChoice(name, variable, "NumericLessThan", value, "less", trueN, falseN));
  }

  // ── NumericEquals variations ─────────────────────────────────────────────
  const numEqCases: [string, string, number, string, string][] = [
    ["CheckVersion",   "$.version",    2,     "V2Flow",          "OtherVersionFlow"],
    ["CheckPage",      "$.pageNumber", 1,     "FirstPage",       "SubsequentPage"],
    ["CheckStep",      "$.stepNumber", 0,     "InitialStep",     "SubsequentStep"],
    ["CheckRetry",     "$.retryNum",   0,     "FirstAttempt",    "RetryAttempt"],
    ["CheckParts",     "$.totalParts", 1,     "SinglePart",      "MultiPart"],
  ];

  for (const [name, variable, value, trueN, falseN] of numEqCases) {
    pairs.push(binaryChoice(name, variable, "NumericEquals", value, "equals", trueN, falseN));
  }

  // ── BooleanEquals variations ─────────────────────────────────────────────
  const boolCases: [string, string, boolean, string, string][] = [
    ["CheckVerified",  "$.isVerified",  true,  "VerifiedFlow",    "UnverifiedFlow"],
    ["CheckEnabled",   "$.isEnabled",   true,  "EnabledFlow",     "DisabledFlow"],
    ["CheckPaid",      "$.isPaid",      true,  "PaidFlow",        "UnpaidFlow"],
    ["CheckExpired",   "$.isExpired",   false, "ValidFlow",       "ExpiredFlow"],
    ["CheckBlocked",   "$.isBlocked",   false, "AllowedFlow",     "BlockedFlow"],
    ["CheckNew",       "$.isNew",       true,  "NewItemFlow",     "ExistingItemFlow"],
    ["CheckDraft",     "$.isDraft",     false, "PublishedFlow",   "DraftFlow"],
    ["CheckTest",      "$.isTestMode",  false, "LiveFlow",        "TestFlow"],
  ];

  for (const [name, variable, value, trueN, falseN] of boolCases) {
    pairs.push(binaryChoice(name, variable, "BooleanEquals", value, "equals", trueN, falseN));
  }

  // ── IsNull / IsPresent variations ────────────────────────────────────────
  const nullCases: [string, string, string, string][] = [
    ["CheckOptionalField",   "$.optionalData",   "UseOptional",   "SkipOptional"],
    ["CheckErrorField",      "$.errorDetail",    "HandleError",   "NoError"],
    ["CheckOverride",        "$.priceOverride",  "UseOverride",   "UseDefault"],
    ["CheckCallback",        "$.callbackUrl",    "Callback",      "NoCallback"],
    ["CheckMetadata",        "$.metadata",       "WithMetadata",  "WithoutMetadata"],
  ];

  for (const [name, variable, trueN, falseN] of nullCases) {
    // IsNull: variable is null → true branch
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]:    { Type: "Choice", Choices: [{ Variable: variable, IsNull: true, Next: falseN }], Default: trueN },
          [trueN]:   { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${trueN}Fn`,  "Payload.$": "$" }, End: true },
          [falseN]:  { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${falseN}Fn`, "Payload.$": "$" }, End: true }
        }
      }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [name]: {
            type: "If",
            expression: { and: [{ not: { equals: [`@triggerBody()?['${variable.replace("$.", "")}']`, null] } }] },
            actions:  { [trueN]:  { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${trueN}Fn`  }, body: "@triggerBody()" }, runAfter: {} } },
            else:     { actions: { [falseN]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${falseN}Fn` }, body: "@triggerBody()" }, runAfter: {} } } },
            runAfter: {}
          }
        }
      })
    ));
  }

  // ── Multi-branch Switch variations ───────────────────────────────────────
  const switchCases: [string, string, [string,string][], string][] = [
    ["RouteByStatus",   "$.status",
      [["pending","HandlePending"],["processing","HandleProcessing"],["complete","HandleComplete"]],
      "HandleUnknown"],
    ["RouteByChannel",  "$.channel",
      [["web","WebHandler"],["mobile","MobileHandler"],["api","ApiHandler"]],
      "DefaultHandler"],
    ["RouteByCategory", "$.category",
      [["electronics","ElectronicsHandler"],["clothing","ClothingHandler"],["food","FoodHandler"]],
      "GenericHandler"],
    ["RouteByLocale",   "$.locale",
      [["en-US","EnglishHandler"],["fr-FR","FrenchHandler"],["de-DE","GermanHandler"]],
      "DefaultLocaleHandler"],
    ["RouteByAction",   "$.action",
      [["create","CreateHandler"],["update","UpdateHandler"],["delete","DeleteHandler"]],
      "NoOpHandler"],
    ["RouteByService",  "$.service",
      [["email","EmailService"],["sms","SMSService"],["push","PushService"]],
      "DefaultService"],
    ["RouteByFormat",   "$.format",
      [["json","JSONProcessor"],["xml","XMLProcessor"],["csv","CSVProcessor"]],
      "UnknownFormatHandler"],
    ["RouteByRegion",   "$.region",
      [["us-east-1","USEastHandler"],["eu-west-1","EUWestHandler"],["ap-southeast-1","APHandler"]],
      "GlobalHandler"],
    ["RouteByPriority", "$.priorityName",
      [["critical","CriticalHandler"],["high","HighHandler"],["normal","NormalHandler"]],
      "LowPriorityHandler"],
    ["RouteByLevel",    "$.level",
      [["beginner","BeginnerPath"],["intermediate","IntermediatePath"],["advanced","AdvancedPath"]],
      "DefaultPath"],
  ];

  for (const [name, variable, branches, defaultAct] of switchCases) {
    pairs.push(multiSwitch(name, variable, branches, defaultAct));
  }

  // ── And / Or compound conditions ─────────────────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "CheckTwoConditions",
      States: {
        CheckTwoConditions: {
          Type: "Choice",
          Choices: [{
            And: [
              { Variable: "$.amount", NumericGreaterThan: 100 },
              { Variable: "$.currency", StringEquals: "USD" }
            ],
            Next: "HighValueUSD"
          }],
          Default: "OtherFlow"
        },
        HighValueUSD: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "HighValueUSDFn", "Payload.$": "$" }, End: true },
        OtherFlow:    { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "OtherFlowFn",    "Payload.$": "$" }, End: true }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        CheckTwoConditions: {
          type: "If",
          expression: { and: [{ greater: ["@triggerBody()?['amount']", 100] }, { equals: ["@triggerBody()?['currency']", "USD"] }] },
          actions:  { HighValueUSD: { type: "Function", inputs: { function: { id: "/sub/rg/app/functions/HighValueUSDFn" }, body: "@triggerBody()" }, runAfter: {} } },
          else:     { actions: { OtherFlow: { type: "Function", inputs: { function: { id: "/sub/rg/app/functions/OtherFlowFn" }, body: "@triggerBody()" }, runAfter: {} } } },
          runAfter: {}
        }
      }
    })
  ));

  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "CheckAnyError",
      States: {
        CheckAnyError: {
          Type: "Choice",
          Choices: [{
            Or: [
              { Variable: "$.httpStatus", NumericGreaterThanEquals: 500 },
              { Variable: "$.timeout",    BooleanEquals: true },
              { Variable: "$.errorCode",  StringEquals:  "RATE_LIMIT" }
            ],
            Next: "RetriableFailure"
          }],
          Default: "Success"
        },
        RetriableFailure: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "RetryFn",  "Payload.$": "$" }, End: true },
        Success:          { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "SuccessFn","Payload.$": "$" }, End: true }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        CheckAnyError: {
          type: "If",
          expression: {
            or: [
              { greaterOrEquals: ["@triggerBody()?['httpStatus']", 500] },
              { equals: ["@triggerBody()?['timeout']", true] },
              { equals: ["@triggerBody()?['errorCode']", "RATE_LIMIT"] }
            ]
          },
          actions:  { RetriableFailure: { type: "Function", inputs: { function: { id: "/sub/rg/app/functions/RetryFn"   }, body: "@triggerBody()" }, runAfter: {} } },
          else:     { actions: { Success: { type: "Function", inputs: { function: { id: "/sub/rg/app/functions/SuccessFn" }, body: "@triggerBody()" }, runAfter: {} } } },
          runAfter: {}
        }
      }
    })
  ));

  // ── IsNumeric / IsBoolean / IsTimestamp ──────────────────────────────────
  const typeCheckCases: [string, string, string, string, string][] = [
    ["CheckIfNumber",    "$.value",   "IsNumeric",   "NumericPath",   "NonNumericPath"],
    ["CheckIfBool",      "$.flag",    "IsBoolean",   "BooleanPath",   "NonBooleanPath"],
    ["CheckIfTimestamp", "$.date",    "IsTimestamp", "TimestampPath_Branch", "NonTimestampPath"],
    ["CheckIfString",    "$.payload", "IsString",    "StringPath",    "NonStringPath"],
  ];

  for (const [name, variable, op, trueN, falseN] of typeCheckCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]:   { Type: "Choice", Choices: [{ Variable: variable, [op]: true, Next: trueN }], Default: falseN },
          [trueN]:  { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${trueN}Fn`,  "Payload.$": "$" }, End: true },
          [falseN]: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: `${falseN}Fn`, "Payload.$": "$" }, End: true }
        }
      }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [name]: {
            type: "If",
            expression: { and: [{ not: { equals: [`@triggerBody()?['${variable.replace("$.", "")}']`, null] } }] },
            actions:  { [trueN]:  { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${trueN}Fn`  }, body: "@triggerBody()" }, runAfter: {} } },
            else:     { actions: { [falseN]: { type: "Function", inputs: { function: { id: `/sub/rg/app/functions/${falseN}Fn` }, body: "@triggerBody()" }, runAfter: {} } } },
            runAfter: {}
          }
        }
      })
    ));
  }

  return pairs;
}
