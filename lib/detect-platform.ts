export type Platform = "aws-step-functions" | "azure-logic-apps" | "unknown";

export interface DetectionResult {
  platform: Platform;
  label: string;
  confidence: "high" | "medium" | "low";
  reason: string;
}

export function detectPlatform(content: string): DetectionResult {
  const trimmed = content.trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      platform: "unknown",
      label: "Unknown",
      confidence: "low",
      reason: "Invalid JSON. Please provide a valid JSON workflow definition.",
    };
  }

  if (isAWSStepFunctions(parsed)) {
    return {
      platform: "aws-step-functions",
      label: "AWS Step Functions (ASL)",
      confidence: hasStrongASLSignals(parsed) ? "high" : "medium",
      reason: "Detected StartAt and States properties (Amazon States Language).",
    };
  }

  if (isAzureLogicApps(parsed)) {
    return {
      platform: "azure-logic-apps",
      label: "Azure Logic Apps",
      confidence: hasStrongLogicAppSignals(parsed) ? "high" : "medium",
      reason: "Detected Logic Apps schema or triggers/actions structure.",
    };
  }

  return {
    platform: "unknown",
    label: "Unknown",
    confidence: "low",
    reason:
      "Could not detect platform. Ensure the JSON is a valid AWS Step Functions (ASL) or Azure Logic Apps definition.",
  };
}

function isAWSStepFunctions(obj: Record<string, unknown>): boolean {
  return "States" in obj && "StartAt" in obj;
}

function isAzureLogicApps(obj: Record<string, unknown>): boolean {
  if (typeof obj.$schema === "string" && obj.$schema.includes("Microsoft.Logic")) {
    return true;
  }
  if ("triggers" in obj && "actions" in obj) {
    return true;
  }
  if ("definition" in obj && typeof obj.definition === "object" && obj.definition !== null) {
    const def = obj.definition as Record<string, unknown>;
    return "triggers" in def && "actions" in def;
  }
  return false;
}

function hasStrongASLSignals(obj: Record<string, unknown>): boolean {
  if (typeof obj.States !== "object" || obj.States === null) return false;
  const states = obj.States as Record<string, Record<string, unknown>>;
  return Object.values(states).some(
    (s) => "Type" in s && ["Task", "Choice", "Parallel", "Map", "Wait", "Pass", "Succeed", "Fail"].includes(s.Type as string)
  );
}

function hasStrongLogicAppSignals(obj: Record<string, unknown>): boolean {
  const schema = obj.$schema;
  return typeof schema === "string" && schema.includes("Microsoft.Logic");
}

export function getTargetPlatforms(source: Platform): { value: Platform; label: string }[] {
  switch (source) {
    case "aws-step-functions":
      return [{ value: "azure-logic-apps", label: "Azure Logic Apps" }];
    case "azure-logic-apps":
      return [{ value: "aws-step-functions", label: "AWS Step Functions" }];
    default:
      return [
        { value: "azure-logic-apps", label: "Azure Logic Apps" },
        { value: "aws-step-functions", label: "AWS Step Functions" },
      ];
  }
}

export function getMigrationDirection(
  source: Platform,
  target: Platform
): "aws-to-azure" | "azure-to-aws" | null {
  if (source === "aws-step-functions" && target === "azure-logic-apps") return "aws-to-azure";
  if (source === "azure-logic-apps" && target === "aws-step-functions") return "azure-to-aws";
  return null;
}
