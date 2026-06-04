/**
 * IaC Export Prompts
 *
 * Generates prompts for Gemini to convert migrated workflow JSON
 * into Infrastructure as Code (Terraform or CloudFormation).
 */

export type IaCFormat = "terraform" | "cloudformation";

export const IAC_SYSTEM_PROMPT = `You are an expert Infrastructure as Code engineer. You convert workflow definitions into deployment-ready IaC templates. Output ONLY the IaC code — no markdown fences, no explanations, no comments outside the code.`;

export function getIaCPrompt(
  direction: "aws-to-azure" | "azure-to-aws",
  targetIaC: IaCFormat,
  workflowJson: string
): string {
  if (targetIaC === "terraform") {
    return getTerraformPrompt(direction, workflowJson);
  }
  return getCloudFormationPrompt(direction, workflowJson);
}

function getTerraformPrompt(
  direction: "aws-to-azure" | "azure-to-aws",
  workflowJson: string
): string {
  if (direction === "aws-to-azure") {
    // Output is Azure Logic Apps → Terraform azurerm
    return `Convert the following Azure Logic Apps workflow definition into a complete Terraform configuration using the azurerm provider.

Requirements:
- Use the azurerm_logic_app_workflow resource
- Include the required provider block with azurerm source
- Include azurerm_resource_group data source or resource
- Embed the workflow definition inline using the workflow_parameters and body attributes
- Use HCL syntax (NOT JSON)
- Include appropriate tags
- Output ONLY valid HCL code, no markdown

Workflow JSON:
${workflowJson}`;
  }

  // Output is AWS Step Functions → Terraform aws
  return `Convert the following AWS Step Functions (ASL) definition into a complete Terraform configuration using the aws provider.

Requirements:
- Use the aws_sfn_state_machine resource
- Include the required provider block with aws source
- Include aws_iam_role and aws_iam_role_policy for the state machine execution role
- Embed the definition using jsonencode()
- Use HCL syntax (NOT JSON)
- Include appropriate tags
- Output ONLY valid HCL code, no markdown

ASL Definition:
${workflowJson}`;
}

function getCloudFormationPrompt(
  direction: "aws-to-azure" | "azure-to-aws",
  workflowJson: string
): string {
  if (direction === "azure-to-aws") {
    // Output is AWS Step Functions → CloudFormation
    return `Convert the following AWS Step Functions (ASL) definition into a complete CloudFormation template.

Requirements:
- Use AWS::StepFunctions::StateMachine resource
- Include AWS::IAM::Role for the state machine execution role
- Embed the DefinitionString using Fn::Sub for variable substitution
- Use JSON format for the template
- Include appropriate Parameters and Outputs sections
- Output ONLY valid CloudFormation JSON, no markdown

ASL Definition:
${workflowJson}`;
  }

  // Output is Azure Logic Apps → CloudFormation (not typical, but handle gracefully)
  return `Convert the following Azure Logic Apps workflow into a CloudFormation-compatible deployment template.

Note: Azure Logic Apps are not natively supported in AWS CloudFormation. Create an equivalent AWS Step Functions state machine CloudFormation resource that preserves the same workflow logic.

Requirements:
- Use AWS::StepFunctions::StateMachine resource
- Map Logic Apps actions to equivalent Step Functions states
- Include AWS::IAM::Role for execution
- Use JSON format
- Output ONLY valid CloudFormation JSON, no markdown

Azure Logic Apps Workflow:
${workflowJson}`;
}

export function getDefaultIaCFormat(
  direction: "aws-to-azure" | "azure-to-aws"
): IaCFormat {
  // Terraform for Azure output, CloudFormation for AWS output
  return direction === "aws-to-azure" ? "terraform" : "cloudformation";
}

export function getIaCFilename(format: IaCFormat): string {
  return format === "terraform" ? "main.tf" : "template.json";
}
