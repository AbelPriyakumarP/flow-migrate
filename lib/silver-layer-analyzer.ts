export type TransformCategory =
  | "schema-standardization"
  | "data-cleansing"
  | "type-conversion"
  | "deduplication"
  | "data-enrichment"
  | "pii-masking"
  | "data-quality-validation"
  | "business-rule";

export interface TransformIntent {
  id: string;
  category: TransformCategory;
  sourceExpression: string;
  description: string;
  platform: "aws" | "azure" | "generic";
  fields: string[];
  confidence: number;
  severity: "critical" | "high" | "medium" | "low";
}

export interface GeneratedTransform {
  id: string;
  intentId: string;
  category: TransformCategory;
  name: string;
  description: string;
  code: string;
  language: "spark-sql" | "pyspark" | "dataflow" | "sql" | "typescript";
  reusable: boolean;
  dependencies: string[];
}

export interface ValidationRule {
  id: string;
  name: string;
  category: TransformCategory;
  expression: string;
  severity: "error" | "warning" | "info";
  description: string;
  autoFix: boolean;
  fixCode?: string;
}

export interface MetadataDefinition {
  fieldName: string;
  sourceType: string;
  targetType: string;
  nullable: boolean;
  piiClassification: "none" | "direct" | "quasi" | "sensitive";
  transformations: string[];
  qualityRules: string[];
}

export interface SilverLayerResult {
  intents: TransformIntent[];
  transforms: GeneratedTransform[];
  validationRules: ValidationRule[];
  metadata: MetadataDefinition[];
  summary: SilverSummary;
  overallConfidence: number;
}

export interface SilverSummary {
  totalIntents: number;
  byCategory: Record<TransformCategory, number>;
  platformSpecificCount: number;
  cloudNativeCount: number;
  reusableTransformCount: number;
  piiFieldsDetected: number;
  qualityRulesGenerated: number;
  warnings: string[];
}

// ── Production Silver Layer Types ─────────────────────────────────────────────

export interface AuditMetrics {
  inputRecordCount: string;
  outputRecordCount: string;
  rejectedRecordCount: string;
  duplicateRecordCount: string;
  processingTimestamp: string;
  pipelineRunId: string;
  durationSeconds: string;
  schemaVersion: string;
}

export interface IncrementalConfig {
  strategy: "delta-merge" | "upsert" | "cdc" | "append-only";
  mergeKeys: string[];
  sequenceColumn: string;
  watermarkColumn: string;
  code: string;
  description: string;
}

export interface ErrorHandlingSpec {
  id: string;
  name: string;
  type: "quarantine" | "dead-letter" | "retry" | "log-and-skip";
  description: string;
  code: string;
  retrySafe: boolean;
}

export interface PerformanceRec {
  id: string;
  title: string;
  type: "broadcast-join" | "partitioning" | "z-order" | "caching" | "coalesce" | "adaptive-query";
  description: string;
  code: string;
  estimatedImpact: "low" | "medium" | "high";
}

export interface SchemaDriftCheck {
  id: string;
  name: string;
  checkType: "required-column" | "data-type" | "new-column" | "removed-column";
  description: string;
  code: string;
  severity: "error" | "warning" | "info";
}

export interface CrossLayerDQContract {
  id: string;
  name: string;
  checkType: "reconciliation" | "circuit-breaker" | "handshake" | "pre-gold-gate";
  description: string;
  code: string;
  severity: "critical" | "high" | "medium";
  blockDownstream: boolean;
}

export interface ProductionSilverResult extends SilverLayerResult {
  auditFramework: { code: string; metrics: AuditMetrics };
  incrementalConfig: IncrementalConfig;
  errorHandling: ErrorHandlingSpec[];
  performanceRecs: PerformanceRec[];
  schemaDriftChecks: SchemaDriftCheck[];
  crossLayerDQ: CrossLayerDQContract[];
  productionPipeline: string;
}

const CATEGORY_LABELS: Record<TransformCategory, string> = {
  "schema-standardization": "Schema Standardization",
  "data-cleansing": "Data Cleansing",
  "type-conversion": "Type Conversion",
  "deduplication": "Deduplication",
  "data-enrichment": "Data Enrichment",
  "pii-masking": "PII Masking",
  "data-quality-validation": "Data Quality Validation",
  "business-rule": "Business Rule",
};

export { CATEGORY_LABELS };

// ── Intent extraction patterns ──────────────────────────────────────────────

interface PatternDef {
  regex: RegExp;
  category: TransformCategory;
  descTemplate: string;
  severity: "critical" | "high" | "medium" | "low";
}

const SCHEMA_PATTERNS: PatternDef[] = [
  { regex: /(?:rename|alias)\s*\(\s*["'](\w+)["']\s*,\s*["'](\w+)["']\)/gi, category: "schema-standardization", descTemplate: "Rename column '$1' → '$2'", severity: "medium" },
  { regex: /\.withColumnRenamed\s*\(\s*["'](\w+)["']\s*,\s*["'](\w+)["']\)/gi, category: "schema-standardization", descTemplate: "PySpark column rename '$1' → '$2'", severity: "medium" },
  { regex: /\.select\s*\([^)]*\)/gi, category: "schema-standardization", descTemplate: "Column projection/selection", severity: "low" },
  { regex: /(?:flatten|explode|unnest)\s*\(/gi, category: "schema-standardization", descTemplate: "Nested structure flattening", severity: "high" },
  { regex: /\.withColumn\s*\(\s*["'](\w+)["']/gi, category: "schema-standardization", descTemplate: "Add/modify column '$1'", severity: "medium" },
  { regex: /CAST\s*\(\s*(\w+)\s+AS\s+(\w+)\s*\)/gi, category: "type-conversion", descTemplate: "SQL cast $1 to $2", severity: "medium" },
  { regex: /\.cast\s*\(\s*["'](\w+)["']\s*\)/gi, category: "type-conversion", descTemplate: "PySpark cast to $1", severity: "medium" },
  { regex: /to_timestamp|to_date|to_utc_timestamp/gi, category: "type-conversion", descTemplate: "Timestamp/date conversion", severity: "high" },
  { regex: /StringType|IntegerType|LongType|DoubleType|DecimalType|BooleanType|TimestampType/gi, category: "type-conversion", descTemplate: "Spark type definition", severity: "low" },
  { regex: /StructType|StructField|ArrayType|MapType/gi, category: "schema-standardization", descTemplate: "Schema structure definition", severity: "medium" },
];

const CLEANSING_PATTERNS: PatternDef[] = [
  { regex: /\.na\.drop|\.dropna|DROP\s+NULL|IS\s+NOT\s+NULL/gi, category: "data-cleansing", descTemplate: "Null row removal", severity: "high" },
  { regex: /\.na\.fill|\.fillna|COALESCE|IFNULL|NVL/gi, category: "data-cleansing", descTemplate: "Null value imputation", severity: "high" },
  { regex: /\.trim|TRIM|LTRIM|RTRIM|\.strip/gi, category: "data-cleansing", descTemplate: "Whitespace trimming", severity: "low" },
  { regex: /(?:lower|upper|initcap)\s*\(/gi, category: "data-cleansing", descTemplate: "Case normalization", severity: "low" },
  { regex: /regexp_replace|REPLACE|TRANSLATE/gi, category: "data-cleansing", descTemplate: "Pattern-based text cleaning", severity: "medium" },
  { regex: /\.filter\s*\(|\.where\s*\(|WHERE\s+/gi, category: "data-cleansing", descTemplate: "Row filtering/validation", severity: "medium" },
  { regex: /REGEXP|RLIKE|LIKE\s+'%/gi, category: "data-cleansing", descTemplate: "Pattern matching filter", severity: "medium" },
  { regex: /date_format|from_unixtime|unix_timestamp/gi, category: "data-cleansing", descTemplate: "Date format standardization", severity: "high" },
];

const DEDUP_PATTERNS: PatternDef[] = [
  { regex: /\.dropDuplicates|\.drop_duplicates|DISTINCT/gi, category: "deduplication", descTemplate: "Row deduplication", severity: "high" },
  { regex: /ROW_NUMBER\s*\(\s*\)\s*OVER/gi, category: "deduplication", descTemplate: "Window-based deduplication (row_number)", severity: "high" },
  { regex: /RANK\s*\(\s*\)\s*OVER|DENSE_RANK/gi, category: "deduplication", descTemplate: "Rank-based deduplication", severity: "high" },
  { regex: /GROUP\s+BY|\.groupBy|\.groupby/gi, category: "deduplication", descTemplate: "Group-based aggregation/dedup", severity: "medium" },
  { regex: /MERGE\s+INTO|UPSERT|ON\s+CONFLICT/gi, category: "deduplication", descTemplate: "Merge/upsert deduplication", severity: "critical" },
];

const ENRICHMENT_PATTERNS: PatternDef[] = [
  { regex: /(?:LEFT|RIGHT|INNER|FULL|CROSS)\s+JOIN/gi, category: "data-enrichment", descTemplate: "Join-based enrichment", severity: "high" },
  { regex: /\.join\s*\(/gi, category: "data-enrichment", descTemplate: "PySpark join enrichment", severity: "high" },
  { regex: /LOOKUP|lookup_table|dim_|dimension_/gi, category: "data-enrichment", descTemplate: "Dimension lookup enrichment", severity: "medium" },
  { regex: /geocode|geo_lookup|lat|lon|latitude|longitude/gi, category: "data-enrichment", descTemplate: "Geospatial enrichment", severity: "medium" },
  { regex: /currency_convert|exchange_rate|fx_rate/gi, category: "data-enrichment", descTemplate: "Currency conversion enrichment", severity: "high" },
  { regex: /CASE\s+WHEN[^;]*THEN[^;]*(?:ELSE|END)/gi, category: "business-rule", descTemplate: "Conditional business logic", severity: "high" },
  { regex: /\.when\s*\([^)]*\)[^;]*\.otherwise/gi, category: "business-rule", descTemplate: "PySpark conditional rule", severity: "high" },
];

const PII_PATTERNS: PatternDef[] = [
  { regex: /(?:ssn|social_security|sin_number|national_id)/gi, category: "pii-masking", descTemplate: "SSN/National ID detected", severity: "critical" },
  { regex: /(?:email|e_mail|email_address|mail_addr)/gi, category: "pii-masking", descTemplate: "Email address detected", severity: "critical" },
  { regex: /(?:phone|mobile|cell|telephone|fax)(?:_number|_no|_num)?/gi, category: "pii-masking", descTemplate: "Phone number detected", severity: "critical" },
  { regex: /(?:first_name|last_name|full_name|surname|given_name)/gi, category: "pii-masking", descTemplate: "Personal name detected", severity: "critical" },
  { regex: /(?:address|street|city|zip|postal|zip_code)/gi, category: "pii-masking", descTemplate: "Physical address detected", severity: "high" },
  { regex: /(?:dob|date_of_birth|birth_date|birthdate)/gi, category: "pii-masking", descTemplate: "Date of birth detected", severity: "critical" },
  { regex: /(?:credit_card|card_number|ccn|pan_number|cvv)/gi, category: "pii-masking", descTemplate: "Payment card data detected", severity: "critical" },
  { regex: /(?:passport|driver_license|licence_no|dl_number)/gi, category: "pii-masking", descTemplate: "Government ID detected", severity: "critical" },
  { regex: /(?:ip_address|mac_address|device_id|imei)/gi, category: "pii-masking", descTemplate: "Device identifier detected", severity: "high" },
  { regex: /(?:salary|income|wage|compensation|bank_account|iban|routing)/gi, category: "pii-masking", descTemplate: "Financial data detected", severity: "critical" },
];

const QUALITY_PATTERNS: PatternDef[] = [
  { regex: /(?:assert|check|validate|verify)\s*\(/gi, category: "data-quality-validation", descTemplate: "Explicit validation check", severity: "high" },
  { regex: /COUNT\s*\(\s*\*\s*\)|\.count\s*\(\s*\)/gi, category: "data-quality-validation", descTemplate: "Row count validation", severity: "medium" },
  { regex: /BETWEEN\s+\d+\s+AND\s+\d+/gi, category: "data-quality-validation", descTemplate: "Range validation", severity: "medium" },
  { regex: /IS\s+NOT\s+NULL\s+AND\s+\w+\s*[><=!]/gi, category: "data-quality-validation", descTemplate: "Compound constraint validation", severity: "high" },
  { regex: /LENGTH\s*\(|CHAR_LENGTH|len\s*\(/gi, category: "data-quality-validation", descTemplate: "String length validation", severity: "low" },
  { regex: /CHECK\s*\(|CONSTRAINT/gi, category: "data-quality-validation", descTemplate: "Constraint definition", severity: "high" },
];

const ALL_PATTERNS: PatternDef[] = [
  ...SCHEMA_PATTERNS,
  ...CLEANSING_PATTERNS,
  ...DEDUP_PATTERNS,
  ...ENRICHMENT_PATTERNS,
  ...PII_PATTERNS,
  ...QUALITY_PATTERNS,
];

// ── Main analysis function ──────────────────────────────────────────────────

export function analyzeSilverLayer(
  sourceCode: string,
  outputCode: string,
  direction: "aws-to-azure" | "azure-to-aws"
): SilverLayerResult {
  const intents = extractIntents(sourceCode, direction);
  const piiFields = intents.filter((i) => i.category === "pii-masking").flatMap((i) => i.fields);
  const transforms = generateTransforms(intents, direction, piiFields);
  const validationRules = generateValidationRules(intents, outputCode);
  const metadata = generateMetadata(intents, piiFields);
  const overallConfidence = computeConfidence(intents, transforms);

  const byCategory: Record<TransformCategory, number> = {
    "schema-standardization": 0,
    "data-cleansing": 0,
    "type-conversion": 0,
    "deduplication": 0,
    "data-enrichment": 0,
    "pii-masking": 0,
    "data-quality-validation": 0,
    "business-rule": 0,
  };
  for (const intent of intents) byCategory[intent.category]++;

  const warnings: string[] = [];
  if (byCategory["pii-masking"] > 0 && !transforms.some((t) => t.category === "pii-masking"))
    warnings.push("PII fields detected but no masking transforms generated — review manually");
  if (byCategory["deduplication"] === 0)
    warnings.push("No deduplication logic detected — verify source data has no duplicates");
  if (byCategory["data-quality-validation"] === 0)
    warnings.push("No data quality validations found — consider adding row count checks and null audits");

  return {
    intents,
    transforms,
    validationRules,
    metadata,
    overallConfidence,
    summary: {
      totalIntents: intents.length,
      byCategory,
      platformSpecificCount: intents.filter((i) => i.platform !== "generic").length,
      cloudNativeCount: transforms.filter((t) => t.language === "spark-sql" || t.language === "dataflow").length,
      reusableTransformCount: transforms.filter((t) => t.reusable).length,
      piiFieldsDetected: piiFields.length,
      qualityRulesGenerated: validationRules.length,
      warnings,
    },
  };
}

function extractIntents(source: string, direction: "aws-to-azure" | "azure-to-aws"): TransformIntent[] {
  const intents: TransformIntent[] = [];
  const seen = new Set<string>();

  for (const pattern of ALL_PATTERNS) {
    let match: RegExpExecArray | null;
    const re = new RegExp(pattern.regex.source, pattern.regex.flags);
    while ((match = re.exec(source)) !== null) {
      const key = `${pattern.category}:${match[0].slice(0, 60)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      let desc = pattern.descTemplate;
      for (let i = 1; i <= 3; i++) {
        if (match[i]) desc = desc.replace(`$${i}`, match[i]);
      }

      const fields = extractFieldNames(match[0]);
      const platform = detectPlatform(match[0], direction);

      intents.push({
        id: `intent-${intents.length + 1}`,
        category: pattern.category,
        sourceExpression: match[0].slice(0, 200),
        description: desc,
        platform,
        fields,
        confidence: computePatternConfidence(pattern, match[0]),
        severity: pattern.severity,
      });
    }
  }

  return intents.sort((a, b) => {
    const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return sevOrder[a.severity] - sevOrder[b.severity];
  });
}

function extractFieldNames(expr: string): string[] {
  const fields: string[] = [];
  const colRe = /["'](\w{2,40})["']/g;
  let m: RegExpExecArray | null;
  while ((m = colRe.exec(expr)) !== null) {
    if (!["string", "int", "long", "double", "boolean", "timestamp", "date", "float", "decimal"].includes(m[1].toLowerCase())) {
      fields.push(m[1]);
    }
  }
  return [...new Set(fields)];
}

function detectPlatform(expr: string, direction: "aws-to-azure" | "azure-to-aws"): "aws" | "azure" | "generic" {
  if (/glue|athena|redshift|s3:|dynamodb|kinesis|emr|boto3/i.test(expr)) return "aws";
  if (/synapse|databricks|adls|cosmos|eventhub|adf|purview/i.test(expr)) return "azure";
  return "generic";
}

function computePatternConfidence(pattern: PatternDef, matched: string): number {
  let base = 0.7;
  if (matched.length > 30) base += 0.1;
  if (pattern.severity === "critical") base += 0.1;
  if (pattern.severity === "high") base += 0.05;
  return Math.min(base, 0.98);
}

// ── Transform generation ────────────────────────────────────────────────────

function generateTransforms(
  intents: TransformIntent[],
  direction: "aws-to-azure" | "azure-to-aws",
  piiFields: string[]
): GeneratedTransform[] {
  const transforms: GeneratedTransform[] = [];
  const isToAzure = direction === "aws-to-azure";

  const grouped = new Map<TransformCategory, TransformIntent[]>();
  for (const intent of intents) {
    const arr = grouped.get(intent.category) || [];
    arr.push(intent);
    grouped.set(intent.category, arr);
  }

  // Schema standardization
  const schemaIntents = grouped.get("schema-standardization") || [];
  if (schemaIntents.length > 0) {
    const renames = schemaIntents.filter((i) => i.description.includes("ename"));
    const flattens = schemaIntents.filter((i) => i.description.includes("latten"));

    if (renames.length > 0) {
      const renamePairs = renames.map((r) => {
        const m = r.description.match(/['"](\w+)['"].*['"](\w+)['"]/) || r.description.match(/(\w+).*→.*(\w+)/);
        return m ? [m[1], m[2]] : null;
      }).filter(Boolean) as string[][];

      transforms.push({
        id: `xform-${transforms.length + 1}`,
        intentId: renames[0].id,
        category: "schema-standardization",
        name: "standardize_column_names",
        description: `Rename ${renamePairs.length} columns to target naming convention`,
        code: isToAzure
          ? generateAzureSchemaRename(renamePairs)
          : generateAwsSchemaRename(renamePairs),
        language: isToAzure ? "pyspark" : "pyspark",
        reusable: true,
        dependencies: [],
      });
    }

    if (flattens.length > 0) {
      transforms.push({
        id: `xform-${transforms.length + 1}`,
        intentId: flattens[0].id,
        category: "schema-standardization",
        name: "flatten_nested_structures",
        description: "Flatten nested JSON/struct columns into flat schema",
        code: isToAzure
          ? `# Databricks / Synapse — flatten nested structures\nfrom pyspark.sql.functions import explode, col\n\ndef flatten_nested(df):\n    """Recursively flatten nested StructType columns."""\n    flat_cols = []\n    nested_cols = []\n    for field in df.schema.fields:\n        if hasattr(field.dataType, 'fields'):\n            nested_cols.append(field.name)\n        else:\n            flat_cols.append(col(field.name))\n    \n    if not nested_cols:\n        return df\n    \n    for nc in nested_cols:\n        for child in df.schema[nc].dataType.fields:\n            flat_cols.append(col(f"{nc}.{child.name}").alias(f"{nc}_{child.name}"))\n    \n    return df.select(flat_cols)`
          : `# AWS Glue — flatten nested structures\nfrom awsglue.transforms import Unbox, Relationalize\nfrom pyspark.sql.functions import explode, col\n\ndef flatten_nested(dynamic_frame):\n    """Flatten nested structures using Relationalize."""\n    rel = Relationalize.apply(\n        frame=dynamic_frame,\n        staging_path="s3://staging-bucket/temp/",\n        name="flattened",\n        transformation_ctx="flatten"\n    )\n    return rel.select("flattened")`,
        language: "pyspark",
        reusable: true,
        dependencies: [],
      });
    }
  }

  // Data cleansing
  const cleansingIntents = grouped.get("data-cleansing") || [];
  if (cleansingIntents.length > 0) {
    const nullHandlers = cleansingIntents.filter((i) =>
      /null|imputation|drop/i.test(i.description)
    );
    const textCleaners = cleansingIntents.filter((i) =>
      /trim|case|clean|replace/i.test(i.description)
    );
    const dateCleaners = cleansingIntents.filter((i) =>
      /date|time|format/i.test(i.description)
    );

    if (nullHandlers.length > 0) {
      transforms.push({
        id: `xform-${transforms.length + 1}`,
        intentId: nullHandlers[0].id,
        category: "data-cleansing",
        name: "handle_null_values",
        description: "Standardized null handling — drop critical nulls, impute optional fields",
        code: isToAzure
          ? `# Databricks — null handling pipeline\nfrom pyspark.sql.functions import col, coalesce, lit, when\n\ndef handle_nulls(df, critical_cols, default_map):\n    """Drop rows with null critical columns, impute optional columns."""\n    # Drop rows where any critical column is null\n    for c in critical_cols:\n        df = df.filter(col(c).isNotNull())\n    \n    # Impute optional columns with defaults\n    for col_name, default_val in default_map.items():\n        df = df.withColumn(\n            col_name,\n            coalesce(col(col_name), lit(default_val))\n        )\n    \n    return df\n\n# Usage:\n# df = handle_nulls(\n#     df,\n#     critical_cols=["id", "created_at"],\n#     default_map={"status": "unknown", "amount": 0.0}\n# )`
          : `# AWS Glue — null handling pipeline\nfrom pyspark.sql.functions import col, coalesce, lit\nfrom awsglue.transforms import DropNullFields\n\ndef handle_nulls(dynamic_frame, critical_cols, default_map):\n    """Drop null critical fields, impute optionals."""\n    df = dynamic_frame.toDF()\n    for c in critical_cols:\n        df = df.filter(col(c).isNotNull())\n    for col_name, default_val in default_map.items():\n        df = df.withColumn(col_name, coalesce(col(col_name), lit(default_val)))\n    return DynamicFrame.fromDF(df, glueContext, "null_handled")`,
        language: "pyspark",
        reusable: true,
        dependencies: [],
      });
    }

    if (textCleaners.length > 0) {
      transforms.push({
        id: `xform-${transforms.length + 1}`,
        intentId: textCleaners[0].id,
        category: "data-cleansing",
        name: "standardize_text_fields",
        description: "Trim whitespace, normalize case, strip special characters",
        code: `# Cloud-native text standardization\nfrom pyspark.sql.functions import col, trim, lower, upper, initcap, regexp_replace\n\ndef standardize_text(df, config):\n    """Apply text standardization rules.\n    config: dict of {col_name: {"case": "lower"|"upper"|"title", "trim": True, "strip_pattern": regex}}\n    """\n    for col_name, rules in config.items():\n        if rules.get("trim", True):\n            df = df.withColumn(col_name, trim(col(col_name)))\n        \n        case_fn = {"lower": lower, "upper": upper, "title": initcap}\n        if rules.get("case") in case_fn:\n            df = df.withColumn(col_name, case_fn[rules["case"]](col(col_name)))\n        \n        if "strip_pattern" in rules:\n            df = df.withColumn(\n                col_name,\n                regexp_replace(col(col_name), rules["strip_pattern"], "")\n            )\n    \n    return df`,
        language: "pyspark",
        reusable: true,
        dependencies: [],
      });
    }

    if (dateCleaners.length > 0) {
      transforms.push({
        id: `xform-${transforms.length + 1}`,
        intentId: dateCleaners[0].id,
        category: "data-cleansing",
        name: "standardize_timestamps",
        description: "Convert all date/time fields to UTC ISO-8601 format",
        code: isToAzure
          ? `# Databricks — timestamp standardization\nfrom pyspark.sql.functions import col, to_timestamp, to_utc_timestamp, date_format\n\ndef standardize_timestamps(df, date_cols, source_tz="UTC"):\n    """Convert date columns to UTC ISO-8601."""\n    for c in date_cols:\n        df = df.withColumn(\n            c,\n            to_utc_timestamp(\n                to_timestamp(col(c)),\n                source_tz\n            )\n        )\n        # Add ISO-8601 string column for downstream\n        df = df.withColumn(\n            f"{c}_iso",\n            date_format(col(c), "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")\n        )\n    return df`
          : `# AWS Glue — timestamp standardization\nfrom pyspark.sql.functions import col, to_timestamp, from_utc_timestamp, date_format\n\ndef standardize_timestamps(df, date_cols, source_tz="UTC"):\n    """Convert all timestamps to UTC ISO-8601."""\n    for c in date_cols:\n        df = df.withColumn(c, to_timestamp(col(c)))\n        df = df.withColumn(f"{c}_iso", date_format(col(c), "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"))\n    return df`,
        language: "pyspark",
        reusable: true,
        dependencies: [],
      });
    }
  }

  // Type conversions
  const typeIntents = grouped.get("type-conversion") || [];
  if (typeIntents.length > 0) {
    const castOps = typeIntents.map((i) => {
      const m = i.description.match(/cast\s+(\w+)\s+to\s+(\w+)/i) || i.description.match(/(\w+).*→.*(\w+)/);
      return m ? { from: m[1], to: m[2] } : null;
    }).filter(Boolean);

    transforms.push({
      id: `xform-${transforms.length + 1}`,
      intentId: typeIntents[0].id,
      category: "type-conversion",
      name: "apply_type_conversions",
      description: `Type-safe conversions for ${typeIntents.length} fields with error handling`,
      code: `# Cloud-native type conversion with error capture\nfrom pyspark.sql.functions import col, when, lit\nfrom pyspark.sql.types import StringType, IntegerType, LongType, DoubleType, TimestampType, DecimalType\n\nTYPE_MAP = {\n    "string": StringType(),\n    "int": IntegerType(),\n    "integer": IntegerType(),\n    "long": LongType(),\n    "double": DoubleType(),\n    "decimal": DecimalType(18, 6),\n    "timestamp": TimestampType(),\n}\n\ndef safe_cast(df, conversions, error_col="_cast_errors"):\n    """Apply type conversions with error tracking.\n    conversions: list of {"column": str, "target_type": str}\n    """\n    df = df.withColumn(error_col, lit(""))\n    \n    for conv in conversions:\n        col_name = conv["column"]\n        target = TYPE_MAP.get(conv["target_type"].lower())\n        if not target:\n            continue\n        \n        casted = col(col_name).cast(target)\n        df = df.withColumn(\n            error_col,\n            when(\n                casted.isNull() & col(col_name).isNotNull(),\n                concat(col(error_col), lit(f"{col_name}: cast failed; "))\n            ).otherwise(col(error_col))\n        )\n        df = df.withColumn(col_name, casted)\n    \n    return df`,
      language: "pyspark",
      reusable: true,
      dependencies: [],
    });
  }

  // Deduplication
  const dedupIntents = grouped.get("deduplication") || [];
  if (dedupIntents.length > 0) {
    const hasWindowDedup = dedupIntents.some((i) => /window|row_number|rank/i.test(i.description));

    transforms.push({
      id: `xform-${transforms.length + 1}`,
      intentId: dedupIntents[0].id,
      category: "deduplication",
      name: "deduplicate_records",
      description: hasWindowDedup
        ? "Window-function deduplication — keep latest record per key"
        : "Hash-based deduplication by composite key",
      code: isToAzure
        ? `# Databricks — intelligent deduplication\nfrom pyspark.sql.functions import col, row_number, sha2, concat_ws\nfrom pyspark.sql.window import Window\n\ndef deduplicate(df, key_cols, order_col=None, order_desc=True):\n    """Deduplicate keeping the latest record per composite key.\n    Falls back to hash-based dedup if no ordering column.\n    """\n    if order_col:\n        window = Window.partitionBy(*[col(k) for k in key_cols])\n        if order_desc:\n            window = window.orderBy(col(order_col).desc())\n        else:\n            window = window.orderBy(col(order_col).asc())\n        \n        df = df.withColumn("_dedup_rank", row_number().over(window))\n        df = df.filter(col("_dedup_rank") == 1).drop("_dedup_rank")\n    else:\n        df = df.dropDuplicates(key_cols)\n    \n    return df\n\ndef dedup_with_audit(df, key_cols, order_col=None):\n    """Dedup with audit trail — returns (deduped_df, removed_df)."""\n    before_count = df.count()\n    deduped = deduplicate(df, key_cols, order_col)\n    after_count = deduped.count()\n    \n    removed = df.subtract(deduped)\n    print(f"Dedup: {before_count} → {after_count} (removed {before_count - after_count})")\n    \n    return deduped, removed`
        : `# AWS Glue — deduplication\nfrom pyspark.sql.functions import col, row_number\nfrom pyspark.sql.window import Window\n\ndef deduplicate(dynamic_frame, key_cols, order_col=None, glue_ctx=None):\n    df = dynamic_frame.toDF()\n    if order_col:\n        w = Window.partitionBy(*[col(k) for k in key_cols]).orderBy(col(order_col).desc())\n        df = df.withColumn("_rn", row_number().over(w)).filter(col("_rn") == 1).drop("_rn")\n    else:\n        df = df.dropDuplicates(key_cols)\n    return DynamicFrame.fromDF(df, glue_ctx, "deduped")`,
      language: "pyspark",
      reusable: true,
      dependencies: [],
    });
  }

  // Data enrichment
  const enrichIntents = grouped.get("data-enrichment") || [];
  if (enrichIntents.length > 0) {
    transforms.push({
      id: `xform-${transforms.length + 1}`,
      intentId: enrichIntents[0].id,
      category: "data-enrichment",
      name: "enrich_with_lookups",
      description: "Join-based enrichment from dimension/reference tables",
      code: isToAzure
        ? `# Databricks — configurable enrichment pipeline\nfrom pyspark.sql.functions import col, broadcast\n\ndef enrich(df, lookups, spark):\n    """Enrich a DataFrame with multiple lookup tables.\n    lookups: list of {\n        "table": "catalog.schema.dim_table",\n        "join_key": "id",\n        "source_key": "dim_id",\n        "select_cols": ["name", "category"],\n        "broadcast": True  # for small dimensions\n    }\n    """\n    for lookup in lookups:\n        dim_df = spark.table(lookup["table"])\n        if lookup.get("broadcast", False):\n            dim_df = broadcast(dim_df)\n        \n        select_cols = [col(f"dim.{c}").alias(f'{lookup[\"table\"].split(\".\")[-1]}_{c}')\n                       for c in lookup["select_cols"]]\n        \n        df = df.join(\n            dim_df.alias("dim"),\n            col(f"df.{lookup['source_key']}") == col(f"dim.{lookup['join_key']}"),\n            "left"\n        ).select(df["*"], *select_cols)\n    \n    return df`
        : `# AWS Glue — enrichment via catalog joins\nfrom awsglue.transforms import Join\n\ndef enrich(dynamic_frame, lookups, glue_ctx):\n    result = dynamic_frame\n    for lookup in lookups:\n        dim = glue_ctx.create_dynamic_frame.from_catalog(\n            database=lookup["database"],\n            table_name=lookup["table"]\n        )\n        result = Join.apply(result, dim, lookup["source_key"], lookup["join_key"])\n    return result`,
      language: "pyspark",
      reusable: true,
      dependencies: [],
    });
  }

  // PII masking
  if (piiFields.length > 0) {
    transforms.push({
      id: `xform-${transforms.length + 1}`,
      intentId: (grouped.get("pii-masking") || [])[0]?.id || "intent-pii",
      category: "pii-masking",
      name: "mask_pii_fields",
      description: `Mask ${piiFields.length} PII fields with format-preserving techniques`,
      code: isToAzure
        ? `# Databricks — PII masking with format preservation\nfrom pyspark.sql.functions import col, sha2, concat, lit, regexp_replace, when, length, substring\n\nPII_FIELDS = ${JSON.stringify(piiFields)}\n\ndef mask_email(c):\n    return concat(substring(c, 1, 2), lit("***@"), substring(regexp_replace(c, ".*@", ""), 1, 3), lit("..."))\n\ndef mask_phone(c):\n    return concat(lit("***-***-"), substring(c, -4, 4))\n\ndef mask_ssn(c):\n    return concat(lit("***-**-"), substring(c, -4, 4))\n\ndef mask_name(c):\n    return concat(substring(c, 1, 1), lit("*****"))\n\ndef mask_generic(c):\n    return sha2(c.cast("string"), 256)\n\ndef apply_pii_masking(df, pii_config):\n    """Apply format-preserving PII masking.\n    pii_config: dict of {col_name: "email"|"phone"|"ssn"|"name"|"hash"}\n    """\n    maskers = {"email": mask_email, "phone": mask_phone, "ssn": mask_ssn, "name": mask_name, "hash": mask_generic}\n    \n    for col_name, mask_type in pii_config.items():\n        masker = maskers.get(mask_type, mask_generic)\n        df = df.withColumn(\n            col_name,\n            when(col(col_name).isNotNull(), masker(col(col_name))).otherwise(lit(None))\n        )\n    \n    return df\n\n# Purview lineage tag for compliance\n# spark.conf.set("spark.databricks.pii.masking.applied", "true")`
        : `# AWS Glue — PII masking\nfrom pyspark.sql.functions import col, sha2, concat, lit, substring, when\n\nPII_FIELDS = ${JSON.stringify(piiFields)}\n\ndef apply_pii_masking(df, pii_config):\n    for col_name, mask_type in pii_config.items():\n        if mask_type == "hash":\n            df = df.withColumn(col_name, sha2(col(col_name).cast("string"), 256))\n        elif mask_type == "email":\n            df = df.withColumn(col_name, concat(substring(col(col_name), 1, 2), lit("***@***.com")))\n        elif mask_type == "phone":\n            df = df.withColumn(col_name, concat(lit("***-***-"), substring(col(col_name), -4, 4)))\n        else:\n            df = df.withColumn(col_name, sha2(col(col_name).cast("string"), 256))\n    return df`,
      language: "pyspark",
      reusable: true,
      dependencies: [],
    });
  }

  // Business rules
  const bizIntents = grouped.get("business-rule") || [];
  if (bizIntents.length > 0) {
    transforms.push({
      id: `xform-${transforms.length + 1}`,
      intentId: bizIntents[0].id,
      category: "business-rule",
      name: "apply_business_rules",
      description: `${bizIntents.length} conditional business logic transformations`,
      code: `# Cloud-native business rule engine\nfrom pyspark.sql.functions import col, when, lit, expr\n\ndef apply_business_rules(df, rules):\n    """Apply declarative business rules.\n    rules: list of {\n        "name": "classify_priority",\n        "column": "priority_level",\n        "conditions": [\n            {"when": "amount > 10000", "then": "high"},\n            {"when": "amount > 1000", "then": "medium"},\n        ],\n        "otherwise": "low"\n    }\n    """\n    for rule in rules:\n        expression = None\n        for cond in rule["conditions"]:\n            clause = when(expr(cond["when"]), lit(cond["then"]))\n            expression = clause if expression is None else expression.when(expr(cond["when"]), lit(cond["then"]))\n        \n        if rule.get("otherwise"):\n            expression = expression.otherwise(lit(rule["otherwise"]))\n        \n        df = df.withColumn(rule["column"], expression)\n    \n    return df\n\n# Example rule configuration:\n# rules = [\n#     {"name": "status_derive", "column": "status",\n#      "conditions": [{"when": "is_active = true AND last_login > current_date() - 30", "then": "active"}],\n#      "otherwise": "inactive"},\n# ]`,
      language: "pyspark",
      reusable: true,
      dependencies: [],
    });
  }

  // Silver layer orchestration (always generated)
  transforms.push({
    id: `xform-${transforms.length + 1}`,
    intentId: "orchestration",
    category: "schema-standardization",
    name: "silver_pipeline_orchestrator",
    description: "End-to-end Silver layer pipeline composing all transforms",
    code: isToAzure
      ? generateAzurePipeline(transforms)
      : generateAwsPipeline(transforms),
    language: isToAzure ? "pyspark" : "pyspark",
    reusable: false,
    dependencies: transforms.map((t) => t.name),
  });

  return transforms;
}

function generateAzureSchemaRename(pairs: string[][]): string {
  const renameLines = pairs.map(([from, to]) => `        ("${from}", "${to}"),`).join("\n");
  return `# Databricks — schema column standardization\nfrom functools import reduce\n\ndef standardize_columns(df):\n    """Rename columns to target naming convention."""\n    renames = [\n${renameLines}\n    ]\n    return reduce(\n        lambda d, r: d.withColumnRenamed(r[0], r[1]),\n        renames,\n        df\n    )`;
}

function generateAwsSchemaRename(pairs: string[][]): string {
  const mappings = pairs.map(([from, to]) => `        ("${from}", "${to}"),`).join("\n");
  return `# AWS Glue — schema column standardization\nfrom awsglue.transforms import RenameField\n\ndef standardize_columns(dynamic_frame):\n    renames = [\n${mappings}\n    ]\n    result = dynamic_frame\n    for old, new in renames:\n        result = RenameField.apply(result, f"\`{old}\`", f"\`{new}\`")\n    return result`;
}

function generateAzurePipeline(transforms: GeneratedTransform[]): string {
  const steps = transforms
    .filter((t) => t.name !== "silver_pipeline_orchestrator")
    .map((t) => `    # Step: ${t.description}\n    # df = ${t.name}(df, ...config...)`)
    .join("\n\n");

  return `# Databricks Silver Layer Pipeline — Auto-generated
# Unity Catalog: catalog.silver_db.target_table

from pyspark.sql import SparkSession

def run_silver_pipeline(source_table, target_table, spark=None):
    """Execute the complete Silver layer transformation pipeline."""
    spark = spark or SparkSession.builder.getOrCreate()

    # Read Bronze data
    df = spark.table(source_table)
    initial_count = df.count()

${steps}

    # Write to Silver layer (Delta format, merge for idempotency)
    df.write \\
        .format("delta") \\
        .mode("overwrite") \\
        .option("overwriteSchema", "true") \\
        .saveAsTable(target_table)

    final_count = df.count()
    print(f"Silver pipeline: {initial_count} → {final_count} records")
    return {"input": initial_count, "output": final_count, "dropped": initial_count - final_count}`;
}

function generateAwsPipeline(transforms: GeneratedTransform[]): string {
  const steps = transforms
    .filter((t) => t.name !== "silver_pipeline_orchestrator")
    .map((t) => `    # Step: ${t.description}\n    # df = ${t.name}(df, ...config...)`)
    .join("\n\n");

  return `# AWS Glue Silver Layer Pipeline — Auto-generated

import sys
from awsglue.transforms import *
from awsglue.utils import getResolvedOptions
from awsglue.context import GlueContext
from pyspark.context import SparkContext

def run_silver_pipeline():
    args = getResolvedOptions(sys.argv, ["JOB_NAME", "source_db", "source_table", "target_path"])
    sc = SparkContext()
    glueContext = GlueContext(sc)
    spark = glueContext.spark_session

    # Read Bronze data from Glue Catalog
    source = glueContext.create_dynamic_frame.from_catalog(
        database=args["source_db"],
        table_name=args["source_table"]
    )
    df = source.toDF()
    initial_count = df.count()

${steps}

    # Write to Silver (Parquet, partitioned)
    df.write.mode("overwrite").parquet(args["target_path"])

    final_count = df.count()
    print(f"Silver pipeline: {initial_count} → {final_count} records")

run_silver_pipeline()`;
}

// ── Validation rules ────────────────────────────────────────────────────────

function generateValidationRules(intents: TransformIntent[], outputCode: string): ValidationRule[] {
  const rules: ValidationRule[] = [];

  rules.push({
    id: "vr-1",
    name: "row_count_preservation",
    category: "data-quality-validation",
    expression: "abs(target_count - source_count) / source_count < 0.05",
    severity: "error",
    description: "Row count must not drop by more than 5% (unless dedup is intentional)",
    autoFix: false,
  });

  rules.push({
    id: "vr-2",
    name: "null_ratio_check",
    category: "data-quality-validation",
    expression: "null_ratio(col) < 0.10 for critical columns",
    severity: "error",
    description: "Critical columns must have <10% null values after cleansing",
    autoFix: true,
    fixCode: `df = df.fillna({col: default_value})`,
  });

  rules.push({
    id: "vr-3",
    name: "schema_completeness",
    category: "schema-standardization",
    expression: "set(target_schema.columns) >= set(required_columns)",
    severity: "error",
    description: "All required columns must exist in the output schema",
    autoFix: false,
  });

  rules.push({
    id: "vr-4",
    name: "type_cast_success_rate",
    category: "type-conversion",
    expression: "cast_error_count / total_count < 0.01",
    severity: "warning",
    description: "Type conversion errors must be <1% of total records",
    autoFix: true,
    fixCode: `df = df.filter(col("_cast_errors") == "")`,
  });

  rules.push({
    id: "vr-5",
    name: "dedup_key_uniqueness",
    category: "deduplication",
    expression: "df.groupBy(key_cols).count().filter(col('count') > 1).count() == 0",
    severity: "error",
    description: "Primary key columns must be unique after deduplication",
    autoFix: true,
    fixCode: `df = df.dropDuplicates(key_cols)`,
  });

  if (intents.some((i) => i.category === "pii-masking")) {
    rules.push({
      id: "vr-6",
      name: "pii_masking_verification",
      category: "pii-masking",
      expression: "no_pii_field contains original cleartext values",
      severity: "error",
      description: "All PII fields must be masked — no cleartext personal data in Silver layer",
      autoFix: false,
    });

    rules.push({
      id: "vr-7",
      name: "pii_format_preservation",
      category: "pii-masking",
      expression: "masked_field length and format match expected pattern",
      severity: "warning",
      description: "Masked PII should preserve format (e.g., email still looks like a***@d***.com)",
      autoFix: false,
    });
  }

  rules.push({
    id: `vr-${rules.length + 1}`,
    name: "timestamp_timezone_check",
    category: "data-cleansing",
    expression: "all timestamp columns are in UTC timezone",
    severity: "warning",
    description: "All timestamps in Silver layer must be normalized to UTC",
    autoFix: true,
    fixCode: `df = df.withColumn(col, to_utc_timestamp(col(col), source_tz))`,
  });

  rules.push({
    id: `vr-${rules.length + 1}`,
    name: "delta_format_validation",
    category: "schema-standardization",
    expression: "output format is Delta (Databricks) or Parquet (AWS)",
    severity: "warning",
    description: "Silver layer data must be stored in columnar format with ACID guarantees",
    autoFix: false,
  });

  rules.push({
    id: `vr-${rules.length + 1}`,
    name: "business_rule_coverage",
    category: "business-rule",
    expression: "all CASE/WHEN branches produce non-null output",
    severity: "warning",
    description: "Business rule transformations must handle all branches including edge cases",
    autoFix: true,
    fixCode: `expression = expression.otherwise(lit("UNCLASSIFIED"))`,
  });

  rules.push({
    id: `vr-${rules.length + 1}`,
    name: "enrichment_join_coverage",
    category: "data-enrichment",
    expression: "left_join null ratio for enriched columns < 0.20",
    severity: "warning",
    description: "Enrichment joins should match at least 80% of records — low match rate indicates stale dimension data",
    autoFix: false,
  });

  return rules;
}

// ── Metadata generation ─────────────────────────────────────────────────────

function generateMetadata(intents: TransformIntent[], piiFields: string[]): MetadataDefinition[] {
  const fieldMap = new Map<string, MetadataDefinition>();

  for (const intent of intents) {
    for (const field of intent.fields) {
      if (fieldMap.has(field)) {
        const existing = fieldMap.get(field)!;
        existing.transformations.push(intent.description);
        if (intent.category === "pii-masking") existing.piiClassification = "direct";
        if (intent.category === "data-quality-validation") existing.qualityRules.push(intent.description);
        continue;
      }

      let sourceType = "string";
      let targetType = "string";
      if (/id$|_id$|_key$/i.test(field)) { sourceType = "long"; targetType = "long"; }
      else if (/amount|price|total|salary|income|wage/i.test(field)) { sourceType = "decimal(18,2)"; targetType = "decimal(18,2)"; }
      else if (/date|time|created|updated|modified/i.test(field)) { sourceType = "timestamp"; targetType = "timestamp"; }
      else if (/count|num|qty|quantity/i.test(field)) { sourceType = "integer"; targetType = "integer"; }
      else if (/is_|has_|flag|active|enabled/i.test(field)) { sourceType = "boolean"; targetType = "boolean"; }

      let piiClass: "none" | "direct" | "quasi" | "sensitive" = "none";
      if (piiFields.includes(field)) piiClass = "direct";
      else if (/age|gender|zip|city|state/i.test(field)) piiClass = "quasi";
      else if (/salary|income|account/i.test(field)) piiClass = "sensitive";

      fieldMap.set(field, {
        fieldName: field,
        sourceType,
        targetType,
        nullable: !/^id$|_id$/i.test(field),
        piiClassification: piiClass,
        transformations: [intent.description],
        qualityRules: intent.category === "data-quality-validation" ? [intent.description] : [],
      });
    }
  }

  return Array.from(fieldMap.values());
}

// ── Confidence scoring ──────────────────────────────────────────────────────

function computeConfidence(intents: TransformIntent[], transforms: GeneratedTransform[]): number {
  if (intents.length === 0) return 0.3;

  const avgIntentConf = intents.reduce((s, i) => s + i.confidence, 0) / intents.length;
  const categoryCoverage = new Set(intents.map((i) => i.category)).size / 8;
  const transformRatio = transforms.length / Math.max(intents.length, 1);
  const hasReusable = transforms.some((t) => t.reusable) ? 0.1 : 0;
  const hasPii = intents.some((i) => i.category === "pii-masking") ? 0.05 : 0;

  const raw = avgIntentConf * 0.35 + categoryCoverage * 0.25 + Math.min(transformRatio, 1) * 0.2 + hasReusable + hasPii + 0.05;
  return Math.round(Math.min(raw, 0.98) * 100) / 100;
}

// ══════════════════════════════════════════════════════════════════════════════
// PRODUCTION SILVER LAYER ANALYSIS
// ══════════════════════════════════════════════════════════════════════════════

export function analyzeProductionSilver(
  sourceCode: string,
  outputCode: string,
  direction: "aws-to-azure" | "azure-to-aws"
): ProductionSilverResult {
  const base = analyzeSilverLayer(sourceCode, outputCode, direction);
  const fields = base.metadata.map((m) => m.fieldName);
  const keyFields = detectPrimaryKeys(sourceCode, fields);
  const timestampFields = fields.filter((f) => /date|time|created|updated|modified/i.test(f));
  const isToAzure = direction === "aws-to-azure";

  return {
    ...base,
    auditFramework: generateAuditFramework(isToAzure),
    incrementalConfig: generateIncrementalConfig(keyFields, timestampFields, isToAzure, sourceCode),
    errorHandling: generateErrorHandling(isToAzure),
    performanceRecs: generatePerformanceRecs(base, isToAzure),
    schemaDriftChecks: generateSchemaDriftChecks(fields, base.metadata),
    crossLayerDQ: generateCrossLayerDQContracts(keyFields, isToAzure),
    productionPipeline: generateProductionPipeline(base, keyFields, timestampFields, isToAzure),
  };
}

function detectPrimaryKeys(source: string, fields: string[]): string[] {
  const keys: string[] = [];
  const idFields = fields.filter((f) => /^id$|_id$|_key$|_pk$/i.test(f));
  if (idFields.length > 0) return idFields.slice(0, 3);

  if (/PRIMARY\s+KEY\s*\(([^)]+)\)/i.test(source)) {
    const m = source.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
    if (m) keys.push(...m[1].split(",").map((s) => s.trim().replace(/["`]/g, "")));
  }
  if (/partitionBy\s*\(\s*["'](\w+)["']/i.test(source)) {
    const m = source.match(/partitionBy\s*\(\s*["'](\w+)["']/i);
    if (m) keys.push(m[1]);
  }

  if (keys.length === 0 && fields.length > 0) {
    keys.push(fields[0]);
  }
  return [...new Set(keys)];
}

// ── Audit Framework ──────────────────────────────────────────────────────────

function generateAuditFramework(isToAzure: boolean): { code: string; metrics: AuditMetrics } {
  const metrics: AuditMetrics = {
    inputRecordCount: "input_df.count()",
    outputRecordCount: "output_df.count()",
    rejectedRecordCount: "quarantine_df.count()",
    duplicateRecordCount: "duplicate_df.count()",
    processingTimestamp: "datetime.utcnow().isoformat()",
    pipelineRunId: "str(uuid.uuid4())",
    durationSeconds: "(end_time - start_time).total_seconds()",
    schemaVersion: "hashlib.md5(str(output_df.schema).encode()).hexdigest()[:8]",
  };

  const code = isToAzure
    ? `# ═══ Silver Layer Audit Framework ═══
# Databricks / Delta Lake — full lineage tracking

import uuid, hashlib
from datetime import datetime
from pyspark.sql import SparkSession
from pyspark.sql.functions import lit, current_timestamp
from pyspark.sql.types import StructType, StructField, StringType, LongType, DoubleType, TimestampType

AUDIT_SCHEMA = StructType([
    StructField("pipeline_run_id", StringType(), False),
    StructField("pipeline_name", StringType(), False),
    StructField("source_table", StringType(), False),
    StructField("target_table", StringType(), False),
    StructField("input_record_count", LongType(), False),
    StructField("output_record_count", LongType(), False),
    StructField("rejected_record_count", LongType(), False),
    StructField("duplicate_record_count", LongType(), False),
    StructField("schema_version", StringType(), False),
    StructField("processing_start", TimestampType(), False),
    StructField("processing_end", TimestampType(), False),
    StructField("duration_seconds", DoubleType(), False),
    StructField("status", StringType(), False),
    StructField("error_message", StringType(), True),
])

class SilverAuditLogger:
    """Captures pipeline metrics and writes to audit Delta table."""

    def __init__(self, spark: SparkSession, audit_table: str = "catalog.silver_audit.pipeline_runs"):
        self.spark = spark
        self.audit_table = audit_table
        self.run_id = str(uuid.uuid4())
        self.start_time = datetime.utcnow()
        self.metrics = {}

    def capture_input(self, df, label="input"):
        self.metrics[f"{label}_count"] = df.count()
        self.metrics[f"{label}_schema"] = str(df.schema)
        return df

    def capture_output(self, df, label="output"):
        self.metrics[f"{label}_count"] = df.count()
        return df

    def capture_rejected(self, df, label="rejected"):
        self.metrics[f"{label}_count"] = df.count()
        return df

    def capture_duplicates(self, df, label="duplicates"):
        self.metrics[f"{label}_count"] = df.count()
        return df

    def finalize(self, source_table: str, target_table: str, status="SUCCESS", error_msg=None):
        end_time = datetime.utcnow()
        duration = (end_time - self.start_time).total_seconds()
        schema_hash = hashlib.md5(
            self.metrics.get("output_schema", self.metrics.get("input_schema", "")).encode()
        ).hexdigest()[:8]

        row = self.spark.createDataFrame([{
            "pipeline_run_id": self.run_id,
            "pipeline_name": f"silver_{target_table.split('.')[-1]}",
            "source_table": source_table,
            "target_table": target_table,
            "input_record_count": self.metrics.get("input_count", 0),
            "output_record_count": self.metrics.get("output_count", 0),
            "rejected_record_count": self.metrics.get("rejected_count", 0),
            "duplicate_record_count": self.metrics.get("duplicates_count", 0),
            "schema_version": schema_hash,
            "processing_start": self.start_time,
            "processing_end": end_time,
            "duration_seconds": duration,
            "status": status,
            "error_message": error_msg,
        }], schema=AUDIT_SCHEMA)

        row.write.format("delta").mode("append").saveAsTable(self.audit_table)
        print(f"[AUDIT] Run {self.run_id}: {self.metrics.get('input_count',0)} → "
              f"{self.metrics.get('output_count',0)} records "
              f"({self.metrics.get('rejected_count',0)} rejected, "
              f"{self.metrics.get('duplicates_count',0)} deduped) "
              f"in {duration:.1f}s — {status}")`
    : `# ═══ Silver Layer Audit Framework ═══
# AWS Glue — CloudWatch metrics + Glue Catalog audit table

import uuid, hashlib, time, json
from datetime import datetime
import boto3

class SilverAuditLogger:
    """Pipeline audit logger with CloudWatch metric emission."""

    def __init__(self, job_name: str, region: str = "us-east-1"):
        self.run_id = str(uuid.uuid4())
        self.job_name = job_name
        self.start_time = time.time()
        self.metrics = {}
        self.cw = boto3.client("cloudwatch", region_name=region)

    def capture_input(self, df, label="input"):
        self.metrics[f"{label}_count"] = df.count()
        return df

    def capture_output(self, df, label="output"):
        self.metrics[f"{label}_count"] = df.count()
        return df

    def capture_rejected(self, df, label="rejected"):
        self.metrics[f"{label}_count"] = df.count()
        return df

    def finalize(self, status="SUCCESS", error_msg=None):
        duration = time.time() - self.start_time
        self.cw.put_metric_data(
            Namespace="SilverPipeline",
            MetricData=[
                {"MetricName": "InputRecords", "Value": self.metrics.get("input_count", 0), "Unit": "Count",
                 "Dimensions": [{"Name": "JobName", "Value": self.job_name}]},
                {"MetricName": "OutputRecords", "Value": self.metrics.get("output_count", 0), "Unit": "Count",
                 "Dimensions": [{"Name": "JobName", "Value": self.job_name}]},
                {"MetricName": "RejectedRecords", "Value": self.metrics.get("rejected_count", 0), "Unit": "Count",
                 "Dimensions": [{"Name": "JobName", "Value": self.job_name}]},
                {"MetricName": "DurationSeconds", "Value": duration, "Unit": "Seconds",
                 "Dimensions": [{"Name": "JobName", "Value": self.job_name}]},
            ]
        )
        print(json.dumps({"run_id": self.run_id, "status": status,
                           "input": self.metrics.get("input_count", 0),
                           "output": self.metrics.get("output_count", 0),
                           "rejected": self.metrics.get("rejected_count", 0),
                           "duration_s": round(duration, 1), "error": error_msg}))`;

  return { code, metrics };
}

// ── Incremental Processing ───────────────────────────────────────────────────

function generateIncrementalConfig(
  keyFields: string[],
  timestampFields: string[],
  isToAzure: boolean,
  source: string
): IncrementalConfig {
  const hasCdc = /cdc|change_data|change_feed|changeTracking|binlog|wal/i.test(source);
  const hasMerge = /MERGE\s+INTO|UPSERT|ON\s+CONFLICT/i.test(source);
  const watermark = timestampFields[0] || "updated_at";
  const keys = keyFields.length > 0 ? keyFields : ["id"];
  const keyCond = keys.map((k) => `target.${k} = source.${k}`).join(" AND ");
  const strategy: IncrementalConfig["strategy"] = hasCdc ? "cdc" : hasMerge ? "upsert" : "delta-merge";

  const code = isToAzure
    ? `# ═══ Incremental Processing — Delta Merge ═══
from delta.tables import DeltaTable
from pyspark.sql.functions import col, current_timestamp, lit

def incremental_merge(spark, source_df, target_table, merge_keys, watermark_col="${watermark}"):
    """
    Delta MERGE with SCD Type 1 semantics.
    - INSERT new records
    - UPDATE changed records (matched on merge_keys)
    - Idempotent: safe to retry on failure
    """
    # Add processing metadata
    source_df = (source_df
        .withColumn("_silver_loaded_at", current_timestamp())
        .withColumn("_silver_version", lit(1))
    )

    # Check if target exists
    if not spark.catalog.tableExists(target_table):
        source_df.write.format("delta").saveAsTable(target_table)
        print(f"[INCREMENTAL] Created new table {target_table} with {source_df.count()} records")
        return source_df

    target = DeltaTable.forName(spark, target_table)

    merge_result = (target.alias("target")
        .merge(
            source_df.alias("source"),
            "${keyCond}"
        )
        .whenMatchedUpdate(
            condition="source.${watermark} > target.${watermark}",
            set={
                **{c: f"source.{c}" for c in source_df.columns if not c.startswith("_")},
                "_silver_loaded_at": "current_timestamp()",
                "_silver_version": "target._silver_version + 1",
            }
        )
        .whenNotMatchedInsertAll()
        .execute()
    )

    print(f"[INCREMENTAL] Merge completed on {target_table}")
    return merge_result


def cdc_merge(spark, cdc_df, target_table, merge_keys, operation_col="op"):
    """
    CDC-aware merge handling INSERT/UPDATE/DELETE operations.
    Expects cdc_df to have an operation column: 'I' (insert), 'U' (update), 'D' (delete).
    """
    if not spark.catalog.tableExists(target_table):
        insert_df = cdc_df.filter(col(operation_col).isin("I", "U"))
        insert_df.drop(operation_col).write.format("delta").saveAsTable(target_table)
        return

    target = DeltaTable.forName(spark, target_table)

    (target.alias("target")
        .merge(cdc_df.alias("source"), "${keyCond}")
        .whenMatchedDelete(condition="source.op = 'D'")
        .whenMatchedUpdateAll(condition="source.op = 'U'")
        .whenNotMatchedInsertAll(condition="source.op = 'I'")
        .execute()
    )`
    : `# ═══ Incremental Processing — Upsert ═══
from pyspark.sql.functions import col, current_timestamp, lit
from awsglue.context import GlueContext

def incremental_upsert(glue_ctx, source_df, target_path, merge_keys):
    """
    Incremental upsert using Glue bookmarks + dedup.
    Bookmark tracks already-processed data; dedup ensures idempotency.
    """
    source_df = source_df.withColumn("_silver_loaded_at", current_timestamp())

    # Read existing target (if exists)
    try:
        target_df = glue_ctx.spark_session.read.parquet(target_path)
        key_cond = " AND ".join([f"src.{k} = tgt.{k}" for k in merge_keys])

        # Anti-join: new records not in target
        new_records = source_df.alias("src").join(
            target_df.alias("tgt"),
            [col(f"src.{k}") == col(f"tgt.{k}") for k in merge_keys],
            "left_anti"
        )

        # Updated records (source is newer)
        updated = source_df.alias("src").join(
            target_df.alias("tgt"),
            [col(f"src.{k}") == col(f"tgt.{k}") for k in merge_keys],
            "inner"
        ).select("src.*")

        # Unchanged target records
        unchanged = target_df.alias("tgt").join(
            source_df.alias("src"),
            [col(f"src.{k}") == col(f"tgt.{k}") for k in merge_keys],
            "left_anti"
        )

        merged = unchanged.unionByName(updated, allowMissingColumns=True)\\
                          .unionByName(new_records, allowMissingColumns=True)
        merged.write.mode("overwrite").parquet(target_path)
    except Exception:
        # First run — no target yet
        source_df.write.mode("overwrite").parquet(target_path)`;

  return {
    strategy,
    mergeKeys: keys,
    sequenceColumn: watermark,
    watermarkColumn: watermark,
    code,
    description: strategy === "cdc"
      ? "CDC-aware merge handling INSERT/UPDATE/DELETE operations from change feeds"
      : `Delta merge on keys [${keys.join(", ")}] with watermark '${watermark}' — retry-safe, idempotent`,
  };
}

// ── Error Handling ───────────────────────────────────────────────────────────

function generateErrorHandling(isToAzure: boolean): ErrorHandlingSpec[] {
  const specs: ErrorHandlingSpec[] = [];

  specs.push({
    id: "err-1",
    name: "quarantine_bad_records",
    type: "quarantine",
    description: "Isolate records that fail schema validation or type casting into a quarantine table for manual review",
    retrySafe: true,
    code: isToAzure
      ? `# ═══ Record Quarantine ═══
from pyspark.sql.functions import col, lit, current_timestamp, struct, to_json

def quarantine_bad_records(df, validation_col="_validation_errors", quarantine_table="catalog.silver_quarantine.failed_records"):
    """
    Split DataFrame into valid and quarantined records.
    Returns (valid_df, quarantine_df).
    """
    valid_df = df.filter(
        (col(validation_col).isNull()) | (col(validation_col) == "")
    ).drop(validation_col)

    quarantine_df = df.filter(
        col(validation_col).isNotNull() & (col(validation_col) != "")
    ).select(
        lit(current_timestamp()).alias("quarantined_at"),
        col(validation_col).alias("failure_reason"),
        to_json(struct(*[col(c) for c in df.columns if c != validation_col])).alias("original_record")
    )

    if quarantine_df.count() > 0:
        quarantine_df.write.format("delta").mode("append").saveAsTable(quarantine_table)
        print(f"[QUARANTINE] {quarantine_df.count()} records sent to {quarantine_table}")

    return valid_df, quarantine_df`
      : `# ═══ Record Quarantine ═══
from pyspark.sql.functions import col, lit, current_timestamp, to_json, struct

def quarantine_bad_records(df, validation_col="_validation_errors", quarantine_path="s3://data-lake/quarantine/"):
    valid_df = df.filter((col(validation_col).isNull()) | (col(validation_col) == "")).drop(validation_col)
    quarantine_df = df.filter(col(validation_col).isNotNull() & (col(validation_col) != ""))
    if quarantine_df.count() > 0:
        quarantine_df.write.mode("append").json(quarantine_path)
    return valid_df, quarantine_df`,
  });

  specs.push({
    id: "err-2",
    name: "exception_logging",
    type: "log-and-skip",
    description: "Structured exception logging with full stack trace, record context, and pipeline metadata",
    retrySafe: true,
    code: isToAzure
      ? `# ═══ Exception Logger ═══
import traceback, json, logging
from datetime import datetime

logger = logging.getLogger("silver_pipeline")

class PipelineExceptionHandler:
    """Catch, log, and optionally retry pipeline stage failures."""

    def __init__(self, run_id: str, stage_name: str):
        self.run_id = run_id
        self.stage_name = stage_name
        self.errors = []

    def safe_execute(self, func, df, *args, fallback_df=None, **kwargs):
        """Execute a transform function with error capture."""
        try:
            result = func(df, *args, **kwargs)
            return result
        except Exception as e:
            error_entry = {
                "timestamp": datetime.utcnow().isoformat(),
                "run_id": self.run_id,
                "stage": self.stage_name,
                "error_type": type(e).__name__,
                "error_message": str(e),
                "stack_trace": traceback.format_exc(),
                "record_count": df.count() if df else 0,
            }
            self.errors.append(error_entry)
            logger.error(json.dumps(error_entry))

            if fallback_df is not None:
                return fallback_df
            return df  # Pass through unchanged on failure

    def get_errors(self):
        return self.errors`
      : `# ═══ Exception Logger ═══
import traceback, json, logging
from datetime import datetime

logger = logging.getLogger("silver_pipeline")

class PipelineExceptionHandler:
    def __init__(self, run_id, stage_name):
        self.run_id = run_id
        self.stage_name = stage_name
        self.errors = []

    def safe_execute(self, func, df, *args, fallback_df=None, **kwargs):
        try:
            return func(df, *args, **kwargs)
        except Exception as e:
            self.errors.append({"stage": self.stage_name, "error": str(e),
                                "trace": traceback.format_exc()})
            logger.error(json.dumps(self.errors[-1]))
            return fallback_df if fallback_df is not None else df`,
  });

  specs.push({
    id: "err-3",
    name: "retry_wrapper",
    type: "retry",
    description: "Exponential backoff retry wrapper for transient failures (network, throttling, lock contention)",
    retrySafe: true,
    code: `# ═══ Retry Wrapper ═══
import time, functools, logging

logger = logging.getLogger("silver_pipeline")

def retry_on_transient(max_retries=3, base_delay=2.0, backoff_factor=2.0,
                       retryable_exceptions=(Exception,)):
    """Decorator: retry with exponential backoff on transient failures."""
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except retryable_exceptions as e:
                    last_exception = e
                    if attempt < max_retries:
                        delay = base_delay * (backoff_factor ** attempt)
                        logger.warning(
                            f"[RETRY] {func.__name__} attempt {attempt+1}/{max_retries} "
                            f"failed: {e}. Retrying in {delay:.1f}s..."
                        )
                        time.sleep(delay)
                    else:
                        logger.error(f"[RETRY] {func.__name__} exhausted {max_retries} retries")
                        raise last_exception
        return wrapper
    return decorator

# Usage:
# @retry_on_transient(max_retries=3, retryable_exceptions=(ConnectionError, TimeoutError))
# def read_source_table(spark, table_name):
#     return spark.table(table_name)`,
  });

  return specs;
}

// ── Performance Recommendations ──────────────────────────────────────────────

function generatePerformanceRecs(base: SilverLayerResult, isToAzure: boolean): PerformanceRec[] {
  const recs: PerformanceRec[] = [];
  let pid = 0;
  const mkId = () => `perf-${++pid}`;

  const hasJoins = base.intents.some((i) => i.category === "data-enrichment");
  const hasDedup = base.intents.some((i) => i.category === "deduplication");

  if (hasJoins) {
    recs.push({
      id: mkId(), title: "Broadcast Small Dimension Tables",
      type: "broadcast-join",
      description: "Dimension tables under 100MB should use broadcast joins to avoid shuffle — 5-10x faster for lookup enrichment",
      estimatedImpact: "high",
      code: isToAzure
        ? `# Broadcast join for small dimensions
from pyspark.sql.functions import broadcast

# Auto-broadcast threshold (default 10MB, increase for larger dims)
spark.conf.set("spark.sql.autoBroadcastJoinThreshold", "104857600")  # 100MB

# Explicit broadcast for known-small tables
dim_region = broadcast(spark.table("catalog.silver.dim_region"))
df = df.join(dim_region, df.region_id == dim_region.id, "left")`
        : `# Broadcast join for small dimensions
from pyspark.sql.functions import broadcast

spark.conf.set("spark.sql.autoBroadcastJoinThreshold", "104857600")
dim_df = broadcast(spark.read.parquet("s3://dims/region/"))
df = df.join(dim_df, "region_id", "left")`,
    });
  }

  recs.push({
    id: mkId(), title: "Partition by Processing Date",
    type: "partitioning",
    description: "Partition Silver tables by processing date for efficient time-range queries and incremental reads",
    estimatedImpact: "high",
    code: isToAzure
      ? `# Partition strategy for Silver tables
from pyspark.sql.functions import year, month, dayofmonth, col

df = (df
    .withColumn("_year", year(col("processed_at")))
    .withColumn("_month", month(col("processed_at")))
    .withColumn("_day", dayofmonth(col("processed_at")))
)

df.write \\
    .format("delta") \\
    .partitionBy("_year", "_month", "_day") \\
    .option("overwriteSchema", "true") \\
    .saveAsTable("catalog.silver.target_table")

# Verify partition pruning works
spark.sql("DESCRIBE DETAIL catalog.silver.target_table").select("numFiles", "sizeInBytes").show()`
      : `# Partition by date for Glue/Athena query efficiency
df.write \\
    .mode("overwrite") \\
    .partitionBy("year", "month", "day") \\
    .parquet("s3://data-lake/silver/target_table/")`,
  });

  if (isToAzure) {
    recs.push({
      id: mkId(), title: "OPTIMIZE + Z-ORDER on Query Columns",
      type: "z-order",
      description: "Z-ORDER indexes co-locate related data for 10-100x faster point lookups and range scans on Silver tables",
      estimatedImpact: "high",
      code: `# Run after initial load and periodically via scheduled job
# Z-ORDER on most-queried filter/join columns

OPTIMIZE catalog.silver.target_table
  ZORDER BY (customer_id, region, product_category);

-- Schedule as Databricks job:
-- Frequency: daily or after each Silver pipeline run
-- Compact small files + reorder by Z-ORDER columns

-- Check file metrics after optimization:
DESCRIBE DETAIL catalog.silver.target_table;`,
    });
  }

  recs.push({
    id: mkId(), title: "Cache Frequently Re-used DataFrames",
    type: "caching",
    description: "Cache intermediate DataFrames that are referenced multiple times in the pipeline to avoid recomputation",
    estimatedImpact: "medium",
    code: `# Cache strategy for multi-reference DataFrames
from pyspark import StorageLevel

# Cache after expensive operations (joins, aggregations)
enriched_df = enrich(df, lookups, spark)
enriched_df.persist(StorageLevel.MEMORY_AND_DISK)

# Materialize the cache (trigger computation)
enriched_df.count()

# Use cached df in multiple downstream operations
valid_df = validate(enriched_df)
deduped_df = deduplicate(enriched_df, key_cols)

# Unpersist when no longer needed
enriched_df.unpersist()`,
  });

  if (hasDedup) {
    recs.push({
      id: mkId(), title: "Coalesce Before Write",
      type: "coalesce",
      description: "After filtering/deduplication reduces row count significantly, coalesce to optimal partition count before writing",
      estimatedImpact: "medium",
      code: `# Optimal file size: 128MB-256MB per partition
import math

target_file_size_mb = 128
estimated_row_size_bytes = 500  # Adjust based on schema
row_count = df.count()
estimated_total_mb = (row_count * estimated_row_size_bytes) / (1024 * 1024)
optimal_partitions = max(1, math.ceil(estimated_total_mb / target_file_size_mb))

df = df.coalesce(optimal_partitions)
print(f"Writing {row_count} rows in {optimal_partitions} partitions (~{target_file_size_mb}MB each)")`,
    });
  }

  recs.push({
    id: mkId(), title: "Enable Adaptive Query Execution",
    type: "adaptive-query",
    description: "AQE dynamically optimizes shuffle partitions, join strategies, and skew handling at runtime",
    estimatedImpact: "medium",
    code: isToAzure
      ? `# Databricks AQE (enabled by default on DBR 7.3+, verify settings)
spark.conf.set("spark.sql.adaptive.enabled", "true")
spark.conf.set("spark.sql.adaptive.coalescePartitions.enabled", "true")
spark.conf.set("spark.sql.adaptive.skewJoin.enabled", "true")

# Tune shuffle partitions for Silver workloads
spark.conf.set("spark.sql.adaptive.coalescePartitions.initialPartitionNum", "200")
spark.conf.set("spark.sql.adaptive.advisoryPartitionSizeInBytes", "128MB")`
      : `# Glue/EMR — enable AQE
spark.conf.set("spark.sql.adaptive.enabled", "true")
spark.conf.set("spark.sql.adaptive.coalescePartitions.enabled", "true")
spark.conf.set("spark.sql.adaptive.skewJoin.enabled", "true")`,
  });

  return recs;
}

// ── Schema Drift Detection ───────────────────────────────────────────────────

function generateSchemaDriftChecks(fields: string[], metadata: MetadataDefinition[]): SchemaDriftCheck[] {
  const checks: SchemaDriftCheck[] = [];
  let sid = 0;
  const mkId = () => `drift-${++sid}`;

  checks.push({
    id: mkId(), name: "required_columns_present",
    checkType: "required-column",
    description: "Validate all required columns exist in incoming data before processing",
    severity: "error",
    code: `# ═══ Required Column Validation ═══
REQUIRED_COLUMNS = ${JSON.stringify(fields.slice(0, 15))}

def validate_required_columns(df, required=REQUIRED_COLUMNS):
    """Fail-fast if required columns are missing from source."""
    incoming = set(df.columns)
    missing = [c for c in required if c not in incoming]
    if missing:
        raise SchemaValidationError(
            f"Missing required columns: {missing}. "
            f"Expected: {required}. Got: {sorted(incoming)}"
        )
    return df

class SchemaValidationError(Exception):
    pass`,
  });

  checks.push({
    id: mkId(), name: "data_type_validation",
    checkType: "data-type",
    description: "Verify column data types match expected schema — detect silent type changes from upstream",
    severity: "error",
    code: `# ═══ Data Type Validation ═══
EXPECTED_TYPES = {
${metadata.slice(0, 10).map((m) => `    "${m.fieldName}": "${m.targetType}",`).join("\n")}
}

def validate_data_types(df, expected=EXPECTED_TYPES):
    """Check actual vs expected data types. Warn on mismatch."""
    mismatches = []
    for col_name, expected_type in expected.items():
        if col_name not in df.columns:
            continue
        actual_type = str(df.schema[col_name].dataType).lower()
        if expected_type.lower() not in actual_type:
            mismatches.append({
                "column": col_name,
                "expected": expected_type,
                "actual": actual_type
            })
    if mismatches:
        print(f"[SCHEMA DRIFT] Type mismatches detected: {mismatches}")
    return mismatches`,
  });

  checks.push({
    id: mkId(), name: "new_column_detection",
    checkType: "new-column",
    description: "Detect new columns added by upstream that are not in the expected schema — may indicate schema evolution",
    severity: "warning",
    code: `# ═══ New Column Detection ═══
KNOWN_COLUMNS = set(${JSON.stringify(fields.slice(0, 20))})

def detect_new_columns(df, known=KNOWN_COLUMNS):
    """Detect columns not in the expected schema."""
    incoming = set(df.columns)
    new_cols = incoming - known
    if new_cols:
        print(f"[SCHEMA DRIFT] New columns detected: {sorted(new_cols)}")
        print("Action: Review and add to schema definition if needed")
    return sorted(new_cols)`,
  });

  checks.push({
    id: mkId(), name: "removed_column_detection",
    checkType: "removed-column",
    description: "Detect columns that were expected but are no longer present in upstream data",
    severity: "warning",
    code: `# ═══ Removed Column Detection ═══
EXPECTED_COLUMNS = set(${JSON.stringify(fields.slice(0, 20))})

def detect_removed_columns(df, expected=EXPECTED_COLUMNS):
    """Detect columns dropped by upstream."""
    incoming = set(df.columns)
    removed = expected - incoming
    if removed:
        print(f"[SCHEMA DRIFT] Columns removed from source: {sorted(removed)}")
        print("Action: Update pipeline or add default values for missing columns")
    return sorted(removed)`,
  });

  checks.push({
    id: mkId(), name: "full_schema_drift_report",
    checkType: "new-column",
    description: "Comprehensive schema drift report comparing current batch to registered schema",
    severity: "info",
    code: `# ═══ Full Schema Drift Report ═══
from datetime import datetime

def schema_drift_report(df, registered_schema, table_name):
    """Generate comprehensive drift report."""
    incoming_cols = {f.name: str(f.dataType) for f in df.schema.fields}
    registered_cols = {f.name: str(f.dataType) for f in registered_schema.fields}

    report = {
        "timestamp": datetime.utcnow().isoformat(),
        "table": table_name,
        "new_columns": [c for c in incoming_cols if c not in registered_cols],
        "removed_columns": [c for c in registered_cols if c not in incoming_cols],
        "type_changes": [
            {"column": c, "old": registered_cols[c], "new": incoming_cols[c]}
            for c in incoming_cols
            if c in registered_cols and incoming_cols[c] != registered_cols[c]
        ],
        "is_compatible": True,
    }

    if report["removed_columns"] or report["type_changes"]:
        report["is_compatible"] = False

    return report`,
  });

  return checks;
}

// ── Cross-Layer Data Quality Contracts ───────────────────────────────────────

function generateCrossLayerDQContracts(keyFields: string[], isToAzure: boolean): CrossLayerDQContract[] {
  const contracts: CrossLayerDQContract[] = [];
  const silverCatalog = isToAzure ? "catalog.silver" : "silver_db";
  const bronzeCatalog = isToAzure ? "catalog.bronze" : "bronze_db";
  const keysStr = JSON.stringify(keyFields);

  contracts.push({
    id: "dq-xlayer-1",
    name: "Bronze → Silver Record Reconciliation",
    checkType: "reconciliation",
    severity: "critical",
    blockDownstream: true,
    description: "Verify every Bronze input record is accounted for in Silver output + quarantine — no silent data loss",
    code: `# ═══ Bronze → Silver Record Reconciliation ═══
from pyspark.sql import SparkSession

class BronzeSilverReconciler:
    """Ensures zero data loss between Bronze and Silver layers."""

    def __init__(self, spark: SparkSession, tolerance_pct: float = 0.01):
        self.spark = spark
        self.tolerance_pct = tolerance_pct

    def reconcile(self, bronze_table: str, silver_table: str,
                  quarantine_table: str, run_id: str) -> dict:
        bronze_count = self.spark.table(bronze_table).count()
        silver_count = self.spark.table(silver_table) \\
            .filter(f"_silver_run_id = '{run_id}'").count()

        quarantine_count = 0
        try:
            quarantine_count = self.spark.table(quarantine_table) \\
                .filter(f"run_id = '{run_id}'").count()
        except Exception:
            pass

        accounted = silver_count + quarantine_count
        gap = bronze_count - accounted
        gap_pct = (gap / bronze_count * 100) if bronze_count > 0 else 0

        result = {
            "bronze_count": bronze_count,
            "silver_count": silver_count,
            "quarantine_count": quarantine_count,
            "accounted_total": accounted,
            "gap": gap,
            "gap_pct": round(gap_pct, 4),
            "status": "PASS" if gap_pct <= self.tolerance_pct else "FAIL",
        }

        if result["status"] == "FAIL":
            raise ReconciliationError(
                f"Bronze→Silver reconciliation FAILED: {gap} records unaccounted "
                f"({gap_pct:.2f}% > tolerance {self.tolerance_pct}%). "
                f"Bronze={bronze_count}, Silver={silver_count}, Quarantine={quarantine_count}"
            )

        print(f"[RECONCILE] PASS: Bronze({bronze_count}) = Silver({silver_count}) + "
              f"Quarantine({quarantine_count}), gap={gap} ({gap_pct:.4f}%)")
        return result

class ReconciliationError(Exception):
    pass`,
  });

  contracts.push({
    id: "dq-xlayer-2",
    name: "Circuit Breaker — Error Rate Gate",
    checkType: "circuit-breaker",
    severity: "critical",
    blockDownstream: true,
    description: "Halt pipeline and block Gold refresh when quarantine error rate exceeds 5% of input — prevents bad data propagation",
    code: `# ═══ Circuit Breaker — Error Rate Gate ═══

class SilverCircuitBreaker:
    """
    Trips when error rate exceeds threshold.
    When tripped: blocks Gold layer refresh, sends PagerDuty alert, writes incident record.
    """

    def __init__(self, error_threshold_pct: float = 5.0,
                 consecutive_failures: int = 3):
        self.error_threshold_pct = error_threshold_pct
        self.consecutive_failures = consecutive_failures
        self.failure_count = 0
        self.is_open = False

    def evaluate(self, input_count: int, rejected_count: int,
                 run_id: str) -> dict:
        error_pct = (rejected_count / input_count * 100) if input_count > 0 else 0

        if error_pct > self.error_threshold_pct:
            self.failure_count += 1
            if self.failure_count >= self.consecutive_failures:
                self.is_open = True

            return {
                "status": "TRIPPED" if self.is_open else "WARNING",
                "error_pct": round(error_pct, 2),
                "threshold_pct": self.error_threshold_pct,
                "consecutive_failures": self.failure_count,
                "action": "BLOCK_GOLD_REFRESH" if self.is_open else "ALERT_ONLY",
                "run_id": run_id,
            }

        self.failure_count = 0
        self.is_open = False
        return {
            "status": "CLOSED",
            "error_pct": round(error_pct, 2),
            "action": "PROCEED",
            "run_id": run_id,
        }

    def allow_downstream(self) -> bool:
        if self.is_open:
            raise CircuitBreakerTripped(
                f"Circuit breaker OPEN — {self.failure_count} consecutive failures "
                f"exceeding {self.error_threshold_pct}% error threshold. "
                f"Gold layer refresh BLOCKED. Manual review required."
            )
        return True

class CircuitBreakerTripped(Exception):
    pass`,
  });

  contracts.push({
    id: "dq-xlayer-3",
    name: "Silver → Gold Handshake Contract",
    checkType: "handshake",
    severity: "high",
    blockDownstream: false,
    description: "Publish Silver layer readiness signal with record counts, freshness, and schema hash — Gold reads this before starting",
    code: isToAzure
      ? `# ═══ Silver → Gold Handshake Contract ═══
from pyspark.sql import SparkSession
from pyspark.sql.functions import lit, current_timestamp
import hashlib

def publish_silver_readiness(spark: SparkSession, silver_table: str,
                             run_id: str, record_count: int):
    """
    Write a readiness signal that Gold layer checks before processing.
    Gold pipeline should: SELECT * FROM catalog.silver_contracts.readiness
    WHERE silver_table = '...' AND status = 'READY' AND published_at > (now - 4h)
    """
    schema_hash = hashlib.md5(
        str(spark.table(silver_table).schema).encode()
    ).hexdigest()[:12]

    signal = spark.createDataFrame([{
        "silver_table": silver_table,
        "run_id": run_id,
        "record_count": record_count,
        "schema_hash": schema_hash,
        "status": "READY",
        "published_at": None,
    }]).withColumn("published_at", current_timestamp())

    signal.write.format("delta").mode("append") \\
        .saveAsTable("catalog.silver_contracts.readiness")

    print(f"[HANDSHAKE] Published readiness for {silver_table}: "
          f"{record_count} records, schema={schema_hash}")


def verify_silver_readiness(spark: SparkSession, silver_table: str,
                            max_stale_hours: int = 4) -> bool:
    """Called by Gold pipeline before starting."""
    latest = spark.sql(f"""
        SELECT * FROM catalog.silver_contracts.readiness
        WHERE silver_table = '{silver_table}'
          AND status = 'READY'
          AND published_at > current_timestamp() - INTERVAL {max_stale_hours} HOURS
        ORDER BY published_at DESC LIMIT 1
    """)
    if latest.count() == 0:
        raise SilverNotReady(
            f"Silver table '{silver_table}' has no readiness signal in the last "
            f"{max_stale_hours} hours. Gold pipeline CANNOT proceed."
        )
    row = latest.first()
    print(f"[HANDSHAKE] Verified {silver_table}: {row['record_count']} records, "
          f"schema={row['schema_hash']}, age={row['published_at']}")
    return True

class SilverNotReady(Exception):
    pass`
      : `# ═══ Silver → Gold Handshake Contract ═══
# AWS variant: write readiness signal to S3 manifest
import json, boto3
from datetime import datetime

def publish_silver_readiness(table_name, record_count, run_id, bucket="data-lake"):
    s3 = boto3.client("s3")
    manifest = {
        "silver_table": table_name,
        "run_id": run_id,
        "record_count": record_count,
        "status": "READY",
        "published_at": datetime.utcnow().isoformat(),
    }
    s3.put_object(
        Bucket=bucket,
        Key=f"silver_contracts/{table_name}/latest.json",
        Body=json.dumps(manifest),
        ContentType="application/json",
    )
    print(f"[HANDSHAKE] Published readiness for {table_name}: {record_count} records")`,
  });

  contracts.push({
    id: "dq-xlayer-4",
    name: "Pre-Gold KPI Validation Gate",
    checkType: "pre-gold-gate",
    severity: "high",
    blockDownstream: true,
    description: "Validate Silver data meets minimum quality thresholds before Gold KPI calculations can run — prevents garbage-in-garbage-out",
    code: `# ═══ Pre-Gold KPI Validation Gate ═══
from pyspark.sql import SparkSession

class PreGoldValidationGate:
    """
    Run at Silver pipeline end — blocks Gold if Silver data fails minimum quality.
    """

    def __init__(self, spark: SparkSession):
        self.spark = spark
        self.checks = []

    def check_null_rate(self, table: str, column: str, max_pct: float = 5.0):
        result = self.spark.sql(f"""
            SELECT COUNT(*) AS total,
                   SUM(CASE WHEN {column} IS NULL THEN 1 ELSE 0 END) AS nulls
            FROM {table}
        """).first()
        null_pct = (result["nulls"] / result["total"] * 100) if result["total"] > 0 else 0
        self.checks.append({
            "check": f"null_rate({column})",
            "value": round(null_pct, 2),
            "threshold": max_pct,
            "passed": null_pct <= max_pct,
        })

    def check_freshness(self, table: str, ts_col: str, max_hours: int = 6):
        result = self.spark.sql(f"""
            SELECT TIMESTAMPDIFF(HOUR, MAX({ts_col}), current_timestamp()) AS hours_stale
            FROM {table}
        """).first()
        hours = result["hours_stale"] or 999
        self.checks.append({
            "check": f"freshness({ts_col})",
            "value": hours,
            "threshold": max_hours,
            "passed": hours <= max_hours,
        })

    def check_min_rows(self, table: str, min_count: int = 100):
        count = self.spark.table(table).count()
        self.checks.append({
            "check": "min_row_count",
            "value": count,
            "threshold": min_count,
            "passed": count >= min_count,
        })

    def check_uniqueness(self, table: str, key_cols: list):
        keys_sql = ", ".join(key_cols)
        dup_count = self.spark.sql(f"""
            SELECT COUNT(*) AS dups FROM (
                SELECT {keys_sql}, COUNT(*) AS cnt
                FROM {table} GROUP BY {keys_sql} HAVING cnt > 1
            )
        """).first()["dups"]
        self.checks.append({
            "check": f"uniqueness({keys_sql})",
            "value": dup_count,
            "threshold": 0,
            "passed": dup_count == 0,
        })

    def enforce(self) -> dict:
        failed = [c for c in self.checks if not c["passed"]]
        result = {
            "total_checks": len(self.checks),
            "passed": len(self.checks) - len(failed),
            "failed": len(failed),
            "failures": failed,
            "gate_status": "OPEN" if not failed else "BLOCKED",
        }
        if failed:
            failure_msg = "; ".join(
                f"{c['check']}={c['value']} (threshold {c['threshold']})" for c in failed
            )
            raise PreGoldGateBlocked(
                f"Pre-Gold validation FAILED: {len(failed)} checks blocked. {failure_msg}"
            )
        print(f"[PRE-GOLD GATE] All {len(self.checks)} checks passed — Gold pipeline cleared")
        return result

class PreGoldGateBlocked(Exception):
    pass`,
  });

  return contracts;
}

// ── Production Pipeline Orchestrator ─────────────────────────────────────────

function generateProductionPipeline(
  base: SilverLayerResult,
  keyFields: string[],
  timestampFields: string[],
  isToAzure: boolean
): string {
  const transformSteps = base.transforms
    .filter((t) => t.name !== "silver_pipeline_orchestrator")
    .map((t, i) => `        # Stage ${i + 1}: ${t.description}\n        df = handler.safe_execute(${t.name}, df)`)
    .join("\n\n");

  const keysStr = JSON.stringify(keyFields);
  const watermark = timestampFields[0] || "updated_at";

  if (!isToAzure) {
    return `# ═══ PRODUCTION SILVER PIPELINE — AWS Glue ═══
# Auto-generated production-ready pipeline

import sys, uuid
from awsglue.utils import getResolvedOptions
from awsglue.context import GlueContext
from pyspark.context import SparkContext

def run_production_silver():
    args = getResolvedOptions(sys.argv, ["JOB_NAME", "source_table", "target_path"])
    sc = SparkContext()
    glueContext = GlueContext(sc)
    spark = glueContext.spark_session
    run_id = str(uuid.uuid4())
    audit = SilverAuditLogger(args["JOB_NAME"])
    handler = PipelineExceptionHandler(run_id, "silver")

    try:
        df = spark.table(args["source_table"])
        df = audit.capture_input(df)
        df = validate_required_columns(df)

${transformSteps}

        valid_df, quarantine_df = quarantine_bad_records(df)
        audit.capture_rejected(quarantine_df)
        audit.capture_output(valid_df)

        valid_df.write.mode("overwrite").parquet(args["target_path"])
        audit.finalize(status="SUCCESS")
    except Exception as e:
        audit.finalize(status="FAILED", error_msg=str(e))
        raise

run_production_silver()`;
  }

  return `# ═══ PRODUCTION SILVER PIPELINE — Databricks / Delta Lake ═══
# Auto-generated production-ready pipeline with:
# - Schema drift detection
# - Audit framework
# - Error quarantine
# - Delta merge (incremental)
# - Performance optimizations
# - Retry-safe operations

import uuid
from pyspark.sql import SparkSession
from delta.tables import DeltaTable

# ── Configuration ────────────────────────────────────────────────────────────

CONFIG = {
    "source_table": "catalog.bronze.source_table",
    "target_table": "catalog.silver.target_table",
    "quarantine_table": "catalog.silver_quarantine.failed_records",
    "audit_table": "catalog.silver_audit.pipeline_runs",
    "merge_keys": ${keysStr},
    "watermark_column": "${watermark}",
    "partition_columns": ["_year", "_month", "_day"],
}

# ── Performance Settings ─────────────────────────────────────────────────────

spark = SparkSession.builder.getOrCreate()
spark.conf.set("spark.sql.adaptive.enabled", "true")
spark.conf.set("spark.sql.adaptive.coalescePartitions.enabled", "true")
spark.conf.set("spark.sql.adaptive.skewJoin.enabled", "true")
spark.conf.set("spark.sql.autoBroadcastJoinThreshold", "104857600")

# ── Pipeline Execution ───────────────────────────────────────────────────────

@retry_on_transient(max_retries=3, retryable_exceptions=(ConnectionError, TimeoutError))
def run_production_silver(config=CONFIG):
    """
    Production Silver pipeline with full observability.

    Execution order:
    1. Read Bronze source
    2. Schema drift detection
    3. Schema validation (fail-fast on missing required columns)
    4. Data transformations (null handling → text standardization →
       timestamp normalization → type conversion → business rules →
       enrichment → PII masking)
    5. Deduplication
    6. Data quality validation
    7. Error quarantine (isolate bad records)
    8. Audit metrics capture
    9. Delta merge (incremental write)
    10. OPTIMIZE + Z-ORDER
    """
    run_id = str(uuid.uuid4())
    audit = SilverAuditLogger(spark, config["audit_table"])
    handler = PipelineExceptionHandler(run_id, "silver_pipeline")

    try:
        # ── Stage 0: Read Bronze ─────────────────────────────────────────
        df = spark.table(config["source_table"])
        df = audit.capture_input(df)
        print(f"[PIPELINE] Run {run_id}: Read {df.count()} records from {config['source_table']}")

        # ── Stage 1: Schema Drift Detection ──────────────────────────────
        drift = detect_new_columns(df)
        removed = detect_removed_columns(df)
        type_issues = validate_data_types(df)
        if removed:
            print(f"[WARNING] Schema drift: {len(removed)} columns removed from source")
        if type_issues:
            print(f"[WARNING] Schema drift: {len(type_issues)} type changes detected")

        # ── Stage 2: Schema Validation ───────────────────────────────────
        df = validate_required_columns(df)

        # ── Stage 3: Data Transformations ────────────────────────────────
${transformSteps}

        # ── Stage 4: Deduplication ───────────────────────────────────────
        before_dedup = df.count()
        df = deduplicate(df, config["merge_keys"], config.get("watermark_column"))
        after_dedup = df.count()
        duplicate_count = before_dedup - after_dedup
        print(f"[DEDUP] Removed {duplicate_count} duplicates ({before_dedup} → {after_dedup})")

        # ── Stage 5: Error Quarantine ────────────────────────────────────
        valid_df, quarantine_df = quarantine_bad_records(df, quarantine_table=config["quarantine_table"])
        audit.capture_rejected(quarantine_df)
        audit.capture_duplicates(
            spark.createDataFrame([(duplicate_count,)], ["count"])
        )

        # ── Stage 6: Add Processing Metadata ─────────────────────────────
        from pyspark.sql.functions import current_timestamp, lit, year, month, dayofmonth, col
        valid_df = (valid_df
            .withColumn("_silver_loaded_at", current_timestamp())
            .withColumn("_silver_run_id", lit(run_id))
            .withColumn("_year", year(col(config["watermark_column"])))
            .withColumn("_month", month(col(config["watermark_column"])))
            .withColumn("_day", dayofmonth(col(config["watermark_column"])))
        )

        # ── Stage 7: Incremental Delta Merge ─────────────────────────────
        incremental_merge(
            spark, valid_df, config["target_table"],
            config["merge_keys"], config["watermark_column"]
        )
        audit.capture_output(valid_df)

        # ── Stage 8: OPTIMIZE + Z-ORDER ──────────────────────────────────
        spark.sql(f"""
            OPTIMIZE {config['target_table']}
            ZORDER BY ({', '.join(config['merge_keys'])})
        """)
        print(f"[OPTIMIZE] Z-ORDER completed on {config['target_table']}")

        # ── Stage 9: Audit Finalization ──────────────────────────────────
        audit.finalize(config["source_table"], config["target_table"], status="SUCCESS")
        print(f"[PIPELINE] Run {run_id}: COMPLETED SUCCESSFULLY")

    except Exception as e:
        audit.finalize(config["source_table"], config["target_table"],
                       status="FAILED", error_msg=str(e))
        print(f"[PIPELINE] Run {run_id}: FAILED — {e}")
        raise


# ── Entry Point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    run_production_silver()`;
}
