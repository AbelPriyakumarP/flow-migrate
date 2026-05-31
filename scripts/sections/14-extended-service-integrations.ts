/**
 * Section 14 – Extended service integrations:
 *   ECS, Glue, SageMaker, Bedrock, EventBridge, Athena, Step Functions nested,
 *   S3 extended ops, and reverse direction Azure ApiConnection → AWS SDK ARNs
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

export function extendedServicePairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // ── ECS runTask variations ───────────────────────────────────────────────
  const ecsCases: [string, string, string][] = [
    ["RunDataProcessor",  "data-processor-task",  "DataProcessorCluster"],
    ["RunReportJob",      "report-generator-task", "ReportCluster"],
    ["RunMigrationTask",  "migration-task",        "MigrationCluster"],
    ["RunBatchImport",    "batch-import-task",     "BatchCluster"],
    ["RunAuditJob",       "audit-task",            "AuditCluster"],
    ["RunMLInference",    "ml-inference-task",     "MLCluster"],
    ["RunETLJob",         "etl-task",              "ETLCluster"],
    ["RunCleanupTask",    "cleanup-task",          "MaintenanceCluster"],
  ];

  for (const [name, taskDef, cluster] of ecsCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::ecs:runTask.sync",
            Parameters: {
              LaunchType: "FARGATE",
              Cluster: `arn:aws:ecs:us-east-1:123456789012:cluster/${cluster}`,
              TaskDefinition: taskDef,
              NetworkConfiguration: {
                AwsvpcConfiguration: {
                  Subnets: ["subnet-abc123"],
                  SecurityGroups: ["sg-xyz789"],
                  AssignPublicIp: "DISABLED"
                }
              }
            },
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
            type: "ApiConnection",
            inputs: {
              host: { connection: { name: "@parameters('$connections')['aci']['connectionId']" } },
              method: "put",
              path: `/subscriptions/@{encodeURIComponent(parameters('subscriptionId'))}/resourceGroups/@{encodeURIComponent(parameters('resourceGroupName'))}/providers/Microsoft.ContainerInstance/containerGroups/@{encodeURIComponent('${cluster}-${taskDef}')}`,
              body: {
                location: "eastus",
                properties: {
                  containers: [{ name: taskDef, properties: { image: taskDef, resources: { requests: { cpu: 1, memoryInGB: 2 } } } }],
                  osType: "Linux",
                  restartPolicy: "Never"
                }
              }
            },
            runAfter: {}
          }
        }
      })
    ));
  }

  // ── Glue startJobRun variations ──────────────────────────────────────────
  const glueCases: [string, string, Record<string, string>][] = [
    ["RunETLPipeline",    "etl-pipeline-job",    { "--input-path": "s3://bucket/input", "--output-path": "s3://bucket/output" }],
    ["RunDataCatalog",    "catalog-job",         { "--database": "main_db", "--table": "events" }],
    ["RunTransformJob",   "transform-job",       { "--format": "parquet", "--compression": "snappy" }],
    ["RunCleanseJob",     "cleanse-job",         { "--rules-path": "s3://rules/cleanse.json" }],
    ["RunAggregateJob",   "aggregate-job",       { "--window": "1h", "--metric": "revenue" }],
    ["RunPartitionJob",   "partition-job",       { "--partition-key": "date", "--prefix": "year=" }],
  ];

  for (const [name, jobName, args] of glueCases) {
    const adfPipelineName = jobName.replace("-job", "Pipeline").replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::glue:startJobRun.sync",
            Parameters: {
              JobName: jobName,
              Arguments: args
            },
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
            type: "ApiConnection",
            inputs: {
              host: { connection: { name: "@parameters('$connections')['azuredatafactory']['connectionId']" } },
              method: "post",
              path: `/subscriptions/@{encodeURIComponent(parameters('subscriptionId'))}/resourceGroups/@{encodeURIComponent(parameters('resourceGroupName'))}/providers/Microsoft.DataFactory/factories/@{encodeURIComponent(parameters('factoryName'))}/pipelines/@{encodeURIComponent('${adfPipelineName}')}/createRun`,
              body: { parameters: args }
            },
            runAfter: {}
          }
        }
      })
    ));
  }

  // ── SageMaker createTrainingJob variations ──────────────────────────────
  const sageMakerCases: [string, string, string][] = [
    ["TrainClassifier",   "xgboost-classifier",  "s3://ml-data/training"],
    ["TrainForecaster",   "deepar-forecaster",   "s3://ml-data/timeseries"],
    ["TrainNLPModel",     "blazingtext-nlp",     "s3://ml-data/text"],
    ["TrainImageModel",   "resnet-image",        "s3://ml-data/images"],
    ["TrainAnomalyModel", "randomcutforest",     "s3://ml-data/metrics"],
  ];

  for (const [name, algorithmName, s3Path] of sageMakerCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::sagemaker:createTrainingJob.sync",
            Parameters: {
              TrainingJobName: `${algorithmName}-job`,
              AlgorithmSpecification: {
                TrainingImage: `811284229777.dkr.ecr.us-east-1.amazonaws.com/${algorithmName}:latest`,
                TrainingInputMode: "File"
              },
              InputDataConfig: [{ ChannelName: "train", DataSource: { S3DataSource: { S3Uri: s3Path, S3DataType: "S3Prefix" } } }],
              OutputDataConfig: { S3OutputPath: "s3://ml-output/models" },
              ResourceConfig: { InstanceType: "ml.m5.xlarge", InstanceCount: 1, VolumeSizeInGB: 10 },
              RoleArn: "arn:aws:iam::123456789012:role/SageMakerRole",
              StoppingCondition: { MaxRuntimeInSeconds: 3600 }
            },
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
            type: "ApiConnection",
            inputs: {
              host: { connection: { name: "@parameters('$connections')['azureml']['connectionId']" } },
              method: "post",
              path: `/subscriptions/@{encodeURIComponent(parameters('subscriptionId'))}/resourceGroups/@{encodeURIComponent(parameters('resourceGroupName'))}/providers/Microsoft.MachineLearningServices/workspaces/@{encodeURIComponent(parameters('workspaceName'))}/jobs`,
              body: {
                properties: {
                  jobType: "Command",
                  experimentName: algorithmName,
                  inputs: { train_data: { jobInputType: "uri_folder", uri: s3Path } },
                  compute: { instanceType: "Standard_DS3_v2" }
                }
              }
            },
            runAfter: {}
          }
        }
      })
    ));
  }

  // ── EventBridge putEvents variations ────────────────────────────────────
  const eventBridgeCases: [string, string, string, string][] = [
    ["PublishOrderEvent",   "OrderService",     "Order.Created",     "order-event-bus"],
    ["PublishPaymentEvent", "PaymentService",   "Payment.Processed", "payment-event-bus"],
    ["PublishUserEvent",    "UserService",      "User.Registered",   "user-event-bus"],
    ["PublishInventory",    "InventoryService", "Inventory.Updated", "inventory-event-bus"],
    ["PublishShipment",     "ShipmentService",  "Shipment.Sent",     "shipment-event-bus"],
    ["PublishAlert",        "AlertService",     "Alert.Triggered",   "default"],
    ["PublishAudit",        "AuditService",     "Audit.Recorded",    "audit-event-bus"],
    ["PublishMetric",       "MetricService",    "Metric.Captured",   "monitoring-event-bus"],
  ];

  for (const [name, source, detailType, busName] of eventBridgeCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::events:putEvents",
            Parameters: {
              Entries: [{
                EventBusName: busName === "default" ? "default" : `arn:aws:events:us-east-1:123456789012:event-bus/${busName}`,
                Source: source.toLowerCase(),
                DetailType: detailType,
                "Detail.$": "$"
              }]
            },
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
            type: "ApiConnection",
            inputs: {
              host: { connection: { name: "@parameters('$connections')['eventgrid']['connectionId']" } },
              method: "post",
              path: `/subscriptions/@{encodeURIComponent(parameters('subscriptionId'))}/resourceGroups/@{encodeURIComponent(parameters('resourceGroupName'))}/providers/Microsoft.EventGrid/topics/@{encodeURIComponent('${busName}')}/events`,
              body: [{
                id: "@{guid()}",
                subject: detailType,
                data: "@triggerBody()",
                eventType: detailType,
                dataVersion: "1.0",
                eventTime: "@utcNow()"
              }]
            },
            runAfter: {}
          }
        }
      })
    ));
  }

  // ── Nested Step Functions (states:startExecution) variations ────────────
  const nestedSFCases: [string, string, string][] = [
    ["StartOrderWorkflow",    "OrderProcessingStateMachine",    "arn:aws:states:us-east-1:123456789012:stateMachine:OrderProcessingStateMachine"],
    ["StartPaymentWorkflow",  "PaymentProcessingStateMachine",  "arn:aws:states:us-east-1:123456789012:stateMachine:PaymentProcessingStateMachine"],
    ["StartReportWorkflow",   "ReportGenerationStateMachine",   "arn:aws:states:us-east-1:123456789012:stateMachine:ReportGenerationStateMachine"],
    ["StartApprovalWorkflow", "ApprovalStateMachine",           "arn:aws:states:us-east-1:123456789012:stateMachine:ApprovalStateMachine"],
    ["StartOnboardingFlow",   "UserOnboardingStateMachine",     "arn:aws:states:us-east-1:123456789012:stateMachine:UserOnboardingStateMachine"],
  ];

  for (const [name, smName, smArn] of nestedSFCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::states:startExecution.sync:2",
            Parameters: {
              StateMachineArn: smArn,
              "Input.$": "$"
            },
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
            type: "Workflow",
            inputs: {
              host: {
                triggerName: "manual",
                workflow: { id: `/subscriptions/@{parameters('subscriptionId')}/resourceGroups/@{parameters('resourceGroupName')}/providers/Microsoft.Logic/workflows/${smName}` }
              },
              body: "@triggerBody()"
            },
            runAfter: {}
          }
        }
      })
    ));
  }

  // ── S3 extended operations ───────────────────────────────────────────────
  const s3DeleteCases: [string, string, string][] = [
    ["DeleteTempFile",      "temp-files-bucket",  "$.tempFileKey"],
    ["DeleteExpiredCache",  "cache-bucket",       "$.cacheKey"],
    ["DeleteOldBackup",     "backup-bucket",      "$.backupKey"],
    ["DeleteProcessedFile", "processed-bucket",   "$.processedKey"],
  ];

  for (const [name, bucket, keyPath] of s3DeleteCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::s3:deleteObject",
            Parameters: {
              Bucket: bucket,
              "Key.$": keyPath
            },
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
            type: "ApiConnection",
            inputs: {
              host: { connection: { name: "@parameters('$connections')['azureblob']['connectionId']" } },
              method: "delete",
              path: `/v2/datasets/@{encodeURIComponent(encodeURIComponent('${bucket}'))}/files/@{encodeURIComponent(encodeURIComponent(triggerBody()?['${keyPath.replace("$.", "")}']))}`
            },
            runAfter: {}
          }
        }
      })
    ));
  }

  // ── S3 copyObject ────────────────────────────────────────────────────────
  const s3CopyCases: [string, string, string, string][] = [
    ["CopyToArchive",    "source-bucket", "archive-bucket",    "$.fileName"],
    ["CopyToProcessed",  "raw-bucket",    "processed-bucket",  "$.objectKey"],
    ["BackupOriginal",   "active-bucket", "backup-bucket",     "$.fileKey"],
  ];

  for (const [name, srcBucket, dstBucket, keyPath] of s3CopyCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::s3:copyObject",
            Parameters: {
              Bucket: dstBucket,
              "Key.$": keyPath,
              CopySource: `${srcBucket}/@{triggerBody()?['${keyPath.replace("$.", "")}']}`
            },
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
            type: "ApiConnection",
            inputs: {
              host: { connection: { name: "@parameters('$connections')['azureblob']['connectionId']" } },
              method: "post",
              path: `/v2/datasets/@{encodeURIComponent(encodeURIComponent('${dstBucket}'))}/copyFile`,
              body: {
                source: `https://${srcBucket}.blob.core.windows.net/@{triggerBody()?['${keyPath.replace("$.", "")}']}`
              }
            },
            runAfter: {}
          }
        }
      })
    ));
  }

  // ── DynamoDB updateItem variations ───────────────────────────────────────
  const dynamoUpdateCases: [string, string, string, string][] = [
    ["UpdateOrderStatus",  "Orders",   "orderId",  "status"],
    ["UpdateUserProfile",  "Users",    "userId",   "profileData"],
    ["UpdateInventoryQty", "Inventory","itemId",   "quantity"],
    ["UpdatePaymentState", "Payments", "paymentId","state"],
    ["UpdateSessionData",  "Sessions", "sessionId","lastActivity"],
    ["UpdateDeviceStatus", "Devices",  "deviceId", "status"],
  ];

  for (const [name, table, keyField, updateField] of dynamoUpdateCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::dynamodb:updateItem",
            Parameters: {
              TableName: table,
              Key: { [keyField]: { "S.$": `$.${keyField}` } },
              UpdateExpression: `SET ${updateField} = :val, updatedAt = :ts`,
              ExpressionAttributeValues: {
                ":val": { "S.$": `$.${updateField}` },
                ":ts": { "S.$": "$$.Execution.StartTime" }
              }
            },
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
            type: "ApiConnection",
            inputs: {
              host: { connection: { name: "@parameters('$connections')['documentdb']['connectionId']" } },
              method: "put",
              path: `/dbs/@{encodeURIComponent('${table}')}/colls/@{encodeURIComponent('${table.toLowerCase()}')}/docs/@{encodeURIComponent(triggerBody()?['${keyField}'])}`,
              body: {
                id: `@triggerBody()?['${keyField}']`,
                [keyField]: `@triggerBody()?['${keyField}']`,
                [updateField]: `@triggerBody()?['${updateField}']`,
                updatedAt: "@utcNow()"
              }
            },
            runAfter: {}
          }
        }
      })
    ));
  }

  // ── Athena startQueryExecution ───────────────────────────────────────────
  const athenaCases: [string, string, string][] = [
    ["RunDailySummary",  "SELECT * FROM orders WHERE date = current_date", "analytics-output"],
    ["RunUserReport",    "SELECT user_id, count(*) as events FROM events GROUP BY user_id", "reports-output"],
    ["RunRevenueQuery",  "SELECT sum(amount) as total FROM payments WHERE status = 'completed'", "finance-output"],
    ["RunInventoryQuery","SELECT product_id, quantity FROM inventory WHERE quantity < 10", "ops-output"],
  ];

  for (const [name, query, outputBucket] of athenaCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::athena:startQueryExecution.sync",
            Parameters: {
              QueryString: query,
              ResultConfiguration: { OutputLocation: `s3://${outputBucket}/results/` }
            },
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
            type: "ApiConnection",
            inputs: {
              host: { connection: { name: "@parameters('$connections')['azuredataexplorer']['connectionId']" } },
              method: "post",
              path: "/query",
              body: {
                db: outputBucket.replace("-output", ""),
                csl: query
              }
            },
            runAfter: {}
          }
        }
      })
    ));
  }

  return pairs;
}
