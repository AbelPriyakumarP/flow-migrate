export const AWS_SAMPLE = `{
  "Comment": "Order Processing Workflow",
  "StartAt": "ValidateOrder",
  "States": {
    "ValidateOrder": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:us-east-1:123456789:function/validate-order",
      "Next": "CheckInventory",
      "Retry": [
        {
          "ErrorEquals": ["ServiceException"],
          "IntervalSeconds": 2,
          "MaxAttempts": 3,
          "BackoffRate": 2.0
        }
      ],
      "Catch": [
        {
          "ErrorEquals": ["ValidationError"],
          "Next": "OrderFailed"
        }
      ]
    },
    "CheckInventory": {
      "Type": "Task",
      "Resource": "arn:aws:states:::dynamodb:getItem",
      "Parameters": {
        "TableName": "Inventory",
        "Key": {
          "productId": { "S.$": "$.productId" }
        }
      },
      "ResultPath": "$.inventoryResult",
      "Next": "IsInStock"
    },
    "IsInStock": {
      "Type": "Choice",
      "Choices": [
        {
          "Variable": "$.inventoryResult.Item.quantity.N",
          "NumericGreaterThan": 0,
          "Next": "ProcessPayment"
        }
      ],
      "Default": "OutOfStock"
    },
    "ProcessPayment": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:us-east-1:123456789:function/process-payment",
      "Next": "FulfillOrder"
    },
    "FulfillOrder": {
      "Type": "Parallel",
      "Branches": [
        {
          "StartAt": "ShipOrder",
          "States": {
            "ShipOrder": {
              "Type": "Task",
              "Resource": "arn:aws:lambda:us-east-1:123456789:function/ship-order",
              "End": true
            }
          }
        },
        {
          "StartAt": "SendConfirmation",
          "States": {
            "SendConfirmation": {
              "Type": "Task",
              "Resource": "arn:aws:states:::sns:publish",
              "Parameters": {
                "TopicArn": "arn:aws:sns:us-east-1:123456789:OrderConfirmations",
                "Message.$": "$.orderId"
              },
              "End": true
            }
          }
        }
      ],
      "Next": "OrderComplete"
    },
    "OutOfStock": {
      "Type": "Task",
      "Resource": "arn:aws:states:::sns:publish",
      "Parameters": {
        "TopicArn": "arn:aws:sns:us-east-1:123456789:OutOfStockNotifications",
        "Message.$": "$.productId"
      },
      "Next": "OrderFailed"
    },
    "OrderComplete": {
      "Type": "Succeed"
    },
    "OrderFailed": {
      "Type": "Fail",
      "Error": "OrderProcessingError",
      "Cause": "The order could not be processed."
    }
  }
}`;

export const AZURE_SAMPLE = `{
  "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
  "contentVersion": "1.0.0.0",
  "triggers": {
    "When_a_new_order_is_received": {
      "type": "Request",
      "kind": "Http",
      "inputs": {
        "schema": {
          "type": "object",
          "properties": {
            "orderId": { "type": "string" },
            "customerId": { "type": "string" },
            "productId": { "type": "string" },
            "quantity": { "type": "integer" },
            "totalAmount": { "type": "number" }
          }
        }
      }
    }
  },
  "actions": {
    "Validate_Order": {
      "type": "Function",
      "inputs": {
        "function": {
          "id": "/subscriptions/sub-id/resourceGroups/rg/providers/Microsoft.Web/sites/myapp/functions/validateOrder"
        },
        "body": "@triggerBody()"
      },
      "runAfter": {}
    },
    "Check_Inventory": {
      "type": "Http",
      "inputs": {
        "method": "GET",
        "uri": "https://mycosmosdb.documents.azure.com/dbs/inventory/colls/products/docs/@{triggerBody()?['productId']}"
      },
      "runAfter": {
        "Validate_Order": ["Succeeded"]
      }
    },
    "Is_In_Stock": {
      "type": "If",
      "expression": {
        "and": [
          {
            "greater": [
              "@body('Check_Inventory')?['quantity']",
              0
            ]
          }
        ]
      },
      "actions": {
        "Process_Payment": {
          "type": "Function",
          "inputs": {
            "function": {
              "id": "/subscriptions/sub-id/resourceGroups/rg/providers/Microsoft.Web/sites/myapp/functions/processPayment"
            },
            "body": {
              "orderId": "@triggerBody()?['orderId']",
              "amount": "@triggerBody()?['totalAmount']"
            }
          },
          "runAfter": {}
        },
        "Fulfill_Order": {
          "type": "Scope",
          "actions": {
            "Ship_Order": {
              "type": "Function",
              "inputs": {
                "function": {
                  "id": "/subscriptions/sub-id/resourceGroups/rg/providers/Microsoft.Web/sites/myapp/functions/shipOrder"
                },
                "body": "@triggerBody()"
              },
              "runAfter": {}
            },
            "Send_Confirmation": {
              "type": "ApiConnection",
              "inputs": {
                "host": {
                  "connection": {
                    "name": "@parameters('$connections')['servicebus']['connectionId']"
                  }
                },
                "method": "post",
                "path": "/OrderConfirmations/messages",
                "body": {
                  "ContentData": "@{triggerBody()?['orderId']}"
                }
              },
              "runAfter": {}
            }
          },
          "runAfter": {
            "Process_Payment": ["Succeeded"]
          }
        }
      },
      "else": {
        "actions": {
          "Out_Of_Stock_Notification": {
            "type": "ApiConnection",
            "inputs": {
              "host": {
                "connection": {
                  "name": "@parameters('$connections')['servicebus']['connectionId']"
                }
              },
              "method": "post",
              "path": "/OutOfStockNotifications/messages",
              "body": {
                "ContentData": "@{triggerBody()?['productId']}"
              }
            },
            "runAfter": {}
          },
          "Order_Failed": {
            "type": "Terminate",
            "inputs": {
              "runStatus": "Failed",
              "runError": {
                "code": "OrderProcessingError",
                "message": "The order could not be processed due to insufficient stock."
              }
            },
            "runAfter": {
              "Out_Of_Stock_Notification": ["Succeeded"]
            }
          }
        }
      },
      "runAfter": {
        "Check_Inventory": ["Succeeded"]
      }
    }
  }
}`;
