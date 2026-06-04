/**
 * Section 32 – AI/ML service integrations
 *
 * AWS AI/ML services mapped to Azure equivalents:
 *   Bedrock InvokeModel      → Azure OpenAI (ApiConnection)
 *   Rekognition DetectLabels → Azure Computer Vision Analyze (ApiConnection)
 *   Rekognition DetectText   → Azure Computer Vision OCR (ApiConnection)
 *   Textract AnalyzeDocument → Azure Form Recognizer / Document Intelligence (ApiConnection)
 *   Comprehend DetectSentiment → Azure Text Analytics Sentiment (ApiConnection)
 *   Comprehend DetectEntities → Azure Text Analytics NER (ApiConnection)
 *   Transcribe StartJob      → Azure Speech Services (ApiConnection)
 *   Polly SynthesizeSpeech   → Azure Cognitive Speech TTS (ApiConnection)
 *   Translate TranslateText  → Azure Translator (ApiConnection)
 *   SageMaker InvokeEndpoint → Azure ML Online Endpoint (ApiConnection)
 *
 * References:
 *   https://docs.aws.amazon.com/step-functions/latest/dg/concepts-service-integrations.html
 *   https://learn.microsoft.com/en-us/azure/logic-apps/connectors/
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

export function aiMlServicePairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // ── Amazon Bedrock → Azure OpenAI ─────────────────────────────────────────
  const bedrockCases: [string, string, string, string][] = [
    ["InvokeTextGeneration",  "anthropic.claude-3-sonnet-20240229-v1:0", "GenerateSummary",  "StoreResult"],
    ["InvokeCodeGeneration",  "anthropic.claude-3-haiku-20240307-v1:0",  "GenerateCode",     "ReviewCode"],
    ["InvokeLLMClassifier",   "amazon.titan-text-express-v1",            "ClassifyText",     "RouteByClass"],
    ["InvokeEmbedding",       "amazon.titan-embed-text-v1",              "CreateEmbedding",  "StoreVector"],
    ["InvokeChatCompletion",  "meta.llama2-70b-chat-v1",                 "ChatResponse",     "FormatOutput"],
    ["InvokeAnalysis",        "mistral.mistral-7b-instruct-v0:2",        "AnalyzeContent",   "PublishAnalysis"],
  ];

  for (const [name, modelId, prompt, next] of bedrockCases) {
    const azureModel = modelId.startsWith("anthropic.claude") ? "gpt-4" :
                       modelId.startsWith("amazon.titan-embed") ? "text-embedding-ada-002" :
                       modelId.startsWith("amazon.titan") ? "gpt-35-turbo" : "gpt-4";

    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::bedrock:invokeModel",
            Parameters: {
              ModelId: modelId,
              Body: {
                "prompt.$": `$.${prompt.toLowerCase().replace(/([A-Z])/g, '_$1').toLowerCase()}`,
                max_tokens: 1024,
                temperature: 0.7
              }
            },
            ResultPath: "$.modelOutput",
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
          [name]: {
            type: "ApiConnection",
            inputs: {
              host: { connection: { name: "@parameters('$connections')['openai']['connectionId']" } },
              method: "post",
              path: `/v1/engines/${azureModel}/completions`,
              body: {
                "prompt": "@triggerBody()?['prompt']",
                max_tokens: 1024,
                temperature: 0.7
              }
            },
            runAfter: {}
          },
          [next]: {
            type: "Function",
            inputs: {
              function: { id: `/sub/rg/app/functions/${next}Fn` },
              body: {
                modelOutput: "@body('" + name + "')",
                original: "@triggerBody()"
              }
            },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── Amazon Rekognition → Azure Computer Vision ────────────────────────────
  const rekognitionCases: [string, "labels" | "text" | "faces" | "moderation", string][] = [
    ["DetectImageLabels",     "labels",      "TagImage"],
    ["ExtractTextFromImage",  "text",        "ProcessExtractedText"],
    ["DetectFacesInImage",    "faces",       "ProcessFaceData"],
    ["ModerateImageContent",  "moderation",  "RouteByModerationResult"],
    ["ClassifyProductImage",  "labels",      "UpdateProductCatalog"],
  ];

  for (const [name, operation, next] of rekognitionCases) {
    const awsOperation = operation === "labels" ? "detectLabels" :
                         operation === "text" ? "detectText" :
                         operation === "faces" ? "detectFaces" : "detectModerationLabels";

    const azurePath = operation === "labels" ? "/analyze?visualFeatures=Tags,Objects,Description" :
                      operation === "text" ? "/ocr" :
                      operation === "faces" ? "/analyze?visualFeatures=Faces" : "/analyze?visualFeatures=Adult";

    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: `arn:aws:states:::aws-sdk:rekognition:${awsOperation}`,
            Parameters: {
              "Image": {
                S3Object: {
                  "Bucket.$": "$.imageBucket",
                  "Name.$": "$.imageKey"
                }
              },
              ...(operation === "labels" ? { MaxLabels: 20, MinConfidence: 70 } : {}),
              ...(operation === "moderation" ? { MinConfidence: 60 } : {})
            },
            ResultPath: "$.rekognitionResult",
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
          [name]: {
            type: "ApiConnection",
            inputs: {
              host: { connection: { name: "@parameters('$connections')['cognitiveservicescomputervision']['connectionId']" } },
              method: "post",
              path: azurePath,
              body: {
                url: "@concat('https://', triggerBody()?['imageBucket'], '.blob.core.windows.net/', triggerBody()?['imageKey'])"
              }
            },
            runAfter: {}
          },
          [next]: {
            type: "Function",
            inputs: {
              function: { id: `/sub/rg/app/functions/${next}Fn` },
              body: {
                rekognitionResult: "@body('" + name + "')",
                original: "@triggerBody()"
              }
            },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── Amazon Textract → Azure Form Recognizer ───────────────────────────────
  const textractCases: [string, "analyzeDocument" | "detectDocumentText" | "analyzeExpense" | "analyzeID", string][] = [
    ["ExtractFormFields",    "analyzeDocument",     "StoreFormData"],
    ["ExtractInvoiceFields", "analyzeExpense",       "ProcessInvoice"],
    ["ExtractIDFields",      "analyzeID",            "ValidateIdentity"],
    ["ExtractDocumentText",  "detectDocumentText",   "IndexDocumentText"],
    ["ExtractTableData",     "analyzeDocument",      "ImportTableRows"],
  ];

  for (const [name, operation, next] of textractCases) {
    const azureModelId = operation === "analyzeExpense" ? "prebuilt-invoice" :
                         operation === "analyzeID" ? "prebuilt-idDocument" :
                         operation === "detectDocumentText" ? "prebuilt-read" : "prebuilt-document";

    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: `arn:aws:states:::aws-sdk:textract:${operation}`,
            Parameters: {
              Document: {
                S3Object: {
                  "Bucket.$": "$.documentBucket",
                  "Name.$": "$.documentKey"
                }
              },
              ...(operation === "analyzeDocument" ? {
                FeatureTypes: ["TABLES", "FORMS"]
              } : {})
            },
            ResultPath: "$.textractResult",
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
          [name]: {
            type: "ApiConnection",
            inputs: {
              host: { connection: { name: "@parameters('$connections')['formrecognizer']['connectionId']" } },
              method: "post",
              path: `/formrecognizer/documentModels/${azureModelId}:analyze`,
              queries: { "api-version": "2023-07-31" },
              body: {
                urlSource: "@concat('https://', triggerBody()?['documentBucket'], '.blob.core.windows.net/', triggerBody()?['documentKey'])"
              }
            },
            runAfter: {}
          },
          [next]: {
            type: "Function",
            inputs: {
              function: { id: `/sub/rg/app/functions/${next}Fn` },
              body: {
                textractResult: "@body('" + name + "')",
                original: "@triggerBody()"
              }
            },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── Amazon Comprehend → Azure Text Analytics ──────────────────────────────
  const comprehendCases: [string, "detectSentiment" | "detectEntities" | "detectKeyPhrases" | "detectLanguage" | "detectPiiEntities", string][] = [
    ["AnalyzeSentiment",    "detectSentiment",   "RouteBySentiment"],
    ["ExtractEntities",     "detectEntities",    "IndexEntities"],
    ["ExtractKeyPhrases",   "detectKeyPhrases",  "TagDocument"],
    ["DetectLanguage",      "detectLanguage",    "RouteByLanguage"],
    ["DetectPIIData",       "detectPiiEntities", "RedactPII"],
    ["ClassifyFeedback",    "detectSentiment",   "StoreFeedback"],
  ];

  for (const [name, operation, next] of comprehendCases) {
    const azureOperation = operation === "detectSentiment" ? "sentiment" :
                           operation === "detectEntities" ? "entities/recognition/general" :
                           operation === "detectKeyPhrases" ? "keyPhrases" :
                           operation === "detectLanguage" ? "languages" : "entities/recognition/pii";

    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: `arn:aws:states:::aws-sdk:comprehend:${operation}`,
            Parameters: {
              "Text.$": "$.text",
              "LanguageCode.$": "$.languageCode"
            },
            ResultPath: "$.comprehendResult",
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
          [name]: {
            type: "ApiConnection",
            inputs: {
              host: { connection: { name: "@parameters('$connections')['cognitiveservicestextanalytics']['connectionId']" } },
              method: "post",
              path: `/text/analytics/v3.1/${azureOperation}`,
              body: {
                documents: [{
                  id: "1",
                  language: "@triggerBody()?['languageCode']",
                  text: "@triggerBody()?['text']"
                }]
              }
            },
            runAfter: {}
          },
          [next]: {
            type: "Function",
            inputs: {
              function: { id: `/sub/rg/app/functions/${next}Fn` },
              body: {
                comprehendResult: "@body('" + name + "')",
                original: "@triggerBody()"
              }
            },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── Amazon Transcribe → Azure Speech Services ─────────────────────────────
  const transcribeCases: [string, string, string][] = [
    ["TranscribeCustomerCall",  "customer-audio-bucket", "AnalyzeTranscript"],
    ["TranscribeMeetingAudio",  "meetings-bucket",       "SummarizeMeeting"],
    ["TranscribeVoiceMessage",  "voicemail-bucket",      "ProcessVoicemail"],
  ];

  for (const [name, bucket, next] of transcribeCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::aws-sdk:transcribe:startTranscriptionJob",
            Parameters: {
              "TranscriptionJobName.$": "States.Format('job-{}', States.UUID())",
              "Media": {
                "MediaFileUri.$": "States.Format('s3://" + bucket + "/{}', $.audioKey)"
              },
              "MediaFormat.$": "$.audioFormat",
              "LanguageCode.$": "$.languageCode",
              "OutputBucketName": `${bucket}-transcripts`
            },
            ResultPath: "$.transcribeJob",
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
          [name]: {
            type: "ApiConnection",
            inputs: {
              host: { connection: { name: "@parameters('$connections')['cognitiveservicesspeech']['connectionId']" } },
              method: "post",
              path: "/speechtotext/v3.1/transcriptions",
              body: {
                displayName: "@concat('transcription-', utcNow())",
                locale: "@triggerBody()?['languageCode']",
                contentUrls: [
                  "@concat('https://", bucket, ".blob.core.windows.net/', triggerBody()?['audioKey'])"
                ],
                properties: {
                  wordLevelTimestampsEnabled: true
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
                transcribeJob: "@body('" + name + "')",
                original: "@triggerBody()"
              }
            },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── Amazon Translate → Azure Translator ──────────────────────────────────
  const translateCases: [string, string, string, string][] = [
    ["TranslateToSpanish",  "en",  "es",  "PublishTranslated"],
    ["TranslateToFrench",   "en",  "fr",  "PublishTranslated"],
    ["TranslateToJapanese", "en",  "ja",  "PublishTranslated"],
    ["TranslateToGerman",   "en",  "de",  "PublishTranslated"],
    ["TranslateToArabic",   "en",  "ar",  "PublishTranslated"],
  ];

  for (const [name, sourceLang, targetLang, next] of translateCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::aws-sdk:translate:translateText",
            Parameters: {
              "Text.$": "$.text",
              SourceLanguageCode: sourceLang,
              TargetLanguageCode: targetLang
            },
            ResultPath: "$.translationResult",
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
          [name]: {
            type: "ApiConnection",
            inputs: {
              host: { connection: { name: "@parameters('$connections')['translatorv2']['connectionId']" } },
              method: "post",
              path: "/translate",
              queries: {
                from: sourceLang,
                to: targetLang,
                "api-version": "3.0"
              },
              body: [{ Text: "@triggerBody()?['text']" }]
            },
            runAfter: {}
          },
          [next]: {
            type: "Function",
            inputs: {
              function: { id: `/sub/rg/app/functions/${next}Fn` },
              body: {
                translationResult: "@body('" + name + "')",
                original: "@triggerBody()"
              }
            },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── SageMaker InvokeEndpoint → Azure ML Online Endpoint ───────────────────
  const sagemakerInferenceCases: [string, string, string][] = [
    ["ScoreCreditRisk",   "credit-risk-endpoint",  "RouteByRiskScore"],
    ["DetectFraud",       "fraud-detection-ep",    "FlagOrApprove"],
    ["RecommendProducts", "recommender-endpoint",  "PersonalizeResults"],
    ["PredictChurn",      "churn-predictor-ep",    "TriggerRetention"],
    ["ClassifyImage",     "image-classifier-ep",   "LabelAndStore"],
  ];

  for (const [name, endpointName, next] of sagemakerInferenceCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::aws-sdk:sagemakerruntime:invokeEndpoint",
            Parameters: {
              EndpointName: endpointName,
              ContentType: "application/json",
              "Body.$": "States.JsonToString($.features)"
            },
            ResultPath: "$.inferenceResult",
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
          [name]: {
            type: "Http",
            inputs: {
              method: "POST",
              uri: `https://<workspace>.eastus.inference.ml.azure.com/endpoints/${endpointName}/score`,
              headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer @{parameters('azureMLApiKey')}"
              },
              body: "@triggerBody()?['features']"
            },
            runAfter: {}
          },
          [next]: {
            type: "Function",
            inputs: {
              function: { id: `/sub/rg/app/functions/${next}Fn` },
              body: {
                inferenceResult: "@body('" + name + "')",
                original: "@triggerBody()"
              }
            },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  // ── AWS CodeBuild → Azure DevOps Pipeline ────────────────────────────────
  const codeBuildCases: [string, string, string][] = [
    ["BuildAndTest",      "my-app-build",      "DeployToStaging"],
    ["RunIntegrationTests","integration-tests", "ReportTestResults"],
    ["BuildDockerImage",   "docker-build",      "PushToRegistry"],
    ["RunSecurityScan",    "security-scan",     "ReviewFindings"],
  ];

  for (const [name, projectName, next] of codeBuildCases) {
    pairs.push(pair("aws-to-azure",
      j({
        StartAt: name,
        States: {
          [name]: {
            Type: "Task",
            Resource: "arn:aws:states:::aws-sdk:codebuild:startBuild",
            Parameters: {
              ProjectName: projectName,
              EnvironmentVariablesOverride: [{
                Name: "COMMIT_ID",
                "Value.$": "$.commitId",
                Type: "PLAINTEXT"
              }]
            },
            ResultPath: "$.buildResult",
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
          [name]: {
            type: "Http",
            inputs: {
              method: "POST",
              uri: "https://dev.azure.com/<org>/<project>/_apis/build/builds?api-version=7.1",
              headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer @{parameters('azureDevOpsToken')}"
              },
              body: {
                definition: { id: 1 },
                parameters: "@string(createObject('commitId', triggerBody()?['commitId']))"
              }
            },
            runAfter: {}
          },
          [next]: {
            type: "Function",
            inputs: {
              function: { id: `/sub/rg/app/functions/${next}Fn` },
              body: {
                buildResult: "@body('" + name + "')",
                original: "@triggerBody()"
              }
            },
            runAfter: { [name]: ["Succeeded"] }
          }
        }
      })
    ));
  }

  return pairs;
}
