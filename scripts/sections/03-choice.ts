/**
 * Section 03 – Choice state → Azure If / Switch (all documented operators)
 *
 * Sources:
 *  AWS Choice operators: https://docs.aws.amazon.com/step-functions/latest/dg/amazon-states-language-choice-state.html
 *  Azure If action:      https://learn.microsoft.com/en-us/azure/logic-apps/logic-apps-workflow-actions-triggers#if-action
 *  Azure Switch action:  https://learn.microsoft.com/en-us/azure/logic-apps/logic-apps-workflow-actions-triggers#switch-action
 *  Azure expressions:    https://learn.microsoft.com/en-us/azure/logic-apps/workflow-definition-language-functions-reference
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

export function choicePairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // ── 1. StringEquals → If equals() ────────────────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "CheckStatus",
      States: {
        CheckStatus: {
          Type: "Choice",
          Choices: [
            { Variable: "$.status", StringEquals: "approved", Next: "ProcessApproval" }
          ],
          Default: "Reject"
        },
        ProcessApproval: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "ApproveFn", "Payload.$": "$" }, End: true },
        Reject:          { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "RejectFn",  "Payload.$": "$" }, End: true }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        CheckStatus: {
          type: "If",
          expression: { and: [{ equals: ["@triggerBody()?['status']", "approved"] }] },
          actions: {
            ProcessApproval: {
              type: "Function",
              inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ApproveFn" }, body: "@triggerBody()" },
              runAfter: {}
            }
          },
          else: {
            actions: {
              Reject: {
                type: "Function",
                inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/RejectFn" }, body: "@triggerBody()" },
                runAfter: {}
              }
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 2. StringNotEquals → If not(equals()) ────────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "CheckType",
      States: {
        CheckType: {
          Type: "Choice",
          Choices: [
            { Variable: "$.type", StringEquals: "premium", Next: "PremiumFlow" }
          ],
          Default: "StandardFlow"
        },
        PremiumFlow:  { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "PremiumFn",  "Payload.$": "$" }, End: true },
        StandardFlow: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "StandardFn", "Payload.$": "$" }, End: true }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        CheckType: {
          type: "If",
          expression: { and: [{ equals: ["@triggerBody()?['type']", "premium"] }] },
          actions: {
            PremiumFlow: {
              type: "Function",
              inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/PremiumFn" }, body: "@triggerBody()" },
              runAfter: {}
            }
          },
          else: {
            actions: {
              StandardFlow: {
                type: "Function",
                inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/StandardFn" }, body: "@triggerBody()" },
                runAfter: {}
              }
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 3. StringLessThan → If less() ────────────────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "CheckPriority",
      States: {
        CheckPriority: {
          Type: "Choice",
          Choices: [
            { Variable: "$.priority", StringLessThan: "M", Next: "HighPriority" }
          ],
          Default: "LowPriority"
        },
        HighPriority: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "HighFn", "Payload.$": "$" }, End: true },
        LowPriority:  { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "LowFn",  "Payload.$": "$" }, End: true }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        CheckPriority: {
          type: "If",
          expression: { and: [{ less: ["@triggerBody()?['priority']", "M"] }] },
          actions: {
            HighPriority: {
              type: "Function",
              inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/HighFn" }, body: "@triggerBody()" },
              runAfter: {}
            }
          },
          else: {
            actions: {
              LowPriority: {
                type: "Function",
                inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/LowFn" }, body: "@triggerBody()" },
                runAfter: {}
              }
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 4. StringGreaterThan → If greater() ──────────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "CheckVersion",
      States: {
        CheckVersion: {
          Type: "Choice",
          Choices: [
            { Variable: "$.version", StringGreaterThan: "2.0", Next: "NewVersionFlow" }
          ],
          Default: "OldVersionFlow"
        },
        NewVersionFlow: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "NewFn", "Payload.$": "$" }, End: true },
        OldVersionFlow: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "OldFn", "Payload.$": "$" }, End: true }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        CheckVersion: {
          type: "If",
          expression: { and: [{ greater: ["@triggerBody()?['version']", "2.0"] }] },
          actions: {
            NewVersionFlow: {
              type: "Function",
              inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/NewFn" }, body: "@triggerBody()" },
              runAfter: {}
            }
          },
          else: {
            actions: {
              OldVersionFlow: {
                type: "Function",
                inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/OldFn" }, body: "@triggerBody()" },
                runAfter: {}
              }
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 5. StringMatches (wildcard) → If contains() ──────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "CheckEmail",
      States: {
        CheckEmail: {
          Type: "Choice",
          Choices: [
            { Variable: "$.email", StringMatches: "*@company.com", Next: "InternalUser" }
          ],
          Default: "ExternalUser"
        },
        InternalUser: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "InternalFn", "Payload.$": "$" }, End: true },
        ExternalUser: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "ExternalFn", "Payload.$": "$" }, End: true }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        CheckEmail: {
          type: "If",
          expression: { and: [{ endsWith: ["@triggerBody()?['email']", "@company.com"] }] },
          actions: {
            InternalUser: {
              type: "Function",
              inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/InternalFn" }, body: "@triggerBody()" },
              runAfter: {}
            }
          },
          else: {
            actions: {
              ExternalUser: {
                type: "Function",
                inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ExternalFn" }, body: "@triggerBody()" },
                runAfter: {}
              }
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 6. NumericEquals → If equals() on number ────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "CheckQuantity",
      States: {
        CheckQuantity: {
          Type: "Choice",
          Choices: [
            { Variable: "$.quantity", NumericEquals: 0, Next: "OutOfStock" }
          ],
          Default: "InStock"
        },
        OutOfStock: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "OutOfStockFn", "Payload.$": "$" }, End: true },
        InStock:    { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "InStockFn",    "Payload.$": "$" }, End: true }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        CheckQuantity: {
          type: "If",
          expression: { and: [{ equals: ["@triggerBody()?['quantity']", 0] }] },
          actions: {
            OutOfStock: {
              type: "Function",
              inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/OutOfStockFn" }, body: "@triggerBody()" },
              runAfter: {}
            }
          },
          else: {
            actions: {
              InStock: {
                type: "Function",
                inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/InStockFn" }, body: "@triggerBody()" },
                runAfter: {}
              }
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 7. NumericGreaterThan → If greater() ────────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "CheckAmount",
      States: {
        CheckAmount: {
          Type: "Choice",
          Choices: [
            { Variable: "$.amount", NumericGreaterThan: 1000, Next: "LargeOrder" }
          ],
          Default: "SmallOrder"
        },
        LargeOrder: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "LargeOrderFn", "Payload.$": "$" }, End: true },
        SmallOrder: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "SmallOrderFn", "Payload.$": "$" }, End: true }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        CheckAmount: {
          type: "If",
          expression: { and: [{ greater: ["@triggerBody()?['amount']", 1000] }] },
          actions: {
            LargeOrder: {
              type: "Function",
              inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/LargeOrderFn" }, body: "@triggerBody()" },
              runAfter: {}
            }
          },
          else: {
            actions: {
              SmallOrder: {
                type: "Function",
                inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/SmallOrderFn" }, body: "@triggerBody()" },
                runAfter: {}
              }
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 8. NumericLessThanEquals → If lessOrEquals() ────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "CheckScore",
      States: {
        CheckScore: {
          Type: "Choice",
          Choices: [
            { Variable: "$.score", NumericLessThanEquals: 50, Next: "FailedScore" }
          ],
          Default: "PassedScore"
        },
        FailedScore: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "FailFn", "Payload.$": "$" }, End: true },
        PassedScore: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "PassFn", "Payload.$": "$" }, End: true }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        CheckScore: {
          type: "If",
          expression: { and: [{ lessOrEquals: ["@triggerBody()?['score']", 50] }] },
          actions: {
            FailedScore: {
              type: "Function",
              inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/FailFn" }, body: "@triggerBody()" },
              runAfter: {}
            }
          },
          else: {
            actions: {
              PassedScore: {
                type: "Function",
                inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/PassFn" }, body: "@triggerBody()" },
                runAfter: {}
              }
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 9. NumericGreaterThanEquals → If greaterOrEquals() ──────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "CheckAge",
      States: {
        CheckAge: {
          Type: "Choice",
          Choices: [
            { Variable: "$.age", NumericGreaterThanEquals: 18, Next: "AdultFlow" }
          ],
          Default: "MinorFlow"
        },
        AdultFlow: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "AdultFn", "Payload.$": "$" }, End: true },
        MinorFlow: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "MinorFn", "Payload.$": "$" }, End: true }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        CheckAge: {
          type: "If",
          expression: { and: [{ greaterOrEquals: ["@triggerBody()?['age']", 18] }] },
          actions: {
            AdultFlow: {
              type: "Function",
              inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/AdultFn" }, body: "@triggerBody()" },
              runAfter: {}
            }
          },
          else: {
            actions: {
              MinorFlow: {
                type: "Function",
                inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/MinorFn" }, body: "@triggerBody()" },
                runAfter: {}
              }
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 10. BooleanEquals → If equals() on bool ─────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "CheckActive",
      States: {
        CheckActive: {
          Type: "Choice",
          Choices: [
            { Variable: "$.isActive", BooleanEquals: true, Next: "ActiveFlow" }
          ],
          Default: "InactiveFlow"
        },
        ActiveFlow:   { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "ActiveFn",   "Payload.$": "$" }, End: true },
        InactiveFlow: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "InactiveFn", "Payload.$": "$" }, End: true }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        CheckActive: {
          type: "If",
          expression: { and: [{ equals: ["@triggerBody()?['isActive']", true] }] },
          actions: {
            ActiveFlow: {
              type: "Function",
              inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ActiveFn" }, body: "@triggerBody()" },
              runAfter: {}
            }
          },
          else: {
            actions: {
              InactiveFlow: {
                type: "Function",
                inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/InactiveFn" }, body: "@triggerBody()" },
                runAfter: {}
              }
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 11. IsNull → If equals(@var, null) ──────────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "CheckNullField",
      States: {
        CheckNullField: {
          Type: "Choice",
          Choices: [
            { Variable: "$.optionalField", IsNull: true, Next: "MissingField" }
          ],
          Default: "FieldPresent"
        },
        MissingField: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "DefaultFn", "Payload.$": "$" }, End: true },
        FieldPresent: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "ProcessFn", "Payload.$": "$" }, End: true }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        CheckNullField: {
          type: "If",
          expression: { and: [{ equals: ["@triggerBody()?['optionalField']", null] }] },
          actions: {
            MissingField: {
              type: "Function",
              inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/DefaultFn" }, body: "@triggerBody()" },
              runAfter: {}
            }
          },
          else: {
            actions: {
              FieldPresent: {
                type: "Function",
                inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ProcessFn" }, body: "@triggerBody()" },
                runAfter: {}
              }
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 12. IsPresent → If not(equals(@var, null)) ──────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "CheckOptional",
      States: {
        CheckOptional: {
          Type: "Choice",
          Choices: [
            { Variable: "$.discount", IsPresent: true, Next: "ApplyDiscount" }
          ],
          Default: "NoDiscount"
        },
        ApplyDiscount: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "DiscountFn", "Payload.$": "$" }, End: true },
        NoDiscount:    { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "FullPriceFn","Payload.$": "$" }, End: true }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        CheckOptional: {
          type: "If",
          expression: { and: [{ not: { equals: ["@triggerBody()?['discount']", null] } }] },
          actions: {
            ApplyDiscount: {
              type: "Function",
              inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/DiscountFn" }, body: "@triggerBody()" },
              runAfter: {}
            }
          },
          else: {
            actions: {
              NoDiscount: {
                type: "Function",
                inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/FullPriceFn" }, body: "@triggerBody()" },
                runAfter: {}
              }
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 13. IsString → If equals(string(@var), @var) ────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "CheckInputType",
      States: {
        CheckInputType: {
          Type: "Choice",
          Choices: [
            { Variable: "$.id", IsString: true, Next: "StringIdFlow" }
          ],
          Default: "NumericIdFlow"
        },
        StringIdFlow:  { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "StringIdFn",  "Payload.$": "$" }, End: true },
        NumericIdFlow: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "NumericIdFn", "Payload.$": "$" }, End: true }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        CheckInputType: {
          type: "If",
          expression: { and: [{ equals: ["@string(triggerBody()?['id'])", "@{triggerBody()?['id']}"] }] },
          actions: {
            StringIdFlow: {
              type: "Function",
              inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/StringIdFn" }, body: "@triggerBody()" },
              runAfter: {}
            }
          },
          else: {
            actions: {
              NumericIdFlow: {
                type: "Function",
                inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/NumericIdFn" }, body: "@triggerBody()" },
                runAfter: {}
              }
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 14. And operator → If with multiple conditions ───────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "CheckEligibility",
      States: {
        CheckEligibility: {
          Type: "Choice",
          Choices: [{
            And: [
              { Variable: "$.age", NumericGreaterThanEquals: 21 },
              { Variable: "$.verified", BooleanEquals: true },
              { Variable: "$.country", StringEquals: "US" }
            ],
            Next: "Eligible"
          }],
          Default: "NotEligible"
        },
        Eligible:    { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "EligibleFn",    "Payload.$": "$" }, End: true },
        NotEligible: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "NotEligibleFn", "Payload.$": "$" }, End: true }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        CheckEligibility: {
          type: "If",
          expression: {
            and: [
              { greaterOrEquals: ["@triggerBody()?['age']", 21] },
              { equals: ["@triggerBody()?['verified']", true] },
              { equals: ["@triggerBody()?['country']", "US"] }
            ]
          },
          actions: {
            Eligible: {
              type: "Function",
              inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/EligibleFn" }, body: "@triggerBody()" },
              runAfter: {}
            }
          },
          else: {
            actions: {
              NotEligible: {
                type: "Function",
                inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/NotEligibleFn" }, body: "@triggerBody()" },
                runAfter: {}
              }
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 15. Or operator → If with or conditions ──────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "CheckErrorCategory",
      States: {
        CheckErrorCategory: {
          Type: "Choice",
          Choices: [{
            Or: [
              { Variable: "$.errorCode", StringEquals: "NETWORK_ERROR" },
              { Variable: "$.errorCode", StringEquals: "TIMEOUT" },
              { Variable: "$.errorCode", StringEquals: "SERVICE_UNAVAILABLE" }
            ],
            Next: "RetriableError"
          }],
          Default: "FatalError"
        },
        RetriableError: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "RetryFn", "Payload.$": "$" }, End: true },
        FatalError:     { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "FatalFn", "Payload.$": "$" }, End: true }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        CheckErrorCategory: {
          type: "If",
          expression: {
            or: [
              { equals: ["@triggerBody()?['errorCode']", "NETWORK_ERROR"] },
              { equals: ["@triggerBody()?['errorCode']", "TIMEOUT"] },
              { equals: ["@triggerBody()?['errorCode']", "SERVICE_UNAVAILABLE"] }
            ]
          },
          actions: {
            RetriableError: {
              type: "Function",
              inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/RetryFn" }, body: "@triggerBody()" },
              runAfter: {}
            }
          },
          else: {
            actions: {
              FatalError: {
                type: "Function",
                inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/FatalFn" }, body: "@triggerBody()" },
                runAfter: {}
              }
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 16. Not operator → If with negation ──────────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "CheckNotPending",
      States: {
        CheckNotPending: {
          Type: "Choice",
          Choices: [{
            Not: { Variable: "$.status", StringEquals: "pending" },
            Next: "ReadyToProcess"
          }],
          Default: "StillPending"
        },
        ReadyToProcess: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "ProcessFn", "Payload.$": "$" }, End: true },
        StillPending:   { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "WaitFn",    "Payload.$": "$" }, End: true }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        CheckNotPending: {
          type: "If",
          expression: { and: [{ not: { equals: ["@triggerBody()?['status']", "pending"] } }] },
          actions: {
            ReadyToProcess: {
              type: "Function",
              inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ProcessFn" }, body: "@triggerBody()" },
              runAfter: {}
            }
          },
          else: {
            actions: {
              StillPending: {
                type: "Function",
                inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/WaitFn" }, body: "@triggerBody()" },
                runAfter: {}
              }
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 17. Multi-branch (3 values same variable) → Switch ───────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "RouteByRegion",
      States: {
        RouteByRegion: {
          Type: "Choice",
          Choices: [
            { Variable: "$.region", StringEquals: "us-east-1", Next: "USHandler" },
            { Variable: "$.region", StringEquals: "eu-west-1", Next: "EUHandler" },
            { Variable: "$.region", StringEquals: "ap-south-1", Next: "APHandler" }
          ],
          Default: "DefaultHandler"
        },
        USHandler:      { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "USFn",      "Payload.$": "$" }, End: true },
        EUHandler:      { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "EUFn",      "Payload.$": "$" }, End: true },
        APHandler:      { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "APFn",      "Payload.$": "$" }, End: true },
        DefaultHandler: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "DefaultFn", "Payload.$": "$" }, End: true }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        RouteByRegion: {
          type: "Switch",
          expression: "@triggerBody()?['region']",
          cases: {
            "us-east-1": {
              case: "us-east-1",
              actions: {
                USHandler: {
                  type: "Function",
                  inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/USFn" }, body: "@triggerBody()" },
                  runAfter: {}
                }
              }
            },
            "eu-west-1": {
              case: "eu-west-1",
              actions: {
                EUHandler: {
                  type: "Function",
                  inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/EUFn" }, body: "@triggerBody()" },
                  runAfter: {}
                }
              }
            },
            "ap-south-1": {
              case: "ap-south-1",
              actions: {
                APHandler: {
                  type: "Function",
                  inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/APFn" }, body: "@triggerBody()" },
                  runAfter: {}
                }
              }
            }
          },
          default: {
            actions: {
              DefaultHandler: {
                type: "Function",
                inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/DefaultFn" }, body: "@triggerBody()" },
                runAfter: {}
              }
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 18. Switch: 4-way order-status routing ───────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "RouteByOrderStatus",
      States: {
        RouteByOrderStatus: {
          Type: "Choice",
          Choices: [
            { Variable: "$.orderStatus", StringEquals: "new",        Next: "ProcessNew" },
            { Variable: "$.orderStatus", StringEquals: "processing", Next: "CheckProcessing" },
            { Variable: "$.orderStatus", StringEquals: "shipped",    Next: "TrackShipment" },
            { Variable: "$.orderStatus", StringEquals: "delivered",  Next: "CloseOrder" }
          ],
          Default: "HandleUnknownStatus"
        },
        ProcessNew:          { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "ProcessNewFn",          "Payload.$": "$" }, End: true },
        CheckProcessing:     { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "CheckProcessingFn",     "Payload.$": "$" }, End: true },
        TrackShipment:       { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "TrackShipmentFn",       "Payload.$": "$" }, End: true },
        CloseOrder:          { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "CloseOrderFn",          "Payload.$": "$" }, End: true },
        HandleUnknownStatus: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "HandleUnknownStatusFn", "Payload.$": "$" }, End: true }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        RouteByOrderStatus: {
          type: "Switch",
          expression: "@triggerBody()?['orderStatus']",
          cases: {
            "new":        { case: "new",        actions: { ProcessNew:      { type: "Function", inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ProcessNewFn" },      body: "@triggerBody()" }, runAfter: {} } } },
            "processing": { case: "processing", actions: { CheckProcessing: { type: "Function", inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/CheckProcessingFn" }, body: "@triggerBody()" }, runAfter: {} } } },
            "shipped":    { case: "shipped",    actions: { TrackShipment:   { type: "Function", inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/TrackShipmentFn" },   body: "@triggerBody()" }, runAfter: {} } } },
            "delivered":  { case: "delivered",  actions: { CloseOrder:      { type: "Function", inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/CloseOrderFn" },      body: "@triggerBody()" }, runAfter: {} } } }
          },
          default: {
            actions: {
              HandleUnknownStatus: {
                type: "Function",
                inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/HandleUnknownStatusFn" }, body: "@triggerBody()" },
                runAfter: {}
              }
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 19. TimestampGreaterThan → If greater() on timestamp string ──────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "CheckExpiry",
      States: {
        CheckExpiry: {
          Type: "Choice",
          Choices: [
            { Variable: "$.expiresAt", TimestampGreaterThan: "2024-01-01T00:00:00Z", Next: "StillValid" }
          ],
          Default: "Expired"
        },
        StillValid: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "ValidFn",   "Payload.$": "$" }, End: true },
        Expired:    { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "ExpiredFn", "Payload.$": "$" }, End: true }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        CheckExpiry: {
          type: "If",
          expression: { and: [{ greater: ["@triggerBody()?['expiresAt']", "2024-01-01T00:00:00Z"] }] },
          actions: {
            StillValid: {
              type: "Function",
              inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ValidFn" }, body: "@triggerBody()" },
              runAfter: {}
            }
          },
          else: {
            actions: {
              Expired: {
                type: "Function",
                inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ExpiredFn" }, body: "@triggerBody()" },
                runAfter: {}
              }
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 20. StringEqualsPath (variable comparison) → If equals() ─────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "MatchRoles",
      States: {
        MatchRoles: {
          Type: "Choice",
          Choices: [
            { Variable: "$.userRole", StringEqualsPath: "$.requiredRole", Next: "Authorized" }
          ],
          Default: "Unauthorized"
        },
        Authorized:   { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "AuthorizedFn",   "Payload.$": "$" }, End: true },
        Unauthorized: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "UnauthorizedFn", "Payload.$": "$" }, End: true }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        MatchRoles: {
          type: "If",
          expression: { and: [{ equals: ["@triggerBody()?['userRole']", "@triggerBody()?['requiredRole']"] }] },
          actions: {
            Authorized: {
              type: "Function",
              inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/AuthorizedFn" }, body: "@triggerBody()" },
              runAfter: {}
            }
          },
          else: {
            actions: {
              Unauthorized: {
                type: "Function",
                inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/UnauthorizedFn" }, body: "@triggerBody()" },
                runAfter: {}
              }
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 21. Choice with nested tasks in each branch ───────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "RouteByEnvironment",
      States: {
        RouteByEnvironment: {
          Type: "Choice",
          Choices: [
            { Variable: "$.env", StringEquals: "prod", Next: "ProdValidate" }
          ],
          Default: "DevProcess"
        },
        ProdValidate: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ProdValidateFn", "Payload.$": "$" },
          Next: "ProdDeploy"
        },
        ProdDeploy: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ProdDeployFn", "Payload.$": "$" },
          End: true
        },
        DevProcess: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "DevProcessFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        RouteByEnvironment: {
          type: "If",
          expression: { and: [{ equals: ["@triggerBody()?['env']", "prod"] }] },
          actions: {
            ProdValidate: {
              type: "Function",
              inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ProdValidateFn" }, body: "@triggerBody()" },
              runAfter: {}
            },
            ProdDeploy: {
              type: "Function",
              inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ProdDeployFn" }, body: "@body('ProdValidate')" },
              runAfter: { ProdValidate: ["Succeeded"] }
            }
          },
          else: {
            actions: {
              DevProcess: {
                type: "Function",
                inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/DevProcessFn" }, body: "@triggerBody()" },
                runAfter: {}
              }
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // ── 22. NumericLessThan → If less() ─────────────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "CheckInventory",
      States: {
        CheckInventory: {
          Type: "Choice",
          Choices: [
            { Variable: "$.stockCount", NumericLessThan: 10, Next: "LowStock" }
          ],
          Default: "NormalStock"
        },
        LowStock:    { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "ReorderFn",    "Payload.$": "$" }, End: true },
        NormalStock: { Type: "Task", Resource: "arn:aws:states:::lambda:invoke", Parameters: { FunctionName: "NormalFlowFn", "Payload.$": "$" }, End: true }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        CheckInventory: {
          type: "If",
          expression: { and: [{ less: ["@triggerBody()?['stockCount']", 10] }] },
          actions: {
            LowStock: {
              type: "Function",
              inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ReorderFn" }, body: "@triggerBody()" },
              runAfter: {}
            }
          },
          else: {
            actions: {
              NormalStock: {
                type: "Function",
                inputs: { function: { id: "/subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/NormalFlowFn" }, body: "@triggerBody()" },
                runAfter: {}
              }
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  return pairs;
}
