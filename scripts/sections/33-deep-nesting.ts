/**
 * Section 33 – Deep nesting patterns (4+ levels)
 *
 * Real enterprise workflows involve deeply nested constructs:
 *   - Choice inside Map inside Parallel (3 levels)
 *   - Parallel inside Map (Map of parallel branches)
 *   - Retry + Catch inside nested Map
 *   - Multi-level Scope (Azure Scope→Scope→actions)
 *   - Nested If/Switch inside Foreach
 *
 * References:
 *   https://docs.aws.amazon.com/step-functions/latest/dg/concepts-nested-workflows.html
 *   https://learn.microsoft.com/en-us/azure/logic-apps/logic-apps-control-flow-loops
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

export function deepNestingPairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // ── Choice inside Map inside Parallel ─────────────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "ParallelProcess",
      States: {
        ParallelProcess: {
          Type: "Parallel",
          Branches: [
            {
              StartAt: "MapUsers",
              States: {
                MapUsers: {
                  Type: "Map",
                  ItemsPath: "$.users",
                  ItemProcessor: {
                    StartAt: "RouteUser",
                    States: {
                      RouteUser: {
                        Type: "Choice",
                        Choices: [
                          { Variable: "$.role", StringEquals: "admin", Next: "ProcessAdmin" },
                          { Variable: "$.role", StringEquals: "user", Next: "ProcessUser" }
                        ],
                        Default: "ProcessGuest"
                      },
                      ProcessAdmin: {
                        Type: "Task",
                        Resource: "arn:aws:states:::lambda:invoke",
                        Parameters: { FunctionName: "ProcessAdminFn", "Payload.$": "$" },
                        End: true
                      },
                      ProcessUser: {
                        Type: "Task",
                        Resource: "arn:aws:states:::lambda:invoke",
                        Parameters: { FunctionName: "ProcessUserFn", "Payload.$": "$" },
                        End: true
                      },
                      ProcessGuest: {
                        Type: "Task",
                        Resource: "arn:aws:states:::lambda:invoke",
                        Parameters: { FunctionName: "ProcessGuestFn", "Payload.$": "$" },
                        End: true
                      }
                    }
                  },
                  End: true
                }
              }
            },
            {
              StartAt: "MapOrders",
              States: {
                MapOrders: {
                  Type: "Map",
                  ItemsPath: "$.orders",
                  ItemProcessor: {
                    StartAt: "RouteOrder",
                    States: {
                      RouteOrder: {
                        Type: "Choice",
                        Choices: [
                          { Variable: "$.status", StringEquals: "pending", Next: "ProcessPending" }
                        ],
                        Default: "SkipOrder"
                      },
                      ProcessPending: {
                        Type: "Task",
                        Resource: "arn:aws:states:::lambda:invoke",
                        Parameters: { FunctionName: "ProcessPendingFn", "Payload.$": "$" },
                        End: true
                      },
                      SkipOrder: { Type: "Pass", End: true }
                    }
                  },
                  End: true
                }
              }
            }
          ],
          ResultPath: "$.parallelResults",
          Next: "AggregateResults"
        },
        AggregateResults: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "AggregateResultsFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        ParallelProcess: {
          type: "Scope",
          actions: {
            MapUsers: {
              type: "Foreach",
              foreach: "@triggerBody()?['users']",
              actions: {
                RouteUser: {
                  type: "Switch",
                  cases: {
                    IsAdmin: {
                      case: "@equals(items('MapUsers')?['role'], 'admin')",
                      actions: {
                        ProcessAdmin: {
                          type: "Function",
                          inputs: {
                            function: { id: "/sub/rg/app/functions/ProcessAdminFn" },
                            body: "@items('MapUsers')"
                          },
                          runAfter: {}
                        }
                      }
                    },
                    IsUser: {
                      case: "@equals(items('MapUsers')?['role'], 'user')",
                      actions: {
                        ProcessUser: {
                          type: "Function",
                          inputs: {
                            function: { id: "/sub/rg/app/functions/ProcessUserFn" },
                            body: "@items('MapUsers')"
                          },
                          runAfter: {}
                        }
                      }
                    }
                  },
                  default: {
                    actions: {
                      ProcessGuest: {
                        type: "Function",
                        inputs: {
                          function: { id: "/sub/rg/app/functions/ProcessGuestFn" },
                          body: "@items('MapUsers')"
                        },
                        runAfter: {}
                      }
                    }
                  },
                  runAfter: {}
                }
              },
              runAfter: {}
            },
            MapOrders: {
              type: "Foreach",
              foreach: "@triggerBody()?['orders']",
              actions: {
                RouteOrder: {
                  type: "If",
                  expression: { and: [{ equals: ["@items('MapOrders')?['status']", "pending"] }] },
                  actions: {
                    ProcessPending: {
                      type: "Function",
                      inputs: {
                        function: { id: "/sub/rg/app/functions/ProcessPendingFn" },
                        body: "@items('MapOrders')"
                      },
                      runAfter: {}
                    }
                  },
                  else: { actions: {} },
                  runAfter: {}
                }
              },
              runAfter: {}
            }
          },
          runAfter: {}
        },
        AggregateResults: {
          type: "Function",
          inputs: {
            function: { id: "/sub/rg/app/functions/AggregateResultsFn" },
            body: "@triggerBody()"
          },
          runAfter: { ParallelProcess: ["Succeeded"] }
        }
      }
    })
  ));

  // ── Retry + Catch inside Map inside Parallel ──────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "ParallelWithRetry",
      States: {
        ParallelWithRetry: {
          Type: "Parallel",
          Branches: [
            {
              StartAt: "ProcessBatchA",
              States: {
                ProcessBatchA: {
                  Type: "Map",
                  ItemsPath: "$.batchA",
                  ItemProcessor: {
                    StartAt: "ProcessItemA",
                    States: {
                      ProcessItemA: {
                        Type: "Task",
                        Resource: "arn:aws:states:::lambda:invoke",
                        Parameters: { FunctionName: "ProcessItemAFn", "Payload.$": "$" },
                        Retry: [{ ErrorEquals: ["States.TaskFailed"], IntervalSeconds: 2, MaxAttempts: 3, BackoffRate: 2 }],
                        Catch: [{ ErrorEquals: ["States.ALL"], Next: "HandleItemAError" }],
                        End: true
                      },
                      HandleItemAError: {
                        Type: "Task",
                        Resource: "arn:aws:states:::lambda:invoke",
                        Parameters: { FunctionName: "HandleItemAErrorFn", "Payload.$": "$" },
                        End: true
                      }
                    }
                  },
                  End: true
                }
              }
            },
            {
              StartAt: "ProcessBatchB",
              States: {
                ProcessBatchB: {
                  Type: "Map",
                  ItemsPath: "$.batchB",
                  ItemProcessor: {
                    StartAt: "ProcessItemB",
                    States: {
                      ProcessItemB: {
                        Type: "Task",
                        Resource: "arn:aws:states:::lambda:invoke",
                        Parameters: { FunctionName: "ProcessItemBFn", "Payload.$": "$" },
                        Retry: [{ ErrorEquals: ["States.TaskFailed"], IntervalSeconds: 5, MaxAttempts: 2, BackoffRate: 1 }],
                        Catch: [{ ErrorEquals: ["States.ALL"], Next: "HandleItemBError" }],
                        End: true
                      },
                      HandleItemBError: {
                        Type: "Task",
                        Resource: "arn:aws:states:::lambda:invoke",
                        Parameters: { FunctionName: "HandleItemBErrorFn", "Payload.$": "$" },
                        End: true
                      }
                    }
                  },
                  End: true
                }
              }
            }
          ],
          Catch: [{ ErrorEquals: ["States.ALL"], Next: "HandleParallelError" }],
          Next: "FinalizeResults"
        },
        HandleParallelError: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "HandleParallelErrorFn", "Payload.$": "$" },
          End: true
        },
        FinalizeResults: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "FinalizeResultsFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        ParallelWithRetry: {
          type: "Scope",
          actions: {
            ProcessBatchA: {
              type: "Foreach",
              foreach: "@triggerBody()?['batchA']",
              actions: {
                ProcessItemA: {
                  type: "Function",
                  inputs: {
                    function: { id: "/sub/rg/app/functions/ProcessItemAFn" },
                    body: "@items('ProcessBatchA')"
                  },
                  retryPolicy: { type: "exponential", count: 3, interval: "PT2S", multiplier: 2 },
                  runAfter: {}
                },
                HandleItemAError: {
                  type: "Function",
                  inputs: {
                    function: { id: "/sub/rg/app/functions/HandleItemAErrorFn" },
                    body: "@items('ProcessBatchA')"
                  },
                  runAfter: { ProcessItemA: ["Failed", "TimedOut", "Skipped"] }
                }
              },
              runAfter: {}
            },
            ProcessBatchB: {
              type: "Foreach",
              foreach: "@triggerBody()?['batchB']",
              actions: {
                ProcessItemB: {
                  type: "Function",
                  inputs: {
                    function: { id: "/sub/rg/app/functions/ProcessItemBFn" },
                    body: "@items('ProcessBatchB')"
                  },
                  retryPolicy: { type: "fixed", count: 2, interval: "PT5S" },
                  runAfter: {}
                },
                HandleItemBError: {
                  type: "Function",
                  inputs: {
                    function: { id: "/sub/rg/app/functions/HandleItemBErrorFn" },
                    body: "@items('ProcessBatchB')"
                  },
                  runAfter: { ProcessItemB: ["Failed", "TimedOut", "Skipped"] }
                }
              },
              runAfter: {}
            }
          },
          runAfter: {}
        },
        HandleParallelError: {
          type: "Function",
          inputs: {
            function: { id: "/sub/rg/app/functions/HandleParallelErrorFn" },
            body: "@triggerBody()"
          },
          runAfter: { ParallelWithRetry: ["Failed", "TimedOut", "Skipped"] }
        },
        FinalizeResults: {
          type: "Function",
          inputs: {
            function: { id: "/sub/rg/app/functions/FinalizeResultsFn" },
            body: "@triggerBody()"
          },
          runAfter: { ParallelWithRetry: ["Succeeded"] }
        }
      }
    })
  ));

  // ── Foreach inside If inside Foreach (3-level Azure → AWS) ────────────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        ProcessDepartments: {
          type: "Foreach",
          foreach: "@triggerBody()?['departments']",
          actions: {
            CheckDeptActive: {
              type: "If",
              expression: { and: [{ equals: ["@items('ProcessDepartments')?['active']", true] }] },
              actions: {
                ProcessEmployees: {
                  type: "Foreach",
                  foreach: "@items('ProcessDepartments')?['employees']",
                  actions: {
                    ProcessEmployee: {
                      type: "Function",
                      inputs: {
                        function: { id: "/sub/rg/app/functions/ProcessEmployeeFn" },
                        body: {
                          employee: "@items('ProcessEmployees')",
                          department: "@items('ProcessDepartments')?['name']"
                        }
                      },
                      runAfter: {}
                    }
                  },
                  runAfter: {}
                }
              },
              else: {
                actions: {
                  SkipDepartment: {
                    type: "Function",
                    inputs: {
                      function: { id: "/sub/rg/app/functions/LogSkippedDeptFn" },
                      body: "@items('ProcessDepartments')"
                    },
                    runAfter: {}
                  }
                }
              },
              runAfter: {}
            }
          },
          runAfter: {}
        },
        FinalSummary: {
          type: "Function",
          inputs: {
            function: { id: "/sub/rg/app/functions/FinalSummaryFn" },
            body: "@triggerBody()"
          },
          runAfter: { ProcessDepartments: ["Succeeded"] }
        }
      }
    }),
    j({
      StartAt: "ProcessDepartments",
      States: {
        ProcessDepartments: {
          Type: "Map",
          ItemsPath: "$.departments",
          ItemProcessor: {
            StartAt: "CheckDeptActive",
            States: {
              CheckDeptActive: {
                Type: "Choice",
                Choices: [{ Variable: "$.active", BooleanEquals: true, Next: "ProcessEmployees" }],
                Default: "SkipDepartment"
              },
              ProcessEmployees: {
                Type: "Map",
                ItemsPath: "$.employees",
                ItemProcessor: {
                  StartAt: "ProcessEmployee",
                  States: {
                    ProcessEmployee: {
                      Type: "Task",
                      Resource: "arn:aws:states:::lambda:invoke",
                      Parameters: {
                        FunctionName: "ProcessEmployeeFn",
                        Payload: {
                          "employee.$": "$",
                          "department.$": "$$.Map.Item.Value.name"
                        }
                      },
                      End: true
                    }
                  }
                },
                End: true
              },
              SkipDepartment: {
                Type: "Task",
                Resource: "arn:aws:states:::lambda:invoke",
                Parameters: { FunctionName: "LogSkippedDeptFn", "Payload.$": "$" },
                End: true
              }
            }
          },
          ResultPath: "$.deptResults",
          Next: "FinalSummary"
        },
        FinalSummary: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "FinalSummaryFn", "Payload.$": "$" },
          End: true
        }
      }
    })
  ));

  // ── 4-level: Choice→Parallel→Map→Task ─────────────────────────────────────
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "RouteByType",
      States: {
        RouteByType: {
          Type: "Choice",
          Choices: [
            { Variable: "$.type", StringEquals: "bulk", Next: "BulkParallel" }
          ],
          Default: "SingleProcess"
        },
        BulkParallel: {
          Type: "Parallel",
          Branches: [
            {
              StartAt: "MapRecords",
              States: {
                MapRecords: {
                  Type: "Map",
                  ItemsPath: "$.records",
                  ItemProcessor: {
                    StartAt: "ProcessRecord",
                    States: {
                      ProcessRecord: {
                        Type: "Task",
                        Resource: "arn:aws:states:::lambda:invoke",
                        Parameters: { FunctionName: "ProcessRecordFn", "Payload.$": "$" },
                        End: true
                      }
                    }
                  },
                  End: true
                }
              }
            },
            {
              StartAt: "MapMetadata",
              States: {
                MapMetadata: {
                  Type: "Map",
                  ItemsPath: "$.metadata",
                  ItemProcessor: {
                    StartAt: "IndexMetadata",
                    States: {
                      IndexMetadata: {
                        Type: "Task",
                        Resource: "arn:aws:states:::lambda:invoke",
                        Parameters: { FunctionName: "IndexMetadataFn", "Payload.$": "$" },
                        End: true
                      }
                    }
                  },
                  End: true
                }
              }
            }
          ],
          Next: "MergeResults"
        },
        SingleProcess: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "SingleProcessFn", "Payload.$": "$" },
          Next: "MergeResults"
        },
        MergeResults: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "MergeResultsFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        RouteByType: {
          type: "If",
          expression: { and: [{ equals: ["@triggerBody()?['type']", "bulk"] }] },
          actions: {
            BulkParallel: {
              type: "Scope",
              actions: {
                MapRecords: {
                  type: "Foreach",
                  foreach: "@triggerBody()?['records']",
                  actions: {
                    ProcessRecord: {
                      type: "Function",
                      inputs: {
                        function: { id: "/sub/rg/app/functions/ProcessRecordFn" },
                        body: "@items('MapRecords')"
                      },
                      runAfter: {}
                    }
                  },
                  runAfter: {}
                },
                MapMetadata: {
                  type: "Foreach",
                  foreach: "@triggerBody()?['metadata']",
                  actions: {
                    IndexMetadata: {
                      type: "Function",
                      inputs: {
                        function: { id: "/sub/rg/app/functions/IndexMetadataFn" },
                        body: "@items('MapMetadata')"
                      },
                      runAfter: {}
                    }
                  },
                  runAfter: {}
                }
              },
              runAfter: {}
            }
          },
          else: {
            actions: {
              SingleProcess: {
                type: "Function",
                inputs: {
                  function: { id: "/sub/rg/app/functions/SingleProcessFn" },
                  body: "@triggerBody()"
                },
                runAfter: {}
              }
            }
          },
          runAfter: {}
        },
        MergeResults: {
          type: "Function",
          inputs: {
            function: { id: "/sub/rg/app/functions/MergeResultsFn" },
            body: "@triggerBody()"
          },
          runAfter: { RouteByType: ["Succeeded"] }
        }
      }
    })
  ));

  // ── Scope inside Scope (multi-level Azure grouping) ───────────────────────
  pairs.push(pair("azure-to-aws",
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        OuterScope: {
          type: "Scope",
          actions: {
            InnerScopeA: {
              type: "Scope",
              actions: {
                ValidateInput: {
                  type: "Function",
                  inputs: {
                    function: { id: "/sub/rg/app/functions/ValidateInputFn" },
                    body: "@triggerBody()"
                  },
                  runAfter: {}
                },
                EnrichData: {
                  type: "Function",
                  inputs: {
                    function: { id: "/sub/rg/app/functions/EnrichDataFn" },
                    body: "@body('ValidateInput')"
                  },
                  runAfter: { ValidateInput: ["Succeeded"] }
                }
              },
              runAfter: {}
            },
            InnerScopeB: {
              type: "Scope",
              actions: {
                FetchReference: {
                  type: "Function",
                  inputs: {
                    function: { id: "/sub/rg/app/functions/FetchReferenceFn" },
                    body: "@triggerBody()"
                  },
                  runAfter: {}
                },
                MergeReference: {
                  type: "Function",
                  inputs: {
                    function: { id: "/sub/rg/app/functions/MergeReferenceFn" },
                    body: "@body('FetchReference')"
                  },
                  runAfter: { FetchReference: ["Succeeded"] }
                }
              },
              runAfter: {}
            }
          },
          runAfter: {}
        },
        FinalizeOutput: {
          type: "Function",
          inputs: {
            function: { id: "/sub/rg/app/functions/FinalizeOutputFn" },
            body: "@triggerBody()"
          },
          runAfter: { OuterScope: ["Succeeded"] }
        }
      }
    }),
    j({
      StartAt: "OuterParallel",
      States: {
        OuterParallel: {
          Type: "Parallel",
          Branches: [
            {
              StartAt: "ValidateInput",
              States: {
                ValidateInput: {
                  Type: "Task",
                  Resource: "arn:aws:states:::lambda:invoke",
                  Parameters: { FunctionName: "ValidateInputFn", "Payload.$": "$" },
                  Next: "EnrichData"
                },
                EnrichData: {
                  Type: "Task",
                  Resource: "arn:aws:states:::lambda:invoke",
                  Parameters: { FunctionName: "EnrichDataFn", "Payload.$": "$" },
                  End: true
                }
              }
            },
            {
              StartAt: "FetchReference",
              States: {
                FetchReference: {
                  Type: "Task",
                  Resource: "arn:aws:states:::lambda:invoke",
                  Parameters: { FunctionName: "FetchReferenceFn", "Payload.$": "$" },
                  Next: "MergeReference"
                },
                MergeReference: {
                  Type: "Task",
                  Resource: "arn:aws:states:::lambda:invoke",
                  Parameters: { FunctionName: "MergeReferenceFn", "Payload.$": "$" },
                  End: true
                }
              }
            }
          ],
          ResultPath: "$.parallelResults",
          Next: "FinalizeOutput"
        },
        FinalizeOutput: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "FinalizeOutputFn", "Payload.$": "$" },
          End: true
        }
      }
    })
  ));

  return pairs;
}
