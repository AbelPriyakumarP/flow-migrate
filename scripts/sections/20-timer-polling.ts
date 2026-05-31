/**
 * Section 20 – Timer, polling, and scheduling patterns:
 *   Wait Seconds, Wait Timestamp, Wait SecondsPath, Wait TimestampPath,
 *   Poll-until-done loops (Choice+Wait), scheduled job triggering
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

export function timerPollingPairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // ── Wait with various time units (aws-to-azure) ───────────────────────────
  const waitTimeCases: [string, number, string, string][] = [
    // [name, seconds, unit, count]
    ["WaitTwoSeconds",       2,     "Second", "2"],
    ["WaitFifteenSeconds",   15,    "Second", "15"],
    ["WaitHalfMinute",       30,    "Second", "30"],
    ["WaitTwoMinutes",       120,   "Second", "120"],
    ["WaitFiveMinutes",      300,   "Second", "300"],
    ["WaitFifteenMinutes",   900,   "Second", "900"],
    ["WaitThirtyMinutes",    1800,  "Second", "1800"],
    ["WaitOneHour",          3600,  "Second", "3600"],
    ["WaitSixHours",         21600, "Second", "21600"],
    ["WaitTwelveHours",      43200, "Second", "43200"],
    ["WaitTwentyFourHours",  86400, "Second", "86400"],
    ["WaitOneWeek",          604800,"Second", "604800"],
  ];

  for (const [name, secs, , count] of waitTimeCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: "Trigger",
        States: {
          Trigger: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: "TriggerFn", "Payload.$": "$" },
            Next: name
          },
          [name]: {
            Type: "Wait",
            Seconds: secs,
            Next: "Resume"
          },
          Resume: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: "ResumeFn", "Payload.$": "$" },
            End: true
          }
        }
      }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          Trigger: {
            type: "Function",
            inputs: { function: { id: "/sub/rg/app/functions/TriggerFn" }, body: "@triggerBody()" },
            runAfter: {}
          },
          [name]: {
            type: "Wait",
            inputs: { interval: { unit: "Second", count: parseInt(count) } },
            runAfter: { Trigger: ["Succeeded"] }
          },
          Resume: {
            type: "Function",
            inputs: { function: { id: "/sub/rg/app/functions/ResumeFn" }, body: "@body('Trigger')" },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── Wait with SecondsPath (dynamic) ──────────────────────────────────────
  const waitDynamicCases: [string, string, string][] = [
    ["CooldownByConfig",   "$.cooldownSeconds",     "AfterCooldown"],
    ["BackoffByPolicy",    "$.backoffSeconds",      "RetryAfterBackoff"],
    ["RateLimitWait",      "$.rateLimitWaitSecs",   "AfterRateLimit"],
    ["PollInterval",       "$.pollIntervalSeconds", "PollAgain"],
    ["ScheduledDelay",     "$.delaySeconds",        "RunScheduled"],
    ["DynamicSleep",       "$.sleepDuration",       "WakeUp"],
    ["BatchDelay",         "$.batchDelaySeconds",   "StartBatch"],
    ["ThrottleDelay",      "$.throttleWait",        "ContinueAfterThrottle"],
  ];

  for (const [name, secondsPath, nextFn] of waitDynamicCases) {
    const field = secondsPath.replace("$.", "");
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Wait",
            SecondsPath: secondsPath,
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
            type: "Wait",
            inputs: { interval: { unit: "Second", count: `@triggerBody()?['${field}']` } },
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

  // ── Wait with Timestamp (fixed future time) ──────────────────────────────
  const waitTimestampCases: [string, string, string][] = [
    ["WaitUntilMidnight",    "2024-01-01T00:00:00Z", "RunAtMidnight"],
    ["WaitUntilMaintenance", "2024-06-15T02:00:00Z", "StartMaintenance"],
    ["WaitUntilLaunch",      "2024-07-04T12:00:00Z", "LaunchProduct"],
    ["WaitUntilExpiry",      "2024-12-31T23:59:59Z", "RunAtExpiry"],
  ];

  for (const [name, timestamp, nextFn] of waitTimestampCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Wait",
            Timestamp: timestamp,
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
            type: "Wait",
            inputs: { until: { timestamp: timestamp } },
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

  // ── Wait with TimestampPath (dynamic future time) ─────────────────────────
  const waitTimestampPathCases: [string, string, string][] = [
    ["WaitUntilScheduled",   "$.scheduledAt",    "ExecuteScheduled"],
    ["WaitForExpiryDate",    "$.expiresAt",      "HandleExpiry"],
    ["WaitForDeadline",      "$.deadline",       "CheckDeadline"],
    ["WaitForRenewal",       "$.renewalDate",    "RenewSubscription"],
    ["WaitForDeployWindow",  "$.deployAt",       "StartDeploy"],
    ["WaitForMaintenanceWindow","$.maintenanceStart","BeginMaintenance"],
  ];

  for (const [name, timestampPath, nextFn] of waitTimestampPathCases) {
    const field = timestampPath.replace("$.", "");
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Wait",
            TimestampPath: timestampPath,
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
            type: "Wait",
            inputs: { until: { timestamp: `@triggerBody()?['${field}']` } },
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

  // ── Poll-until-done pattern (AWS → Azure) ─────────────────────────────────
  const pollPatternCases: [string, string, string, number, string][] = [
    ["PollJobStatus",    "CheckJobStatusFn",  "$.status", 15, "COMPLETED"],
    ["PollReportReady",  "CheckReportFn",     "$.ready",  30, "true"],
    ["PollIndexBuild",   "CheckIndexFn",      "$.phase",  20, "READY"],
    ["PollExportDone",   "CheckExportFn",     "$.exportStatus", 10, "DONE"],
    ["PollApproval",     "CheckApprovalFn",   "$.approved", 60, "true"],
    ["PollSyncStatus",   "CheckSyncFn",       "$.syncState", 30, "SYNCED"],
  ];

  for (const [name, checkFn, statusPath, pollSecs, doneValue] of pollPatternCases) {
    const statusField = statusPath.replace("$.", "");
    const isDoneName = `${name}_IsDone`;
    const waitName = `${name}_Wait`;
    const doneName = `${name}_Done`;

    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: checkFn, "Payload.$": "$" },
            ResultPath: "$.pollResult",
            Next: isDoneName
          },
          [isDoneName]: {
            Type: "Choice",
            Choices: [{ Variable: statusPath, StringEquals: doneValue, Next: doneName }],
            Default: waitName
          },
          [waitName]: {
            Type: "Wait",
            Seconds: pollSecs,
            Next: name
          },
          [doneName]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${name}CompleteFn`, "Payload.$": "$" },
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
            type: "Until",
            expression: `@equals(body('${name}_Check')?['${statusField}'], '${doneValue}')`,
            limit: { count: 100, timeout: "PT24H" },
            actions: {
              [`${name}_Check`]: {
                type: "Function",
                inputs: { function: { id: `/sub/rg/app/functions/${checkFn}` }, body: "@triggerBody()" },
                runAfter: {}
              },
              [`${name}_CheckWait`]: {
                type: "Wait",
                inputs: { interval: { unit: "Second", count: pollSecs } },
                runAfter: { [`${name}_Check`]: ["Succeeded"] }
              }
            },
            runAfter: {}
          },
          [doneName]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${name}CompleteFn` }, body: "@triggerBody()" },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── Azure Until loop (reverse) → AWS poll-until-done ─────────────────────
  const azureUntilCases: [string, string, string, number][] = [
    ["PollDataReady",    "GetDataStatusFn",  "ready",    10],
    ["PollProcessDone",  "GetProcessStateFn","completed",30],
    ["PollQueueEmpty",   "CheckQueueFn",     "isEmpty",  15],
    ["PollSyncFinished", "GetSyncStateFn",   "synced",   20],
  ];

  for (const [name, checkFn, field, pollSecs] of azureUntilCases) {
    const checkName = `${name}_Check`;
    const waitName = `${name}_Wait`;
    const completeName = `${name}_Complete`;
    const isDoneName = `${name}_IsDone`;

    pairs.push(pair("azure-to-aws",
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [name]: {
            type: "Until",
            expression: `@equals(body('${checkName}')?['${field}'], true)`,
            limit: { count: 50, timeout: "PT12H" },
            actions: {
              [checkName]: {
                type: "Function",
                inputs: { function: { id: `/sub/rg/app/functions/${checkFn}` }, body: "@triggerBody()" },
                runAfter: {}
              },
              [waitName]: {
                type: "Wait",
                inputs: { interval: { unit: "Second", count: pollSecs } },
                runAfter: { [checkName]: ["Succeeded"] }
              }
            },
            runAfter: {}
          },
          [completeName]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${completeName}Fn` }, body: "@triggerBody()" },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      }),
      j({
        StartAt: checkName,
        States: {
          [checkName]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: checkFn, "Payload.$": "$" },
            ResultPath: "$.pollResult",
            Next: isDoneName
          },
          [isDoneName]: {
            Type: "Choice",
            Choices: [{ Variable: `$.pollResult.Payload.${field}`, BooleanEquals: true, Next: completeName }],
            Default: waitName
          },
          [waitName]: {
            Type: "Wait",
            Seconds: pollSecs,
            Next: checkName
          },
          [completeName]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${completeName}Fn`, "Payload.$": "$" },
            End: true
          }
        }
      })
    ));
  }

  return pairs;
}
