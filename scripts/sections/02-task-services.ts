/**
 * Section 02 – Task states: DynamoDB / SNS / SQS / EventBridge / S3
 *
 * Sources:
 *  AWS DynamoDB:    https://docs.aws.amazon.com/step-functions/latest/dg/connect-ddb.html
 *  AWS SNS:         https://docs.aws.amazon.com/step-functions/latest/dg/connect-sns.html
 *  AWS SQS:         https://docs.aws.amazon.com/step-functions/latest/dg/connect-sqs.html
 *  AWS EventBridge: https://docs.aws.amazon.com/step-functions/latest/dg/connect-eventbridge.html
 *  AWS S3:          https://docs.aws.amazon.com/step-functions/latest/dg/connect-s3.html
 *  Azure:           https://learn.microsoft.com/en-us/azure/connectors/built-in
 *                   https://learn.microsoft.com/en-us/azure/connectors/managed
 */

import { TrainingPair, pair, j } from "../generate-training-pairs";

export function taskServicePairs(): TrainingPair[] {
  const pairs: TrainingPair[] = [];

  // ════════════════════════════════════════════════════════════
  // DynamoDB
  // ════════════════════════════════════════════════════════════

  // 1. DynamoDB GetItem → Azure Table Storage / Cosmos DB read
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "GetItem",
      States: {
        GetItem: {
          Type: "Task",
          Resource: "arn:aws:states:::dynamodb:getItem",
          Parameters: {
            TableName: "Orders",
            Key: { orderId: { "S.$": "$.orderId" } }
          },
          ResultPath: "$.orderRecord",
          Next: "ProcessOrder"
        },
        ProcessOrder: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ProcessOrderFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        GetItem: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['documentdb']['connectionId']" } },
            method: "post",
            path: "/dbs/@{encodeURIComponent('Orders')}/colls/@{encodeURIComponent('orders')}/docs/query",
            body: {
              query: "SELECT * FROM c WHERE c.orderId = @orderId",
              parameters: [{ name: "@orderId", value: "@triggerBody()?['orderId']" }]
            }
          },
          runAfter: {}
        },
        ProcessOrder: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ProcessOrderFn" },
            body: {
              original: "@triggerBody()",
              orderRecord: "@body('GetItem')?['Documents']?[0]"
            }
          },
          runAfter: { GetItem: ["Succeeded"] }
        }
      }
    })
  ));

  // 2. DynamoDB PutItem → Azure Cosmos DB create document
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "PutItem",
      States: {
        PutItem: {
          Type: "Task",
          Resource: "arn:aws:states:::dynamodb:putItem",
          Parameters: {
            TableName: "Users",
            Item: {
              userId: { "S.$": "$.userId" },
              email: { "S.$": "$.email" },
              createdAt: { "S.$": "$$.Execution.StartTime" },
              status: { S: "active" }
            }
          },
          ResultPath: null,
          Next: "NotifyUser"
        },
        NotifyUser: {
          Type: "Task",
          Resource: "arn:aws:states:::sns:publish",
          Parameters: {
            TopicArn: "arn:aws:sns:us-east-1:123456789012:UserCreatedTopic",
            "Message.$": "$.email"
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
        PutItem: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['documentdb']['connectionId']" } },
            method: "post",
            path: "/dbs/@{encodeURIComponent('Users')}/colls/@{encodeURIComponent('users')}/docs",
            body: {
              id: "@triggerBody()?['userId']",
              userId: "@triggerBody()?['userId']",
              email: "@triggerBody()?['email']",
              createdAt: "@utcNow()",
              status: "active"
            }
          },
          runAfter: {}
        },
        NotifyUser: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['servicebus']['connectionId']" } },
            method: "post",
            path: "/@{encodeURIComponent('UserCreatedTopic')}/messages",
            body: { ContentData: "@{base64(triggerBody()?['email'])}" }
          },
          runAfter: { PutItem: ["Succeeded"] }
        }
      }
    })
  ));

  // 3. DynamoDB UpdateItem → Azure Cosmos DB replace document
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "UpdateItem",
      States: {
        UpdateItem: {
          Type: "Task",
          Resource: "arn:aws:states:::dynamodb:updateItem",
          Parameters: {
            TableName: "Orders",
            Key: { orderId: { "S.$": "$.orderId" } },
            UpdateExpression: "SET #status = :newStatus, updatedAt = :ts",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: {
              ":newStatus": { "S.$": "$.newStatus" },
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
        Get_Existing_Order: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['documentdb']['connectionId']" } },
            method: "get",
            path: "/dbs/@{encodeURIComponent('Orders')}/colls/@{encodeURIComponent('orders')}/docs/@{encodeURIComponent(triggerBody()?['orderId'])}"
          },
          runAfter: {}
        },
        UpdateItem: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['documentdb']['connectionId']" } },
            method: "put",
            path: "/dbs/@{encodeURIComponent('Orders')}/colls/@{encodeURIComponent('orders')}/docs/@{encodeURIComponent(triggerBody()?['orderId'])}",
            body: {
              "id": "@triggerBody()?['orderId']",
              "orderId": "@triggerBody()?['orderId']",
              "status": "@triggerBody()?['newStatus']",
              "updatedAt": "@utcNow()"
            }
          },
          runAfter: { Get_Existing_Order: ["Succeeded"] }
        }
      }
    })
  ));

  // 4. DynamoDB DeleteItem → Azure Cosmos DB delete document
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "DeleteItem",
      States: {
        DeleteItem: {
          Type: "Task",
          Resource: "arn:aws:states:::dynamodb:deleteItem",
          Parameters: {
            TableName: "Sessions",
            Key: { sessionId: { "S.$": "$.sessionId" } }
          },
          ResultPath: null,
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        DeleteItem: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['documentdb']['connectionId']" } },
            method: "delete",
            path: "/dbs/@{encodeURIComponent('Sessions')}/colls/@{encodeURIComponent('sessions')}/docs/@{encodeURIComponent(triggerBody()?['sessionId'])}"
          },
          runAfter: {}
        }
      }
    })
  ));

  // 5. DynamoDB GetItem with Retry and Catch
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "GetItemWithRetry",
      States: {
        GetItemWithRetry: {
          Type: "Task",
          Resource: "arn:aws:states:::dynamodb:getItem",
          Parameters: {
            TableName: "Products",
            Key: { productId: { "S.$": "$.productId" } },
            ConsistentRead: true
          },
          Retry: [{ ErrorEquals: ["States.ALL"], IntervalSeconds: 1, MaxAttempts: 3, BackoffRate: 2 }],
          Catch: [{ ErrorEquals: ["States.ALL"], Next: "HandleDBError" }],
          ResultPath: "$.product",
          End: true
        },
        HandleDBError: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "DBErrorHandlerFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        GetItemWithRetry: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['documentdb']['connectionId']" } },
            method: "get",
            path: "/dbs/@{encodeURIComponent('Products')}/colls/@{encodeURIComponent('products')}/docs/@{encodeURIComponent(triggerBody()?['productId'])}"
          },
          retryPolicy: { type: "exponential", count: 3, interval: "PT1S", minimumInterval: "PT1S", maximumInterval: "PT1H" },
          runAfter: {}
        },
        HandleDBError: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/DBErrorHandlerFn" },
            body: "@triggerBody()"
          },
          runAfter: { GetItemWithRetry: ["Failed", "TimedOut"] }
        }
      }
    })
  ));

  // ════════════════════════════════════════════════════════════
  // SNS
  // ════════════════════════════════════════════════════════════

  // 6. SNS Publish (simple notification)
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "SendNotification",
      States: {
        SendNotification: {
          Type: "Task",
          Resource: "arn:aws:states:::sns:publish",
          Parameters: {
            TopicArn: "arn:aws:sns:us-east-1:123456789012:OrderAlertsTopic",
            Subject: "Order Placed",
            "Message.$": "States.Format('Order {} has been placed', $.orderId)"
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
        SendNotification: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['servicebus']['connectionId']" } },
            method: "post",
            path: "/@{encodeURIComponent('OrderAlertsTopic')}/messages",
            body: {
              ContentData: "@{base64(concat('Order ', triggerBody()?['orderId'], ' has been placed'))}",
              ContentType: "application/json",
              Label: "Order Placed"
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // 7. SNS Publish with JSON message attributes
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "PublishEvent",
      States: {
        PublishEvent: {
          Type: "Task",
          Resource: "arn:aws:states:::sns:publish",
          Parameters: {
            TopicArn: "arn:aws:sns:us-east-1:123456789012:EventsTopic",
            Message: {
              "eventType.$": "$.eventType",
              "payload.$": "$",
              "timestamp.$": "$$.Execution.StartTime"
            },
            MessageAttributes: {
              eventType: { DataType: "String", "StringValue.$": "$.eventType" }
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
        PublishEvent: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['eventgrid']['connectionId']" } },
            method: "post",
            path: "/@{encodeURIComponent(parameters('eventGridTopic'))}/events",
            body: [{
              id: "@{guid()}",
              eventType: "@triggerBody()?['eventType']",
              subject: "@triggerBody()?['eventType']",
              eventTime: "@utcNow()",
              data: "@triggerBody()",
              dataVersion: "1.0"
            }]
          },
          runAfter: {}
        }
      }
    })
  ));

  // 8. SNS Publish with retry
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "NotifyWithRetry",
      States: {
        NotifyWithRetry: {
          Type: "Task",
          Resource: "arn:aws:states:::sns:publish",
          Parameters: {
            TopicArn: "arn:aws:sns:us-east-1:123456789012:AlertsTopic",
            "Message.$": "$.alertMessage"
          },
          Retry: [{ ErrorEquals: ["States.ALL"], IntervalSeconds: 2, MaxAttempts: 5, BackoffRate: 2 }],
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        NotifyWithRetry: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['servicebus']['connectionId']" } },
            method: "post",
            path: "/@{encodeURIComponent('AlertsTopic')}/messages",
            body: { ContentData: "@{base64(triggerBody()?['alertMessage'])}", ContentType: "text/plain" }
          },
          retryPolicy: { type: "exponential", count: 5, interval: "PT2S", minimumInterval: "PT2S", maximumInterval: "PT1H" },
          runAfter: {}
        }
      }
    })
  ));

  // ════════════════════════════════════════════════════════════
  // SQS
  // ════════════════════════════════════════════════════════════

  // 9. SQS SendMessage (standard queue)
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "EnqueueJob",
      States: {
        EnqueueJob: {
          Type: "Task",
          Resource: "arn:aws:states:::sqs:sendMessage",
          Parameters: {
            QueueUrl: "https://sqs.us-east-1.amazonaws.com/123456789012/ProcessingQueue",
            MessageBody: {
              "jobId.$": "$.jobId",
              "payload.$": "$"
            }
          },
          Next: "WaitForResult"
        },
        WaitForResult: {
          Type: "Wait",
          Seconds: 30,
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        EnqueueJob: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['servicebus']['connectionId']" } },
            method: "post",
            path: "/@{encodeURIComponent('ProcessingQueue')}/messages",
            body: {
              ContentData: "@{base64(string(createObject('jobId', triggerBody()?['jobId'], 'payload', triggerBody())))}",
              ContentType: "application/json"
            }
          },
          runAfter: {}
        },
        WaitForResult: {
          type: "Wait",
          inputs: { interval: { unit: "Second", count: 30 } },
          runAfter: { EnqueueJob: ["Succeeded"] }
        }
      }
    })
  ));

  // 10. SQS SendMessage with DelaySeconds
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "DelayedMessage",
      States: {
        DelayedMessage: {
          Type: "Task",
          Resource: "arn:aws:states:::sqs:sendMessage",
          Parameters: {
            QueueUrl: "https://sqs.us-east-1.amazonaws.com/123456789012/DelayedQueue",
            MessageBody: { "data.$": "$" },
            DelaySeconds: 60
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
        Delay_Before_Enqueue: {
          type: "Wait",
          inputs: { interval: { unit: "Second", count: 60 } },
          runAfter: {}
        },
        DelayedMessage: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['servicebus']['connectionId']" } },
            method: "post",
            path: "/@{encodeURIComponent('DelayedQueue')}/messages",
            body: {
              ContentData: "@{base64(string(triggerBody()))}",
              ContentType: "application/json"
            }
          },
          runAfter: { Delay_Before_Enqueue: ["Succeeded"] }
        }
      }
    })
  ));

  // 11. SQS FIFO SendMessage
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "EnqueueFIFO",
      States: {
        EnqueueFIFO: {
          Type: "Task",
          Resource: "arn:aws:states:::sqs:sendMessage",
          Parameters: {
            QueueUrl: "https://sqs.us-east-1.amazonaws.com/123456789012/OrderQueue.fifo",
            MessageBody: {
              "orderId.$": "$.orderId",
              "customerId.$": "$.customerId"
            },
            "MessageGroupId.$": "$.customerId",
            "MessageDeduplicationId.$": "$.orderId"
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
        EnqueueFIFO: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['servicebus']['connectionId']" } },
            method: "post",
            path: "/@{encodeURIComponent('OrderQueue')}/messages",
            body: {
              ContentData: "@{base64(string(createObject('orderId', triggerBody()?['orderId'], 'customerId', triggerBody()?['customerId'])))}",
              ContentType: "application/json",
              SessionId: "@triggerBody()?['customerId']",
              MessageId: "@triggerBody()?['orderId']"
            }
          },
          runAfter: {}
        }
      }
    })
  ));

  // 12. SQS SendMessage with Catch
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "EnqueueWithFallback",
      States: {
        EnqueueWithFallback: {
          Type: "Task",
          Resource: "arn:aws:states:::sqs:sendMessage",
          Parameters: {
            QueueUrl: "https://sqs.us-east-1.amazonaws.com/123456789012/MainQueue",
            MessageBody: { "payload.$": "$" }
          },
          Catch: [{ ErrorEquals: ["States.ALL"], Next: "EnqueueDLQ" }],
          End: true
        },
        EnqueueDLQ: {
          Type: "Task",
          Resource: "arn:aws:states:::sqs:sendMessage",
          Parameters: {
            QueueUrl: "https://sqs.us-east-1.amazonaws.com/123456789012/DeadLetterQueue",
            MessageBody: { "payload.$": "$" }
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
        EnqueueWithFallback: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['servicebus']['connectionId']" } },
            method: "post",
            path: "/@{encodeURIComponent('MainQueue')}/messages",
            body: { ContentData: "@{base64(string(triggerBody()))}", ContentType: "application/json" }
          },
          runAfter: {}
        },
        EnqueueDLQ: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['servicebus']['connectionId']" } },
            method: "post",
            path: "/@{encodeURIComponent('DeadLetterQueue')}/messages",
            body: { ContentData: "@{base64(string(triggerBody()))}", ContentType: "application/json" }
          },
          runAfter: { EnqueueWithFallback: ["Failed", "TimedOut"] }
        }
      }
    })
  ));

  // ════════════════════════════════════════════════════════════
  // EventBridge
  // ════════════════════════════════════════════════════════════

  // 13. EventBridge PutEvents – single event
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "PublishDomainEvent",
      States: {
        PublishDomainEvent: {
          Type: "Task",
          Resource: "arn:aws:states:::events:putEvents",
          Parameters: {
            Entries: [{
              EventBusName: "default",
              Source: "com.myapp.orders",
              DetailType: "OrderCreated",
              Detail: {
                "orderId.$": "$.orderId",
                "customerId.$": "$.customerId",
                "amount.$": "$.amount"
              }
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
        PublishDomainEvent: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['eventgrid']['connectionId']" } },
            method: "post",
            path: "/@{encodeURIComponent(parameters('eventGridTopic'))}/events",
            body: [{
              id: "@{guid()}",
              subject: "orders",
              eventType: "OrderCreated",
              eventTime: "@utcNow()",
              data: {
                orderId: "@triggerBody()?['orderId']",
                customerId: "@triggerBody()?['customerId']",
                amount: "@triggerBody()?['amount']"
              },
              dataVersion: "1.0"
            }]
          },
          runAfter: {}
        }
      }
    })
  ));

  // 14. EventBridge PutEvents – multiple events
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "BatchPublishEvents",
      States: {
        BatchPublishEvents: {
          Type: "Task",
          Resource: "arn:aws:states:::events:putEvents",
          Parameters: {
            Entries: [
              {
                EventBusName: "default",
                Source: "com.myapp.inventory",
                DetailType: "StockUpdated",
                Detail: { "productId.$": "$.productId", "newStock.$": "$.newStock" }
              },
              {
                EventBusName: "default",
                Source: "com.myapp.pricing",
                DetailType: "PriceUpdated",
                Detail: { "productId.$": "$.productId", "newPrice.$": "$.newPrice" }
              }
            ]
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
        PublishStockEvent: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['eventgrid']['connectionId']" } },
            method: "post",
            path: "/@{encodeURIComponent(parameters('inventoryTopic'))}/events",
            body: [{
              id: "@{guid()}",
              subject: "inventory",
              eventType: "StockUpdated",
              eventTime: "@utcNow()",
              data: { productId: "@triggerBody()?['productId']", newStock: "@triggerBody()?['newStock']" },
              dataVersion: "1.0"
            }]
          },
          runAfter: {}
        },
        PublishPriceEvent: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['eventgrid']['connectionId']" } },
            method: "post",
            path: "/@{encodeURIComponent(parameters('pricingTopic'))}/events",
            body: [{
              id: "@{guid()}",
              subject: "pricing",
              eventType: "PriceUpdated",
              eventTime: "@utcNow()",
              data: { productId: "@triggerBody()?['productId']", newPrice: "@triggerBody()?['newPrice']" },
              dataVersion: "1.0"
            }]
          },
          runAfter: {}
        }
      }
    })
  ));

  // 15. EventBridge + custom event bus
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "PublishToCustomBus",
      States: {
        PublishToCustomBus: {
          Type: "Task",
          Resource: "arn:aws:states:::events:putEvents",
          Parameters: {
            Entries: [{
              EventBusName: "arn:aws:events:us-east-1:123456789012:event-bus/MyCustomBus",
              Source: "com.myapp",
              DetailType: "UserAction",
              Detail: { "action.$": "$.action", "userId.$": "$.userId" }
            }]
          },
          Next: "AckEvent"
        },
        AckEvent: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "AckEventFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        PublishToCustomBus: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['eventgrid']['connectionId']" } },
            method: "post",
            path: "/@{encodeURIComponent(parameters('customTopicEndpoint'))}/events",
            body: [{
              id: "@{guid()}",
              subject: "user-action",
              eventType: "UserAction",
              eventTime: "@utcNow()",
              data: { action: "@triggerBody()?['action']", userId: "@triggerBody()?['userId']" },
              dataVersion: "1.0"
            }]
          },
          runAfter: {}
        },
        AckEvent: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/AckEventFn" },
            body: "@triggerBody()"
          },
          runAfter: { PublishToCustomBus: ["Succeeded"] }
        }
      }
    })
  ));

  // ════════════════════════════════════════════════════════════
  // S3
  // ════════════════════════════════════════════════════════════

  // 16. S3 GetObject
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "ReadFromS3",
      States: {
        ReadFromS3: {
          Type: "Task",
          Resource: "arn:aws:states:::s3:getObject",
          Parameters: {
            Bucket: "my-data-bucket",
            "Key.$": "$.s3Key"
          },
          ResultSelector: { "fileContent.$": "$.Body" },
          ResultPath: "$.fileData",
          Next: "ProcessFile"
        },
        ProcessFile: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ProcessFileFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        ReadFromS3: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['azureblob']['connectionId']" } },
            method: "get",
            path: "/datasets/default/files/@{encodeURIComponent(encodeURIComponent(triggerBody()?['s3Key']))}/content"
          },
          runAfter: {}
        },
        ProcessFile: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ProcessFileFn" },
            body: {
              fileContent: "@body('ReadFromS3')",
              originalRequest: "@triggerBody()"
            }
          },
          runAfter: { ReadFromS3: ["Succeeded"] }
        }
      }
    })
  ));

  // 17. S3 PutObject
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "WriteToS3",
      States: {
        WriteToS3: {
          Type: "Task",
          Resource: "arn:aws:states:::s3:putObject",
          Parameters: {
            Bucket: "my-output-bucket",
            "Key.$": "States.Format('output/{}/{}.json', $.date, $.jobId)",
            "Body.$": "$.result",
            ContentType: "application/json"
          },
          ResultPath: null,
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        WriteToS3: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['azureblob']['connectionId']" } },
            method: "post",
            path: "/datasets/default/files",
            queries: {
              folderPath: "/output/@{triggerBody()?['date']}",
              name: "@{triggerBody()?['jobId']}.json",
              queryParametersSingleEncoded: true
            },
            body: "@triggerBody()?['result']",
            headers: { "Content-Type": "application/json" }
          },
          runAfter: {}
        }
      }
    })
  ));

  // 18. S3 listObjectsV2
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "ListFiles",
      States: {
        ListFiles: {
          Type: "Task",
          Resource: "arn:aws:states:::s3:listObjectsV2",
          Parameters: {
            Bucket: "my-data-bucket",
            Prefix: "uploads/2024/",
            MaxKeys: 100
          },
          ResultSelector: { "files.$": "$.Contents" },
          Next: "ProcessFileList"
        },
        ProcessFileList: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ProcessFileListFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        ListFiles: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['azureblob']['connectionId']" } },
            method: "get",
            path: "/datasets/default/foldersV2/@{encodeURIComponent(encodeURIComponent('uploads/2024'))}",
            queries: { useFlatListing: false }
          },
          runAfter: {}
        },
        ProcessFileList: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ProcessFileListFn" },
            body: {
              files: "@body('ListFiles')?['value']",
              originalRequest: "@triggerBody()"
            }
          },
          runAfter: { ListFiles: ["Succeeded"] }
        }
      }
    })
  ));

  // 19. S3 PutObject with retry
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "WriteReportToS3",
      States: {
        WriteReportToS3: {
          Type: "Task",
          Resource: "arn:aws:states:::s3:putObject",
          Parameters: {
            Bucket: "reports-bucket",
            "Key.$": "States.Format('reports/{}.json', $.reportId)",
            "Body.$": "States.JsonToString($.reportData)"
          },
          Retry: [{ ErrorEquals: ["States.ALL"], IntervalSeconds: 2, MaxAttempts: 3, BackoffRate: 2 }],
          Catch: [{ ErrorEquals: ["States.ALL"], Next: "ReportWriteError" }],
          End: true
        },
        ReportWriteError: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "ReportErrorFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        WriteReportToS3: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['azureblob']['connectionId']" } },
            method: "post",
            path: "/datasets/default/files",
            queries: {
              folderPath: "/reports",
              name: "@{triggerBody()?['reportId']}.json"
            },
            body: "@triggerBody()?['reportData']",
            headers: { "Content-Type": "application/json" }
          },
          retryPolicy: { type: "exponential", count: 3, interval: "PT2S", minimumInterval: "PT2S", maximumInterval: "PT1H" },
          runAfter: {}
        },
        ReportWriteError: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/ReportErrorFn" },
            body: "@triggerBody()"
          },
          runAfter: { WriteReportToS3: ["Failed", "TimedOut"] }
        }
      }
    })
  ));

  // 20. Full pipeline: S3 read → transform (Lambda) → DynamoDB put → SNS notify
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "ReadSource",
      States: {
        ReadSource: {
          Type: "Task",
          Resource: "arn:aws:states:::s3:getObject",
          Parameters: { Bucket: "source-bucket", "Key.$": "$.sourceKey" },
          ResultPath: "$.rawData",
          Next: "Transform"
        },
        Transform: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "TransformFn", Payload: { "data.$": "$.rawData" } },
          ResultPath: "$.transformed",
          Next: "Store"
        },
        Store: {
          Type: "Task",
          Resource: "arn:aws:states:::dynamodb:putItem",
          Parameters: {
            TableName: "ProcessedData",
            Item: {
              id: { "S.$": "$.jobId" },
              data: { "S.$": "States.JsonToString($.transformed)" },
              status: { S: "processed" }
            }
          },
          ResultPath: null,
          Next: "Notify"
        },
        Notify: {
          Type: "Task",
          Resource: "arn:aws:states:::sns:publish",
          Parameters: {
            TopicArn: "arn:aws:sns:us-east-1:123456789012:ProcessingDoneTopic",
            "Message.$": "$.jobId"
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
        ReadSource: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['azureblob']['connectionId']" } },
            method: "get",
            path: "/datasets/default/files/@{encodeURIComponent(encodeURIComponent(triggerBody()?['sourceKey']))}/content"
          },
          runAfter: {}
        },
        Transform: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/TransformFn" },
            body: { data: "@body('ReadSource')" }
          },
          runAfter: { ReadSource: ["Succeeded"] }
        },
        Store: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['documentdb']['connectionId']" } },
            method: "post",
            path: "/dbs/@{encodeURIComponent('ProcessedData')}/colls/@{encodeURIComponent('processed')}/docs",
            body: {
              id: "@triggerBody()?['jobId']",
              data: "@body('Transform')",
              status: "processed"
            }
          },
          runAfter: { Transform: ["Succeeded"] }
        },
        Notify: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['servicebus']['connectionId']" } },
            method: "post",
            path: "/@{encodeURIComponent('ProcessingDoneTopic')}/messages",
            body: { ContentData: "@{base64(triggerBody()?['jobId'])}" }
          },
          runAfter: { Store: ["Succeeded"] }
        }
      }
    })
  ));

  // 21. DynamoDB query via Lambda (scan pattern)
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "QueryOrders",
      States: {
        QueryOrders: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: {
            FunctionName: "QueryOrdersByCustomerFn",
            Payload: {
              "customerId.$": "$.customerId",
              "status.$": "$.filterStatus"
            }
          },
          ResultPath: "$.orders",
          Next: "AggregateResults"
        },
        AggregateResults: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "AggregateOrdersFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        QueryOrders: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['documentdb']['connectionId']" } },
            method: "post",
            path: "/dbs/@{encodeURIComponent('Orders')}/colls/@{encodeURIComponent('orders')}/docs/query",
            body: {
              query: "SELECT * FROM c WHERE c.customerId = @customerId AND c.status = @status",
              parameters: [
                { name: "@customerId", value: "@triggerBody()?['customerId']" },
                { name: "@status", value: "@triggerBody()?['filterStatus']" }
              ]
            }
          },
          runAfter: {}
        },
        AggregateResults: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/AggregateOrdersFn" },
            body: {
              orders: "@body('QueryOrders')?['Documents']",
              customerId: "@triggerBody()?['customerId']"
            }
          },
          runAfter: { QueryOrders: ["Succeeded"] }
        }
      }
    })
  ));

  // 22. SNS + SQS fan-out pattern
  pairs.push(pair("aws-to-azure",
    j({
      StartAt: "FanOutEvent",
      States: {
        FanOutEvent: {
          Type: "Task",
          Resource: "arn:aws:states:::sns:publish",
          Parameters: {
            TopicArn: "arn:aws:sns:us-east-1:123456789012:FanOutTopic",
            Message: {
              "eventType.$": "$.eventType",
              "data.$": "$"
            },
            MessageStructure: "json"
          },
          Next: "LogFanOut"
        },
        LogFanOut: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: "LogFn", "Payload.$": "$" },
          End: true
        }
      }
    }),
    j({
      $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
      contentVersion: "1.0.0.0",
      triggers: { manual: { type: "Request", kind: "Http", inputs: { schema: {} } } },
      actions: {
        FanOutEvent: {
          type: "ApiConnection",
          inputs: {
            host: { connection: { name: "@parameters('$connections')['eventgrid']['connectionId']" } },
            method: "post",
            path: "/@{encodeURIComponent(parameters('fanOutTopic'))}/events",
            body: [{
              id: "@{guid()}",
              eventType: "@triggerBody()?['eventType']",
              subject: "fanout",
              eventTime: "@utcNow()",
              data: "@triggerBody()",
              dataVersion: "1.0"
            }]
          },
          runAfter: {}
        },
        LogFanOut: {
          type: "Function",
          inputs: {
            function: { id: "/subscriptions/{subscriptionId}/resourceGroups/{rg}/providers/Microsoft.Web/sites/{app}/functions/LogFn" },
            body: "@triggerBody()"
          },
          runAfter: { FanOutEvent: ["Succeeded"] }
        }
      }
    })
  ));

  return pairs;
}
