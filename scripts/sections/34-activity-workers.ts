/**
 * Section 34 – Activity workers (human-in-the-loop & long-polling)
 *
 * AWS Step Functions Activities:
 *   - Resource: "arn:aws:states:<region>:<account>:activity:<name>"
 *   - Worker polls GetActivityTask, processes, then SendTaskSuccess/SendTaskFailure
 *   - HeartbeatSeconds keeps the task alive during long work
 *   - Used for: human approvals, on-premise integrations, manual steps
 *
 * Azure Logic Apps equivalent:
 *   - type: "ApiConnectionWebhook" with callback URL for human approval
 *   - Or HTTP trigger with webhook callback (waitForTaskToken pattern)
 *   - Azure approval workflows use Office 365 / Teams connector
 *
 * References:
 *   https://docs.aws.amazon.com/step-functions/latest/dg/concepts-activities.html
 *   https://learn.microsoft.com/en-us/azure/logic-apps/logic-apps-control-flow-run-steps-group-scopes
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

export function activityWorkerPairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // ── Basic Activity → Azure webhook callback ───────────────────────────────
  const activityBasicCases: [string, number, string][] = [
    ["HumanApproval",     3600,  "ProcessApproved"],
    ["ManualDataEntry",   7200,  "ProcessEnteredData"],
    ["ExternalReview",    86400, "HandleReviewResult"],
    ["ManagerSignoff",    14400, "ExecuteApproved"],
    ["ComplianceCheck",   28800, "ContinueAfterCompliance"],
  ];

  for (const [name, heartbeat, next] of activityBasicCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:us-east-1:123456789012:activity:" + name,
            HeartbeatSeconds: heartbeat,
            TimeoutSeconds: heartbeat * 3,
            Retry: [{
              ErrorEquals: ["States.HeartbeatTimeout"],
              MaxAttempts: 1
            }],
            Catch: [{
              ErrorEquals: ["States.ALL"],
              Next: "HandleActivityError"
            }],
            Next: next
          },
          [next]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${next}Fn`, "Payload.$": "$" },
            End: true
          },
          HandleActivityError: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: "HandleActivityErrorFn", "Payload.$": "$" },
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
            type: "ApiConnectionWebhook",
            inputs: {
              host: { connection: { name: "@parameters('$connections')['office365']['connectionId']" } },
              path: "/approvalmail/$subscriptions",
              body: {
                NotificationUrl: "@listCallbackUrl()",
                Message: {
                  To: "@triggerBody()?['approverEmail']",
                  Subject: `Action required: ${name}`,
                  Options: "Approve, Reject",
                  Importance: "High",
                  Body: "@concat('Please review and respond to: ', string(triggerBody()))"
                }
              }
            },
            runAfter: {}
          },
          CheckApprovalResult: {
            type: "If",
            expression: {
              and: [{ equals: ["@body('" + name + "')?['SelectedOption']", "Approve"] }]
            },
            actions: {
              [next]: {
                type: "Function",
                inputs: {
                  function: { id: `/sub/rg/app/functions/${next}Fn` },
                  body: {
                    approvalResult: "@body('" + name + "')",
                    original: "@triggerBody()"
                  }
                },
                runAfter: {}
              }
            },
            else: {
              actions: {
                HandleActivityError: {
                  type: "Function",
                  inputs: {
                    function: { id: "/sub/rg/app/functions/HandleActivityErrorFn" },
                    body: {
                      approvalResult: "@body('" + name + "')",
                      original: "@triggerBody()"
                    }
                  },
                  runAfter: {}
                }
              }
            },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── Activity with task token (waitForTaskToken) ───────────────────────────
  const taskTokenCases: [string, string, string][] = [
    ["WaitForExternalSystem", "external-processing", "ProcessExternalResult"],
    ["WaitForLegacyBatch",    "legacy-batch-worker", "HandleBatchCompletion"],
    ["WaitForOnPremJob",      "on-prem-worker",       "IntegrateOnPremResult"],
    ["WaitForThirdPartyAPI",  "third-party-worker",   "ProcessAPICallback"],
  ];

  for (const [name, activityName, next] of taskTokenCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: "NotifyWorker",
        States: {
          NotifyWorker: {
            Type: "Task",
            Resource: "arn:aws:states:::sqs:sendMessage.waitForTaskToken",
            Parameters: {
              QueueUrl: `https://sqs.us-east-1.amazonaws.com/123456789012/${activityName}-queue`,
              MessageBody: {
                "taskToken.$": "$$.Task.Token",
                "payload.$": "$"
              }
            },
            HeartbeatSeconds: 3600,
            ResultPath: "$.workerResult",
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
          NotifyWorker: {
            type: "ApiConnection",
            inputs: {
              host: { connection: { name: "@parameters('$connections')['servicebus']['connectionId']" } },
              method: "post",
              path: `/@{encodeURIComponent('${activityName}-queue')}/messages`,
              body: {
                callbackUrl: "@listCallbackUrl()",
                payload: "@triggerBody()"
              }
            },
            runAfter: {}
          },
          WaitForCallback: {
            type: "ApiConnectionWebhook",
            inputs: {
              host: { connection: { name: "@parameters('$connections')['servicebus']['connectionId']" } },
              path: "/@{encodeURIComponent('" + activityName + "-response-queue')}/messages/head/peek",
              body: {
                NotificationUrl: "@listCallbackUrl()"
              }
            },
            runAfter: { NotifyWorker: ["Succeeded"] }
          },
          [next]: {
            type: "Function",
            inputs: {
              function: { id: `/sub/rg/app/functions/${next}Fn` },
              body: {
                workerResult: "@body('WaitForCallback')",
                original: "@triggerBody()"
              }
            },
            runAfter: { WaitForCallback: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── Human approval via Teams connector (Azure) → Activity (AWS) ───────────
  const teamsApprovalCases: [string, string, string][] = [
    ["TeamsBudgetApproval",   "budget-approval",    "ExecuteBudget"],
    ["TeamsDeployApproval",   "deploy-approval",    "TriggerDeployment"],
    ["TeamsAccessRequest",    "access-approval",    "GrantAccess"],
  ];

  for (const [name, activityName, next] of teamsApprovalCases) {
    pairs.push(pair("azure-to-aws",
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [name]: {
            type: "ApiConnectionWebhook",
            inputs: {
              host: { connection: { name: "@parameters('$connections')['teams']['connectionId']" } },
              path: "/v1.0/teams/conversation/adaptivecard/pause/$subscriptions",
              body: {
                notificationUrl: "@listCallbackUrl()",
                body: {
                  recipient: { channelId: "@triggerBody()?['channelId']" },
                  messageBody: "@concat('Approval needed: ', string(triggerBody()))",
                  updateMessage: "Response received.",
                  shouldUpdateCard: true
                }
              }
            },
            runAfter: {}
          },
          [next]: {
            type: "Function",
            inputs: {
              function: { id: `/sub/rg/app/functions/${next}Fn` },
              body: {
                approvalResponse: "@body('" + name + "')",
                original: "@triggerBody()"
              }
            },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      }),
      j({
        StartAt: "SendApprovalRequest",
        States: {
          SendApprovalRequest: {
            Type: "Task",
            Resource: "arn:aws:states:::sns:publish.waitForTaskToken",
            Parameters: {
              TopicArn: `arn:aws:sns:us-east-1:123456789012:${activityName}-topic`,
              Message: {
                "taskToken.$": "$$.Task.Token",
                "approvalRequest.$": "$"
              }
            },
            HeartbeatSeconds: 86400,
            TimeoutSeconds: 259200,
            Catch: [{
              ErrorEquals: ["States.HeartbeatTimeout", "States.Timeout"],
              Next: "HandleApprovalTimeout"
            }],
            Next: next
          },
          [next]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${next}Fn`, "Payload.$": "$" },
            End: true
          },
          HandleApprovalTimeout: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: "HandleApprovalTimeoutFn", "Payload.$": "$" },
            End: true
          }
        }
      })
    ));
  }

  // ── Multi-step human workflow ──────────────────────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "SubmitForReview",
      States: {
        SubmitForReview: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "SubmitForReviewFn", "Payload.$": "$" },
          Next: "WaitForManagerApproval"
        },
        WaitForManagerApproval: {
          Type: "Task",
          Resource: "arn:aws:states:us-east-1:123456789012:activity:ManagerApproval",
          HeartbeatSeconds: 3600,
          TimeoutSeconds: 86400,
          Catch: [{ ErrorEquals: ["States.ALL"], Next: "NotifyRejected" }],
          Next: "WaitForDirectorApproval"
        },
        WaitForDirectorApproval: {
          Type: "Task",
          Resource: "arn:aws:states:us-east-1:123456789012:activity:DirectorApproval",
          HeartbeatSeconds: 3600,
          TimeoutSeconds: 172800,
          Catch: [{ ErrorEquals: ["States.ALL"], Next: "NotifyRejected" }],
          Next: "ExecuteApproved"
        },
        ExecuteApproved: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ExecuteApprovedFn", "Payload.$": "$" },
          End: true
        },
        NotifyRejected: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "NotifyRejectedFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        SubmitForReview: {
          type: "Function",
          inputs: {
            function: { id: "/sub/rg/app/functions/SubmitForReviewFn" },
            body: "@triggerBody()"
          },
          runAfter: {}
        },
        WaitForManagerApproval: {
          type: "ApiConnectionWebhook",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['office365']['connectionId']" } },
            path: "/approvalmail/$subscriptions",
            body: {
              NotificationUrl: "@listCallbackUrl()",
              Message: {
                To: "@triggerBody()?['managerEmail']",
                Subject: "Manager Approval Required",
                Options: "Approve, Reject",
                Importance: "High",
                Body: "@concat('Manager approval required: ', string(body('SubmitForReview')))"
              }
            }
          },
          runAfter: { SubmitForReview: ["Succeeded"] }
        },
        CheckManagerDecision: {
          type: "If",
          expression: { and: [{ equals: ["@body('WaitForManagerApproval')?['SelectedOption']", "Approve"] }] },
          actions: {
            WaitForDirectorApproval: {
              type: "ApiConnectionWebhook",
              inputs: {
                host: { connection: { name: "@parameters('$connections')['office365']['connectionId']" } },
                path: "/approvalmail/$subscriptions",
                body: {
                  NotificationUrl: "@listCallbackUrl()",
                  Message: {
                    To: "@triggerBody()?['directorEmail']",
                    Subject: "Director Approval Required",
                    Options: "Approve, Reject",
                    Importance: "High",
                    Body: "@concat('Director approval required: ', string(body('SubmitForReview')))"
                  }
                }
              },
              runAfter: {}
            },
            CheckDirectorDecision: {
              type: "If",
              expression: { and: [{ equals: ["@body('WaitForDirectorApproval')?['SelectedOption']", "Approve"] }] },
              actions: {
                ExecuteApproved: {
                  type: "Function",
                  inputs: {
                    function: { id: "/sub/rg/app/functions/ExecuteApprovedFn" },
                    body: "@triggerBody()"
                  },
                  runAfter: {}
                }
              },
              else: {
                actions: {
                  NotifyDirectorRejected: {
                    type: "Function",
                    inputs: {
                      function: { id: "/sub/rg/app/functions/NotifyRejectedFn" },
                      body: { reason: "Director rejected", original: "@triggerBody()" }
                    },
                    runAfter: {}
                  }
                }
              },
              runAfter: { WaitForDirectorApproval: ["Succeeded"] }
            }
          },
          else: {
            actions: {
              NotifyRejected: {
                type: "Function",
                inputs: {
                  function: { id: "/sub/rg/app/functions/NotifyRejectedFn" },
                  body: { reason: "Manager rejected", original: "@triggerBody()" }
                },
                runAfter: {}
              }
            }
          },
          runAfter: { WaitForManagerApproval: ["Succeeded"] }
        }
      }
    })
  ));

  return pairs;
}
