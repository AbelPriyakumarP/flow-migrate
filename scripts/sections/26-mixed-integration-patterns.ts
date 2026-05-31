/**
 * Section 26 – Mixed integration patterns:
 *   Lambda + SQS fan-out, Lambda + EventBridge, S3 trigger chains,
 *   DynamoDB streams pattern, additional Azure→AWS service mappings,
 *   task token / callback patterns
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

export function mixedIntegrationPairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // ── Lambda + SQS fan-out (task then enqueue) ─────────────────────────────
  const lambdaSqsFanoutCases: [string, string, string, string][] = [
    ["ProcessAndQueue",       "ProcessDataFn",     "processed-queue",    "LogFanout"],
    ["TransformAndDispatch",  "TransformFn",       "dispatch-queue",     "ConfirmDispatch"],
    ["ValidateAndRoute",      "ValidateFn",        "routing-queue",      "AckRouted"],
    ["EnrichAndPublish",      "EnrichDataFn",      "enriched-queue",     "MarkPublished"],
    ["ComputeAndBroadcast",   "ComputeResultFn",   "broadcast-queue",    "ConfirmBroadcast"],
    ["FilterAndForward",      "FilterMessagesFn",  "filtered-queue",     "LogForwarded"],
  ];

  for (const [name, fn, queue, logStep] of lambdaSqsFanoutCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: fn, "Payload.$": "$" },
            Next: `Enqueue_${queue.replace("-", "_")}`
          },
          [`Enqueue_${queue.replace("-", "_")}`]: {
            Type: "Task",
            Resource: "arn:aws:states:::sqs:sendMessage",
            Parameters: {
              QueueUrl: `https://sqs.us-east-1.amazonaws.com/123456789012/${queue}`,
              "MessageBody.$": "$"
            },
            ResultPath: "$.sqsResult",
            Next: logStep
          },
          [logStep]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${logStep}Fn`, "Payload.$": "$" },
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
            inputs: { function: { id: `/sub/rg/app/functions/${fn}` }, body: "@triggerBody()" },
            runAfter: {}
          },
          [`Enqueue_${queue.replace("-", "_")}`]: {
            type: "ApiConnection",
            inputs: {
              host: { connection: { name: "@parameters('$connections')['servicebus']['connectionId']" } },
              method: "post",
              path: `/@{encodeURIComponent('${queue}')}/messages`,
              body: { ContentData: `@{base64(string(body('${name}')))}`, ContentType: "application/json" }
            },
            runAfter: { [name]: ["Succeeded"] }
          },
          [logStep]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${logStep}Fn` }, body: "@triggerBody()" },
            runAfter: { [`Enqueue_${queue.replace("-", "_")}`]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── Lambda + EventBridge publish chains ───────────────────────────────────
  const lambdaEventBridgeCases: [string, string, string, string, string][] = [
    ["ProcessOrderAndPublish",  "ProcessOrderFn",  "OrderService", "Order.Processed",   "order-bus"],
    ["AuthAndPublishEvent",     "AuthFn",          "AuthService",  "Auth.Completed",    "auth-bus"],
    ["TransformAndPublishEvent","TransformFn",     "DataService",  "Data.Transformed",  "data-bus"],
    ["ValidateAndPublishEvent", "ValidateFn",      "ValidService", "Valid.Completed",   "valid-bus"],
    ["ComputeAndPublishResult", "ComputeFn",       "ComputeService","Compute.Done",     "compute-bus"],
    ["MigrateAndPublishDone",   "MigrateFn",       "MigrateService","Migration.Done",   "migrate-bus"],
  ];

  for (const [name, fn, source, detailType, busName] of lambdaEventBridgeCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: fn, "Payload.$": "$" },
            Next: `Publish_${detailType.replace(".", "_")}`
          },
          [`Publish_${detailType.replace(".", "_")}`]: {
            Type: "Task",
            Resource: "arn:aws:states:::events:putEvents",
            Parameters: {
              Entries: [{
                EventBusName: `arn:aws:events:us-east-1:123456789012:event-bus/${busName}`,
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
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${fn}` }, body: "@triggerBody()" },
            runAfter: {}
          },
          [`Publish_${detailType.replace(".", "_")}`]: {
            type: "ApiConnection",
            inputs: {
              host: { connection: { name: "@parameters('$connections')['eventgrid']['connectionId']" } },
              method: "post",
              path: `/subscriptions/@{encodeURIComponent(parameters('subscriptionId'))}/resourceGroups/@{encodeURIComponent(parameters('resourceGroupName'))}/providers/Microsoft.EventGrid/topics/@{encodeURIComponent('${busName}')}/events`,
              body: [{ id: "@{guid()}", subject: detailType, data: `@body('${name}')`, eventType: detailType, dataVersion: "1.0", eventTime: "@utcNow()" }]
            },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── S3 read → transform → write chains ───────────────────────────────────
  const s3TransformChainCases: [string, string, string, string][] = [
    ["ReadTransformStore",    "raw-input-bucket",    "ProcessDataFn",    "processed-output-bucket"],
    ["FetchConvertUpload",    "source-bucket",       "ConvertFormatFn",  "destination-bucket"],
    ["ExtractTransformLoad",  "extract-bucket",      "TransformRecordFn","load-bucket"],
    ["ReadEnrichWrite",       "input-data-bucket",   "EnrichDataFn",     "enriched-data-bucket"],
    ["DownloadResizeUpload",  "original-images",     "ResizeImageFn",    "resized-images"],
    ["ReadCompressUpload",    "uncompressed-bucket", "CompressFileFn",   "compressed-bucket"],
  ];

  for (const [name, srcBucket, transformFn, dstBucket] of s3TransformChainCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: `Read_${name}`,
        States: {
          [`Read_${name}`]: {
            Type: "Task",
            Resource: "arn:aws:states:::s3:getObject",
            Parameters: { Bucket: srcBucket, "Key.$": "$.objectKey" },
            ResultPath: "$.fileContent",
            Next: `Transform_${name}`
          },
          [`Transform_${name}`]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: transformFn, "Payload.$": "$" },
            Next: `Write_${name}`
          },
          [`Write_${name}`]: {
            Type: "Task",
            Resource: "arn:aws:states:::s3:putObject",
            Parameters: { Bucket: dstBucket, "Key.$": "$.objectKey", "Body.$": "$.transformedContent" },
            End: true
          }
        }
      }),
      j({
        $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        contentVersion: "1.0.0.0",
        triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
        actions: {
          [`Read_${name}`]: {
            type: "ApiConnection",
            inputs: {
              host: { connection: { name: "@parameters('$connections')['azureblob']['connectionId']" } },
              method: "get",
              path: `/v2/datasets/@{encodeURIComponent(encodeURIComponent('${srcBucket}'))}/files/@{encodeURIComponent(encodeURIComponent(triggerBody()?['objectKey']))}/content`
            },
            runAfter: {}
          },
          [`Transform_${name}`]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${transformFn}` }, body: `@body('Read_${name}')` },
            runAfter: { [`Read_${name}`]: ["Succeeded"] }
          },
          [`Write_${name}`]: {
            type: "ApiConnection",
            inputs: {
              host: { connection: { name: "@parameters('$connections')['azureblob']['connectionId']" } },
              method: "put",
              path: `/v2/datasets/@{encodeURIComponent(encodeURIComponent('${dstBucket}'))}/files/@{encodeURIComponent(encodeURIComponent(triggerBody()?['objectKey']))}`,
              body: `@body('Transform_${name}')?['transformedContent']`
            },
            runAfter: { [`Transform_${name}`]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── waitForTaskToken (callback) patterns ─────────────────────────────────
  const callbackCases: [string, string, string][] = [
    ["WaitForApproval",       "SendApprovalRequest",   "ApprovalResultFn"],
    ["WaitForHumanReview",    "NotifyReviewer",        "ReviewResultFn"],
    ["WaitForExternalSystem", "TriggerExternalProcess","ExternalResultFn"],
    ["WaitForPaymentConfirm", "InitiatePayment",       "PaymentCallbackFn"],
    ["WaitForDocSignature",   "SendDocForSignature",   "SignatureCallbackFn"],
  ];

  for (const [name, notifyFn, callbackFn] of callbackCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke.waitForTaskToken",
            Parameters: {
              FunctionName: notifyFn,
              Payload: { "taskToken.$": "$$.Task.Token", "input.$": "$" }
            },
            TimeoutSeconds: 86400,
            Next: callbackFn
          },
          [callbackFn]: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: `${callbackFn}`, "Payload.$": "$" },
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
              host: { connection: { name: "@parameters('$connections')['azureapimgmt']['connectionId']" } },
              method: "post",
              path: "/callbacks/register",
              body: {
                callbackUrl: "@{listCallbackUrl()}",
                payload: "@triggerBody()"
              }
            },
            runAfter: {}
          },
          [callbackFn]: {
            type: "Function",
            inputs: { function: { id: `/sub/rg/app/functions/${callbackFn}` }, body: "@triggerBody()" },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── Azure→AWS: ApiConnection (Azure ML) → SageMaker ─────────────────────
  const azureMLToSageMakerCases: [string, string, string][] = [
    ["RunClassifierJob",   "classifier-experiment",  "xgboost-classifier"],
    ["RunRegressionJob",   "regression-experiment",  "linear-learner"],
    ["RunClusteringJob",   "clustering-experiment",  "k-means"],
    ["RunAnomalyJob",      "anomaly-experiment",     "randomcutforest"],
    ["RunForecastJob",     "forecast-experiment",    "deepar-forecaster"],
  ];

  for (const [name, experiment, algorithm] of azureMLToSageMakerCases) {
    pairs.push(pair("azure-to-aws",
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
              body: { properties: { jobType: "Command", experimentName: experiment, compute: { instanceType: "Standard_DS3_v2" } } }
            },
            runAfter: {}
          }
        }
      }),
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::sagemaker:createTrainingJob.sync",
            Parameters: {
              TrainingJobName: `${algorithm}-job`,
              AlgorithmSpecification: { TrainingImage: `811284229777.dkr.ecr.us-east-1.amazonaws.com/${algorithm}:latest`, TrainingInputMode: "File" },
              InputDataConfig: [{ ChannelName: "train", DataSource: { S3DataSource: { S3Uri: `s3://ml-data/${experiment}/train`, S3DataType: "S3Prefix" } } }],
              OutputDataConfig: { S3OutputPath: "s3://ml-output/models" },
              ResourceConfig: { InstanceType: "ml.m5.xlarge", InstanceCount: 1, VolumeSizeInGB: 10 },
              RoleArn: "arn:aws:iam::123456789012:role/SageMakerRole",
              StoppingCondition: { MaxRuntimeInSeconds: 3600 }
            },
            End: true
          }
        }
      })
    ));
  }

  // ── Azure→AWS: ADF (Data Factory) pipeline → Glue job ───────────────────
  const adfToGlueCases: [string, string, string][] = [
    ["RunETLPipeline",      "ETLPipeline",           "etl-pipeline-job"],
    ["RunDataCopyPipeline", "DataCopyPipeline",      "data-copy-job"],
    ["RunTransformPipeline","TransformPipeline",     "transform-job"],
    ["RunAggPipeline",      "AggregationPipeline",   "aggregate-job"],
    ["RunMigratePipeline",  "MigrationPipeline",     "migrate-job"],
  ];

  for (const [name, pipelineName, glueJobName] of adfToGlueCases) {
    pairs.push(pair("azure-to-aws",
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
              path: `/subscriptions/@{encodeURIComponent(parameters('subscriptionId'))}/resourceGroups/@{encodeURIComponent(parameters('resourceGroupName'))}/providers/Microsoft.DataFactory/factories/@{encodeURIComponent(parameters('factoryName'))}/pipelines/@{encodeURIComponent('${pipelineName}')}/createRun`,
              body: { parameters: "@triggerBody()" }
            },
            runAfter: {}
          }
        }
      }),
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::glue:startJobRun.sync",
            Parameters: {
              JobName: glueJobName,
              Arguments: { "--trigger.$": "$.trigger", "--run-id.$": "$$.Execution.Name" }
            },
            End: true
          }
        }
      })
    ));
  }

  // ── Azure→AWS: Container Instance → ECS runTask ──────────────────────────
  const aciToEcsCases: [string, string, string][] = [
    ["RunBatchContainer",   "batch-processor",    "BatchCluster"],
    ["RunMLContainer",      "ml-inference",       "MLCluster"],
    ["RunETLContainer",     "etl-worker",         "ETLCluster"],
    ["RunTestContainer",    "test-runner",        "TestCluster"],
    ["RunMigrationContainer","db-migration",      "MigrationCluster"],
    ["RunScanContainer",    "security-scanner",   "SecurityCluster"],
  ];

  for (const [name, containerImage, cluster] of aciToEcsCases) {
    pairs.push(pair("azure-to-aws",
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
              path: `/subscriptions/@{encodeURIComponent(parameters('subscriptionId'))}/resourceGroups/@{encodeURIComponent(parameters('resourceGroupName'))}/providers/Microsoft.ContainerInstance/containerGroups/@{encodeURIComponent('${containerImage}-instance')}`,
              body: {
                location: "eastus",
                properties: {
                  containers: [{ name: containerImage, properties: { image: `myregistry.azurecr.io/${containerImage}:latest`, resources: { requests: { cpu: 2, memoryInGB: 4 } } } }],
                  osType: "Linux",
                  restartPolicy: "Never"
                }
              }
            },
            runAfter: {}
          }
        }
      }),
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::ecs:runTask.sync",
            Parameters: {
              LaunchType: "FARGATE",
              Cluster: `arn:aws:ecs:us-east-1:123456789012:cluster/${cluster}`,
              TaskDefinition: containerImage,
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
      })
    ));
  }

  return pairs;
}
