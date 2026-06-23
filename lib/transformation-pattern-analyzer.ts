export type TransformationCategory =
  | "schema-standardization"
  | "type-conversion"
  | "data-cleansing"
  | "deduplication"
  | "data-validation"
  | "data-enrichment"
  | "lookup-joins"
  | "aggregations"
  | "kpi-calculations"
  | "business-rules"
  | "reporting-logic";

export interface DetectedTransformation {
  id: string;
  transformation_name: string;
  category: TransformationCategory;
  purpose: string;
  source_columns: string[];
  target_columns: string[];
  confidence: number;
  source_snippet?: string;
}

export interface TransformationPatternResult {
  transformations: DetectedTransformation[];
  summary: TransformationSummary;
  categoryBreakdown: Record<TransformationCategory, number>;
  overallComplexity: "simple" | "moderate" | "complex" | "enterprise";
}

export interface TransformationSummary {
  totalDetected: number;
  highConfidenceCount: number;
  categoriesFound: number;
  dominantCategory: TransformationCategory;
  avgConfidence: number;
  warnings: string[];
}

export const CATEGORY_LABELS: Record<TransformationCategory, string> = {
  "schema-standardization": "Schema Standardization",
  "type-conversion": "Type Conversion",
  "data-cleansing": "Data Cleansing",
  "deduplication": "Deduplication",
  "data-validation": "Data Validation",
  "data-enrichment": "Data Enrichment",
  "lookup-joins": "Lookup Joins",
  "aggregations": "Aggregations",
  "kpi-calculations": "KPI Calculations",
  "business-rules": "Business Rules",
  "reporting-logic": "Reporting Logic",
};

export const CATEGORY_COLORS: Record<TransformationCategory, string> = {
  "schema-standardization": "#3b82f6",
  "type-conversion": "#f59e0b",
  "data-cleansing": "#10b981",
  "deduplication": "#8b5cf6",
  "data-validation": "#ef4444",
  "data-enrichment": "#06b6d4",
  "lookup-joins": "#ec4899",
  "aggregations": "#f97316",
  "kpi-calculations": "#14b8a6",
  "business-rules": "#a855f7",
  "reporting-logic": "#6366f1",
};

export const CATEGORY_ICONS: Record<TransformationCategory, string> = {
  "schema-standardization": "⊞",
  "type-conversion": "⇄",
  "data-cleansing": "✦",
  "deduplication": "⊘",
  "data-validation": "✓",
  "data-enrichment": "⊕",
  "lookup-joins": "⋈",
  "aggregations": "∑",
  "kpi-calculations": "📊",
  "business-rules": "⚙",
  "reporting-logic": "📋",
};

// ── Main entry point ────────────────────────────────────────────────────────

export function analyzeTransformationPatterns(
  sourceCode: string,
  _outputCode: string,
  _direction: "aws-to-azure" | "azure-to-aws"
): TransformationPatternResult {
  const transformations: DetectedTransformation[] = [];
  let nextId = 1;

  const push = (t: Omit<DetectedTransformation, "id">) => {
    transformations.push({ ...t, id: `tp-${nextId++}` });
  };

  detectSchemaStandardization(sourceCode, push);
  detectTypeConversions(sourceCode, push);
  detectDataCleansing(sourceCode, push);
  detectDeduplication(sourceCode, push);
  detectDataValidation(sourceCode, push);
  detectDataEnrichment(sourceCode, push);
  detectLookupJoins(sourceCode, push);
  detectAggregations(sourceCode, push);
  detectKPICalculations(sourceCode, push);
  detectBusinessRules(sourceCode, push);
  detectReportingLogic(sourceCode, push);

  const categoryBreakdown = {} as Record<TransformationCategory, number>;
  for (const cat of Object.keys(CATEGORY_LABELS) as TransformationCategory[]) {
    categoryBreakdown[cat] = transformations.filter((t) => t.category === cat).length;
  }

  const highConf = transformations.filter((t) => t.confidence >= 80).length;
  const avgConf = transformations.length > 0 ? Math.round(transformations.reduce((s, t) => s + t.confidence, 0) / transformations.length) : 0;
  const categoriesFound = Object.values(categoryBreakdown).filter((c) => c > 0).length;
  const dominantCategory = (Object.entries(categoryBreakdown).sort((a, b) => b[1] - a[1])[0]?.[0] || "schema-standardization") as TransformationCategory;

  const warnings: string[] = [];
  if (transformations.length === 0) warnings.push("No transformation patterns detected — source may not contain Glue/ETL logic");
  if (avgConf < 60) warnings.push("Average confidence is below 60% — review detected patterns manually");
  if (categoriesFound <= 2) warnings.push("Only " + categoriesFound + " categories detected — source may be a single-purpose transform");
  if (!categoryBreakdown["data-validation"]) warnings.push("No data validation detected — consider adding quality checks in Silver layer");
  if (!categoryBreakdown["deduplication"]) warnings.push("No deduplication detected — verify whether source data has duplicates");

  const complexity: TransformationPatternResult["overallComplexity"] =
    transformations.length >= 20 ? "enterprise" :
    transformations.length >= 12 ? "complex" :
    transformations.length >= 5 ? "moderate" : "simple";

  return {
    transformations,
    summary: {
      totalDetected: transformations.length,
      highConfidenceCount: highConf,
      categoriesFound,
      dominantCategory,
      avgConfidence: avgConf,
      warnings,
    },
    categoryBreakdown,
    overallComplexity: complexity,
  };
}

// ── Pattern detectors ───────────────────────────────────────────────────────

type Pusher = (t: Omit<DetectedTransformation, "id">) => void;

function extractColumns(src: string, pattern: RegExp): string[] {
  const cols: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(pattern, "gi");
  while ((m = re.exec(src)) !== null) {
    const col = m[1]?.trim();
    if (col && col.length < 60) cols.push(col);
  }
  return [...new Set(cols)].slice(0, 10);
}

function snippet(src: string, pattern: RegExp): string | undefined {
  const m = pattern.exec(src);
  if (!m) return undefined;
  const start = Math.max(0, m.index - 30);
  const end = Math.min(src.length, m.index + m[0].length + 30);
  return src.substring(start, end).replace(/\n/g, " ").trim();
}

function detectSchemaStandardization(src: string, push: Pusher) {
  // Rename / alias detection
  const renamePatterns = [
    { re: /\.withColumnRenamed\s*\(\s*["'](\w+)["']\s*,\s*["'](\w+)["']\s*\)/gi, name: "Column Rename" },
    { re: /\.alias\s*\(\s*["'](\w+)["']\s*\)/gi, name: "Column Alias" },
    { re: /AS\s+["']?(\w+)["']?/gi, name: "SQL Alias" },
  ];
  for (const { re, name } of renamePatterns) {
    const matches = [...src.matchAll(re)];
    if (matches.length > 0) {
      const srcCols = matches.map((m) => m[1]).filter(Boolean).slice(0, 8);
      const tgtCols = matches.map((m) => m[2] || m[1]).filter(Boolean).slice(0, 8);
      push({
        transformation_name: `${name} (${matches.length} columns)`,
        category: "schema-standardization",
        purpose: `Rename/alias ${matches.length} column(s) to standardized naming convention`,
        source_columns: srcCols,
        target_columns: tgtCols,
        confidence: 92,
        source_snippet: snippet(src, re),
      });
    }
  }

  // Select / project
  const selectMatch = src.match(/\.select\s*\(([^)]{10,300})\)/i);
  if (selectMatch) {
    const cols = extractColumns(selectMatch[1], /["'](\w+)["']/g);
    push({
      transformation_name: "Column Projection / Select",
      category: "schema-standardization",
      purpose: "Project subset of columns from source — drops unused fields",
      source_columns: cols,
      target_columns: cols,
      confidence: 88,
      source_snippet: snippet(src, /\.select\s*\(/i),
    });
  }

  // Drop columns
  const dropMatch = src.match(/\.drop\s*\(([^)]{5,200})\)/i);
  if (dropMatch) {
    const cols = extractColumns(dropMatch[1], /["'](\w+)["']/g);
    push({
      transformation_name: "Column Drop",
      category: "schema-standardization",
      purpose: "Remove unnecessary columns from output schema",
      source_columns: cols,
      target_columns: [],
      confidence: 90,
      source_snippet: snippet(src, /\.drop\s*\(/i),
    });
  }

  // Schema casting / StructType
  if (/StructType|StructField|schema\s*=/i.test(src)) {
    push({
      transformation_name: "Explicit Schema Definition",
      category: "schema-standardization",
      purpose: "Define explicit output schema with StructType/StructField for type safety",
      source_columns: extractColumns(src, /StructField\s*\(\s*["'](\w+)["']/g),
      target_columns: extractColumns(src, /StructField\s*\(\s*["'](\w+)["']/g),
      confidence: 95,
      source_snippet: snippet(src, /StructType|StructField/i),
    });
  }

  // Flatten nested structures
  if (/\.getField\s*\(|\.getItem\s*\(|explode\s*\(|flatten\s*\(/i.test(src)) {
    push({
      transformation_name: "Nested Structure Flattening",
      category: "schema-standardization",
      purpose: "Flatten nested JSON/struct fields into top-level columns",
      source_columns: extractColumns(src, /\.getField\s*\(\s*["'](\w+)["']\s*\)/g),
      target_columns: extractColumns(src, /\.alias\s*\(\s*["'](\w+)["']\s*\)/g),
      confidence: 85,
      source_snippet: snippet(src, /\.getField|explode|flatten/i),
    });
  }
}

function detectTypeConversions(src: string, push: Pusher) {
  const castPatterns = [
    { re: /\.cast\s*\(\s*["'](\w+)["']\s*\)/gi, name: "Spark Cast" },
    { re: /CAST\s*\(\s*(\w+)\s+AS\s+(\w+)\s*\)/gi, name: "SQL CAST" },
    { re: /\.astype\s*\(\s*["'](\w+)["']\s*\)/gi, name: "Pandas astype" },
  ];
  for (const { re, name } of castPatterns) {
    const matches = [...src.matchAll(re)];
    if (matches.length > 0) {
      push({
        transformation_name: `${name} (${matches.length} conversions)`,
        category: "type-conversion",
        purpose: `Convert column data types via ${name} for schema compliance`,
        source_columns: matches.map((m) => m[1]).filter(Boolean).slice(0, 8),
        target_columns: matches.map((m) => m[2] || m[1]).filter(Boolean).slice(0, 8),
        confidence: 90,
        source_snippet: snippet(src, re),
      });
    }
  }

  // Timestamp parsing
  if (/to_timestamp\s*\(|to_date\s*\(|date_format\s*\(|from_unixtime\s*\(/i.test(src)) {
    push({
      transformation_name: "Timestamp/Date Parsing",
      category: "type-conversion",
      purpose: "Parse string or epoch values into proper timestamp/date types",
      source_columns: extractColumns(src, /to_timestamp\s*\(\s*(?:col\s*\(\s*)?["'](\w+)["']/g),
      target_columns: extractColumns(src, /to_timestamp\s*\(.*?\.alias\s*\(\s*["'](\w+)["']/g),
      confidence: 88,
      source_snippet: snippet(src, /to_timestamp|to_date|date_format/i),
    });
  }

  // Boolean conversion
  if (/\.isin\s*\(|when\s*\(.*?\.otherwise\s*\(.*?(?:True|False|true|false)/i.test(src)) {
    push({
      transformation_name: "Boolean Flag Derivation",
      category: "type-conversion",
      purpose: "Convert categorical or conditional values to boolean flags",
      source_columns: [],
      target_columns: extractColumns(src, /\.alias\s*\(\s*["'](is_\w+|has_\w+|flag_\w+)["']/g),
      confidence: 75,
    });
  }
}

function detectDataCleansing(src: string, push: Pusher) {
  // Null handling
  const nullPatterns = [
    /\.fillna\s*\(/i, /\.na\.fill\s*\(/i, /coalesce\s*\(/i,
    /\.na\.drop\s*\(/i, /\.dropna\s*\(/i, /IFNULL\s*\(/i, /NVL\s*\(/i,
  ];
  if (nullPatterns.some((p) => p.test(src))) {
    push({
      transformation_name: "Null Value Handling",
      category: "data-cleansing",
      purpose: "Replace, coalesce, or drop null/missing values to ensure data completeness",
      source_columns: extractColumns(src, /\.fillna\s*\(\s*\{?\s*["'](\w+)["']/g),
      target_columns: extractColumns(src, /\.fillna\s*\(\s*\{?\s*["'](\w+)["']/g),
      confidence: 92,
      source_snippet: snippet(src, /\.fillna|coalesce|\.na\.fill|\.na\.drop|\.dropna|IFNULL|NVL/i),
    });
  }

  // Trim / whitespace
  if (/\.trim\s*\(|\.strip\s*\(|TRIM\s*\(|LTRIM|RTRIM|regexp_replace\s*\(.*?\\s/i.test(src)) {
    push({
      transformation_name: "Whitespace Trimming",
      category: "data-cleansing",
      purpose: "Remove leading/trailing whitespace and normalize spacing",
      source_columns: extractColumns(src, /trim\s*\(\s*(?:col\s*\(\s*)?["'](\w+)["']/g),
      target_columns: extractColumns(src, /trim\s*\(\s*(?:col\s*\(\s*)?["'](\w+)["']/g),
      confidence: 85,
    });
  }

  // Lower/upper standardization
  if (/\.lower\s*\(|\.upper\s*\(|LOWER\s*\(|UPPER\s*\(/i.test(src)) {
    push({
      transformation_name: "Case Normalization",
      category: "data-cleansing",
      purpose: "Standardize string casing (upper/lower) for consistent matching",
      source_columns: extractColumns(src, /(?:lower|upper)\s*\(\s*(?:col\s*\(\s*)?["'](\w+)["']/g),
      target_columns: extractColumns(src, /(?:lower|upper)\s*\(\s*(?:col\s*\(\s*)?["'](\w+)["']/g),
      confidence: 80,
    });
  }

  // Regex replacement / pattern cleansing
  if (/regexp_replace\s*\(|\.replace\s*\(|\.sub\s*\(/i.test(src)) {
    push({
      transformation_name: "Pattern-Based Cleansing",
      category: "data-cleansing",
      purpose: "Apply regex or string replacement to clean malformed data patterns",
      source_columns: extractColumns(src, /regexp_replace\s*\(\s*(?:col\s*\(\s*)?["'](\w+)["']/g),
      target_columns: extractColumns(src, /regexp_replace\s*\(\s*(?:col\s*\(\s*)?["'](\w+)["']/g),
      confidence: 82,
      source_snippet: snippet(src, /regexp_replace|\.replace\s*\(/i),
    });
  }

  // Filter invalid records
  if (/\.filter\s*\(|\.where\s*\(|WHERE\s+/i.test(src)) {
    const filterSnip = snippet(src, /\.filter\s*\(|\.where\s*\(/i);
    if (filterSnip && /null|empty|invalid|corrupt|error|bad/i.test(filterSnip)) {
      push({
        transformation_name: "Invalid Record Filtering",
        category: "data-cleansing",
        purpose: "Remove corrupt, empty, or invalid records from the dataset",
        source_columns: extractColumns(filterSnip, /["'](\w+)["']/g),
        target_columns: [],
        confidence: 78,
        source_snippet: filterSnip,
      });
    }
  }
}

function detectDeduplication(src: string, push: Pusher) {
  // dropDuplicates
  if (/\.dropDuplicates\s*\(|\.drop_duplicates\s*\(|\.distinct\s*\(/i.test(src)) {
    push({
      transformation_name: "Row Deduplication",
      category: "deduplication",
      purpose: "Remove duplicate rows based on key columns or full-row comparison",
      source_columns: extractColumns(src, /dropDuplicates\s*\(\s*\[?\s*["'](\w+)["']/g),
      target_columns: [],
      confidence: 95,
      source_snippet: snippet(src, /\.dropDuplicates|\.drop_duplicates|\.distinct/i),
    });
  }

  // Window-based dedup (ROW_NUMBER + filter)
  if (/ROW_NUMBER\s*\(\s*\)\s*OVER/i.test(src) || /row_number\s*\(\s*\)\.over/i.test(src)) {
    if (/=\s*1|==\s*1|rn\s*=\s*1/i.test(src)) {
      push({
        transformation_name: "Window-Based Deduplication",
        category: "deduplication",
        purpose: "Deduplicate using ROW_NUMBER window function — keeps latest/first record per key",
        source_columns: extractColumns(src, /partitionBy\s*\(\s*["'](\w+)["']/g),
        target_columns: [],
        confidence: 90,
        source_snippet: snippet(src, /ROW_NUMBER|row_number/i),
      });
    }
  }

  // Group-by first/last for dedup
  if (/first\s*\(\s*["']|last\s*\(\s*["']|FIRST_VALUE\s*\(|LAST_VALUE\s*\(/i.test(src)) {
    push({
      transformation_name: "First/Last Value Deduplication",
      category: "deduplication",
      purpose: "Pick first or last value per group to collapse duplicates",
      source_columns: extractColumns(src, /(?:first|last|FIRST_VALUE|LAST_VALUE)\s*\(\s*["'](\w+)["']/g),
      target_columns: [],
      confidence: 72,
    });
  }
}

function detectDataValidation(src: string, push: Pusher) {
  // Null checks / isNotNull
  if (/\.isNotNull\s*\(|\.isNull\s*\(|IS\s+NOT\s+NULL|IS\s+NULL/i.test(src)) {
    push({
      transformation_name: "Null Constraint Validation",
      category: "data-validation",
      purpose: "Validate required fields are not null — enforce NOT NULL constraints",
      source_columns: extractColumns(src, /(?:col\s*\(\s*)?["'](\w+)["']\s*\)\s*\.isNotNull/g),
      target_columns: [],
      confidence: 85,
      source_snippet: snippet(src, /\.isNotNull|\.isNull|IS\s+NOT\s+NULL/i),
    });
  }

  // Range checks
  if (/(?:between|>=?\s*\d|<=?\s*\d|>\s*0|<\s*\d)/i.test(src) && /filter|where|when/i.test(src)) {
    push({
      transformation_name: "Range / Boundary Validation",
      category: "data-validation",
      purpose: "Validate numeric values fall within acceptable ranges",
      source_columns: extractColumns(src, /(?:col\s*\(\s*)?["'](\w+)["']\s*\)\s*(?:>=|<=|>|<|between)/g),
      target_columns: [],
      confidence: 78,
    });
  }

  // Regex validation
  if (/rlike\s*\(|regexp\s*\(|matches\s*\(|\.like\s*\(/i.test(src)) {
    push({
      transformation_name: "Pattern / Format Validation",
      category: "data-validation",
      purpose: "Validate data matches expected format patterns (email, phone, codes)",
      source_columns: extractColumns(src, /(?:col\s*\(\s*)?["'](\w+)["']\s*\)\s*\.rlike/g),
      target_columns: [],
      confidence: 80,
      source_snippet: snippet(src, /rlike|regexp|\.like/i),
    });
  }

  // Referential checks / anti-join
  if (/\.subtract\s*\(|anti.*join|exceptAll/i.test(src)) {
    push({
      transformation_name: "Referential Integrity Check",
      category: "data-validation",
      purpose: "Identify orphan records that fail referential integrity against lookup tables",
      source_columns: [],
      target_columns: [],
      confidence: 75,
      source_snippet: snippet(src, /\.subtract|anti.*join|exceptAll/i),
    });
  }

  // Assert / raise on bad data
  if (/assert|raise\s+ValueError|raise\s+Exception|sys\.exit/i.test(src)) {
    push({
      transformation_name: "Hard Validation Gate",
      category: "data-validation",
      purpose: "Halt pipeline execution if critical data quality thresholds are breached",
      source_columns: [],
      target_columns: [],
      confidence: 70,
    });
  }
}

function detectDataEnrichment(src: string, push: Pusher) {
  // Derived columns with withColumn
  const withColMatches = [...src.matchAll(/\.withColumn\s*\(\s*["'](\w+)["']/gi)];
  if (withColMatches.length > 0) {
    push({
      transformation_name: `Derived Column Creation (${withColMatches.length} columns)`,
      category: "data-enrichment",
      purpose: "Add computed/derived columns to enrich the dataset with new attributes",
      source_columns: [],
      target_columns: withColMatches.map((m) => m[1]).slice(0, 10),
      confidence: 88,
      source_snippet: snippet(src, /\.withColumn\s*\(/i),
    });
  }

  // CASE WHEN / when().otherwise()
  if (/CASE\s+WHEN|\.when\s*\(.*?\.otherwise\s*\(/i.test(src)) {
    push({
      transformation_name: "Conditional Enrichment (CASE/WHEN)",
      category: "data-enrichment",
      purpose: "Derive values based on conditional logic — bucketing, categorization, flagging",
      source_columns: extractColumns(src, /when\s*\(\s*(?:col\s*\(\s*)?["'](\w+)["']/g),
      target_columns: extractColumns(src, /\.otherwise\s*\(.*?\.alias\s*\(\s*["'](\w+)["']/g),
      confidence: 85,
      source_snippet: snippet(src, /CASE\s+WHEN|\.when\s*\(/i),
    });
  }

  // UDF application
  if (/udf\s*\(|@udf|register.*udf/i.test(src)) {
    push({
      transformation_name: "UDF-Based Enrichment",
      category: "data-enrichment",
      purpose: "Apply user-defined function to compute custom enrichment values",
      source_columns: [],
      target_columns: [],
      confidence: 80,
      source_snippet: snippet(src, /udf\s*\(|@udf/i),
    });
  }

  // Timestamp derivation (year, month, day extraction)
  if (/year\s*\(|month\s*\(|dayofweek\s*\(|hour\s*\(|date_trunc\s*\(/i.test(src)) {
    push({
      transformation_name: "Temporal Feature Extraction",
      category: "data-enrichment",
      purpose: "Extract date/time components (year, month, day, hour) for time-based analysis",
      source_columns: extractColumns(src, /(?:year|month|dayofweek|hour|date_trunc)\s*\(\s*(?:col\s*\(\s*)?["'](\w+)["']/g),
      target_columns: [],
      confidence: 82,
    });
  }

  // Concat / string building
  if (/concat\s*\(|concat_ws\s*\(/i.test(src)) {
    push({
      transformation_name: "String Concatenation / Key Building",
      category: "data-enrichment",
      purpose: "Build composite keys or combined string fields from multiple source columns",
      source_columns: extractColumns(src, /concat(?:_ws)?\s*\([^)]*["'](\w+)["']/g),
      target_columns: [],
      confidence: 78,
    });
  }
}

function detectLookupJoins(src: string, push: Pusher) {
  // Explicit joins
  const joinTypes = [
    { re: /\.join\s*\(\s*(\w+)\s*,/gi, name: "DataFrame Join" },
    { re: /(?:INNER|LEFT|RIGHT|FULL|CROSS)\s+JOIN\s+(\w+)/gi, name: "SQL Join" },
    { re: /LEFT\s+OUTER\s+JOIN\s+(\w+)/gi, name: "Left Outer Join" },
  ];
  for (const { re, name } of joinTypes) {
    const matches = [...src.matchAll(re)];
    if (matches.length > 0) {
      const tables = matches.map((m) => m[1]).filter(Boolean);
      push({
        transformation_name: `${name} (${tables.join(", ")})`,
        category: "lookup-joins",
        purpose: `Join with reference/lookup table(s): ${tables.join(", ")}`,
        source_columns: extractColumns(src, /ON\s+\w+\.(\w+)\s*=|\[["'](\w+)["']\]\s*==?/g),
        target_columns: [],
        confidence: 90,
        source_snippet: snippet(src, re),
      });
    }
  }

  // Broadcast join hint
  if (/broadcast\s*\(|\.hint\s*\(\s*["']broadcast["']/i.test(src)) {
    push({
      transformation_name: "Broadcast Lookup Join",
      category: "lookup-joins",
      purpose: "Small-table broadcast join for efficient lookup enrichment",
      source_columns: [],
      target_columns: [],
      confidence: 88,
      source_snippet: snippet(src, /broadcast\s*\(|\.hint.*broadcast/i),
    });
  }

  // Map-side lookup (dictionary / collect)
  if (/\.collectAsMap\s*\(|\.collect\s*\(\s*\).*dict|lookup_dict|mapping\s*=/i.test(src)) {
    push({
      transformation_name: "Map-Side Dictionary Lookup",
      category: "lookup-joins",
      purpose: "Lookup values from pre-collected dictionary — avoids shuffle join",
      source_columns: [],
      target_columns: [],
      confidence: 75,
    });
  }
}

function detectAggregations(src: string, push: Pusher) {
  // GROUP BY
  if (/GROUP\s+BY|\.groupBy\s*\(|\.groupby\s*\(/i.test(src)) {
    const groupCols = extractColumns(src, /(?:GROUP\s+BY|groupBy\s*\()\s*(?:["'](\w+)["']|(\w+))/g);
    push({
      transformation_name: "Group-By Aggregation",
      category: "aggregations",
      purpose: `Aggregate records by grouping columns: ${groupCols.join(", ") || "detected"}`,
      source_columns: groupCols,
      target_columns: [],
      confidence: 92,
      source_snippet: snippet(src, /GROUP\s+BY|\.groupBy/i),
    });
  }

  // Aggregate functions
  const aggFns = [
    { re: /SUM\s*\(\s*(\w+)\s*\)/gi, name: "SUM" },
    { re: /AVG\s*\(\s*(\w+)\s*\)|\.mean\s*\(/gi, name: "AVG/MEAN" },
    { re: /COUNT\s*\(\s*(?:DISTINCT\s+)?(\w+|\*)\s*\)/gi, name: "COUNT" },
    { re: /MAX\s*\(\s*(\w+)\s*\)/gi, name: "MAX" },
    { re: /MIN\s*\(\s*(\w+)\s*\)/gi, name: "MIN" },
  ];
  for (const { re, name } of aggFns) {
    const matches = [...src.matchAll(re)];
    if (matches.length > 0) {
      push({
        transformation_name: `${name} Aggregation (${matches.length} usages)`,
        category: "aggregations",
        purpose: `Compute ${name} aggregate across grouped records`,
        source_columns: matches.map((m) => m[1]).filter((c) => c !== "*").slice(0, 8),
        target_columns: [],
        confidence: 90,
      });
    }
  }

  // ROLLUP / CUBE / GROUPING SETS
  if (/ROLLUP\s*\(|CUBE\s*\(|GROUPING\s+SETS/i.test(src)) {
    push({
      transformation_name: "Multi-Level Rollup/Cube",
      category: "aggregations",
      purpose: "Generate hierarchical aggregation at multiple granularity levels",
      source_columns: extractColumns(src, /(?:ROLLUP|CUBE|GROUPING\s+SETS)\s*\(\s*(\w+)/g),
      target_columns: [],
      confidence: 88,
      source_snippet: snippet(src, /ROLLUP|CUBE|GROUPING\s+SETS/i),
    });
  }

  // Window aggregations
  if (/OVER\s*\(\s*PARTITION|\.over\s*\(\s*Window/i.test(src)) {
    push({
      transformation_name: "Window Function Aggregation",
      category: "aggregations",
      purpose: "Compute windowed aggregates (running totals, moving averages, rankings)",
      source_columns: extractColumns(src, /(?:PARTITION\s+BY|partitionBy\s*\(\s*["'])(\w+)/g),
      target_columns: [],
      confidence: 88,
      source_snippet: snippet(src, /OVER\s*\(\s*PARTITION|\.over\s*\(/i),
    });
  }
}

function detectKPICalculations(src: string, push: Pusher) {
  // Revenue / financial KPIs
  if (/revenue|total_sales|gross_profit|net_income|arpu|ltv|mrr|arr/i.test(src)) {
    const kpiCols = extractColumns(src, /(revenue|total_sales|gross_profit|net_income|arpu|ltv|mrr|arr)/gi);
    push({
      transformation_name: "Financial KPI Calculation",
      category: "kpi-calculations",
      purpose: "Calculate financial key performance indicators (revenue, profit, ARPU, LTV)",
      source_columns: kpiCols,
      target_columns: kpiCols,
      confidence: 82,
    });
  }

  // Percentile / distribution KPIs
  if (/percentile|PERCENTILE_APPROX|PERCENTILE_CONT|p95|p99/i.test(src)) {
    push({
      transformation_name: "Percentile / Distribution KPI",
      category: "kpi-calculations",
      purpose: "Calculate percentile-based KPIs (P50, P95, P99) for SLA/SLO metrics",
      source_columns: extractColumns(src, /(?:percentile|PERCENTILE_APPROX)\s*\(\s*(?:col\s*\(\s*)?["']?(\w+)["']?/g),
      target_columns: [],
      confidence: 85,
      source_snippet: snippet(src, /percentile|PERCENTILE_APPROX|PERCENTILE_CONT/i),
    });
  }

  // Rate / ratio calculations
  if (/rate|ratio|conversion|churn|retention|growth/i.test(src) && /\/|DIV/i.test(src)) {
    push({
      transformation_name: "Rate / Ratio KPI",
      category: "kpi-calculations",
      purpose: "Calculate rate-based KPIs (conversion rate, churn rate, growth rate)",
      source_columns: [],
      target_columns: extractColumns(src, /((?:conversion|churn|retention|growth)_?rate\w*)/gi),
      confidence: 78,
    });
  }

  // Period-over-period comparison
  if (/LAG\s*\(|LEAD\s*\(/i.test(src) && /growth|change|delta|diff/i.test(src)) {
    push({
      transformation_name: "Period-over-Period KPI",
      category: "kpi-calculations",
      purpose: "Calculate period-over-period changes using LAG/LEAD for trend analysis",
      source_columns: [],
      target_columns: [],
      confidence: 80,
      source_snippet: snippet(src, /LAG\s*\(|LEAD\s*\(/i),
    });
  }
}

function detectBusinessRules(src: string, push: Pusher) {
  // Complex CASE WHEN chains (3+ branches = business rule, not simple enrichment)
  const caseCount = (src.match(/WHEN\s+/gi) || []).length;
  if (caseCount >= 3) {
    push({
      transformation_name: `Multi-Branch Business Rule (${caseCount} conditions)`,
      category: "business-rules",
      purpose: "Apply complex multi-condition business logic with branching outcomes",
      source_columns: extractColumns(src, /WHEN\s+(\w+)\s*(?:=|>|<|IN|LIKE|IS)/g),
      target_columns: [],
      confidence: 82,
    });
  }

  // Status / state mapping
  if (/status|state|category|tier|segment|classification/i.test(src) && /CASE|when\s*\(/i.test(src)) {
    push({
      transformation_name: "Status / Categorization Rule",
      category: "business-rules",
      purpose: "Map raw values to business-defined status codes, tiers, or segments",
      source_columns: extractColumns(src, /(status|state|category|tier|segment)\w*/gi),
      target_columns: extractColumns(src, /(status|state|category|tier|segment)\w*/gi),
      confidence: 78,
    });
  }

  // Threshold-based rules
  if (/threshold|limit|cap|floor|ceiling|clamp/i.test(src)) {
    push({
      transformation_name: "Threshold / Capping Rule",
      category: "business-rules",
      purpose: "Apply business-defined thresholds, caps, or floors to metric values",
      source_columns: [],
      target_columns: [],
      confidence: 72,
    });
  }

  // SLA / compliance rules
  if (/sla|compliance|regulatory|gdpr|pci|hipaa|sox/i.test(src)) {
    push({
      transformation_name: "Compliance / SLA Rule",
      category: "business-rules",
      purpose: "Apply regulatory or SLA compliance rules to data processing",
      source_columns: [],
      target_columns: [],
      confidence: 75,
    });
  }
}

function detectReportingLogic(src: string, push: Pusher) {
  // View creation
  if (/CREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMP\s+)?VIEW|CREATE\s+(?:OR\s+REPLACE\s+)?MATERIALIZED\s+VIEW/i.test(src)) {
    push({
      transformation_name: "Reporting View Creation",
      category: "reporting-logic",
      purpose: "Create view or materialized view for downstream reporting/BI consumption",
      source_columns: [],
      target_columns: [],
      confidence: 92,
      source_snippet: snippet(src, /CREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMP\s+)?(?:MATERIALIZED\s+)?VIEW/i),
    });
  }

  // BI / dashboard references
  if (/power_?bi|quicksight|tableau|looker|dashboard|report/i.test(src)) {
    push({
      transformation_name: "Dashboard / BI Output Preparation",
      category: "reporting-logic",
      purpose: "Structure output for BI tool consumption (Power BI, QuickSight, Tableau)",
      source_columns: [],
      target_columns: [],
      confidence: 78,
    });
  }

  // Pivot operations
  if (/\.pivot\s*\(|PIVOT\s*\(/i.test(src)) {
    push({
      transformation_name: "Pivot Transformation",
      category: "reporting-logic",
      purpose: "Pivot rows to columns for cross-tab reporting format",
      source_columns: extractColumns(src, /\.pivot\s*\(\s*["'](\w+)["']/g),
      target_columns: [],
      confidence: 88,
      source_snippet: snippet(src, /\.pivot\s*\(|PIVOT\s*\(/i),
    });
  }

  // Output write / save
  if (/\.write\s*\.|\.save\s*\(|\.saveAsTable\s*\(|INSERT\s+INTO|INSERT\s+OVERWRITE/i.test(src)) {
    const outputTargets = extractColumns(src, /\.saveAsTable\s*\(\s*["'](\w+\.?\w+)["']/g);
    push({
      transformation_name: "Output Sink / Table Write",
      category: "reporting-logic",
      purpose: `Persist transformed output to target table(s): ${outputTargets.join(", ") || "detected"}`,
      source_columns: [],
      target_columns: outputTargets,
      confidence: 90,
      source_snippet: snippet(src, /\.write\s*\.|\.saveAsTable|INSERT\s+INTO/i),
    });
  }

  // Partition-based output
  if (/partitionBy\s*\(|PARTITIONED\s+BY/i.test(src) && /\.write|\.save|INSERT/i.test(src)) {
    push({
      transformation_name: "Partitioned Output Write",
      category: "reporting-logic",
      purpose: "Write output partitioned by key columns for efficient downstream queries",
      source_columns: extractColumns(src, /partitionBy\s*\(\s*["'](\w+)["']/g),
      target_columns: [],
      confidence: 85,
    });
  }

  // OPTIMIZE / ZORDER
  if (/OPTIMIZE\s+|ZORDER\s+BY/i.test(src)) {
    push({
      transformation_name: "Query Optimization Directives",
      category: "reporting-logic",
      purpose: "Apply OPTIMIZE/ZORDER for fast analytical query performance",
      source_columns: extractColumns(src, /ZORDER\s+BY\s*\(\s*(\w+)/g),
      target_columns: [],
      confidence: 85,
    });
  }
}
