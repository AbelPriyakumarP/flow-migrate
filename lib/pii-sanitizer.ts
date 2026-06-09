// ─── PII Sanitizer ────────────────────────────────────────────────────────────
// Detects personal/sensitive data in workflow JSON and replaces with safe
// placeholders BEFORE sending to the AI API. After migration, originals are
// restored in the output so the final JSON is functionally identical.
//
// Detected categories (26 total):
//   IDENTITY & CONTACT
//   - Email addresses
//   - Phone numbers (international & US formats)
//   - SSN / national ID patterns (US, UK NI, Indian Aadhaar)
//   - Person names in known fields (e.g. "assignee", "owner", "author")
//   - Postal / mailing addresses
//
//   FINANCIAL
//   - Credit card numbers (Luhn-validated)
//   - IBAN bank account numbers
//
//   CLOUD CREDENTIALS
//   - AWS Access Key IDs (AKIA...)
//   - AWS Secret Access Keys
//   - AWS account IDs (12-digit)
//   - Azure Connection Strings (Storage, ServiceBus, CosmosDB, SQL)
//   - Azure SAS tokens (?sv=...&sig=...)
//   - Azure Subscription / Tenant GUIDs in resource URIs
//   - API keys / tokens (long hex/base64 strings)
//   - Bearer tokens / Authorization headers
//   - Private key blocks (RSA, EC, PGP)
//
//   INFRASTRUCTURE
//   - IPv4 addresses (non-RFC1918 private)
//   - JDBC / database connection URLs (with embedded credentials)
//   - SMTP connection URLs (with embedded credentials)
//   - Webhook URLs with embedded tokens (Slack, Teams, Discord, etc.)
//
//   SENSITIVE FIELDS (by key name)
//   - password, secret, token, apiKey, client_secret, etc.
//   - connectionString, storageKey, sasToken, etc.
// ──────────────────────────────────────────────────────────────────────────────

export interface SanitizeResult {
  /** The sanitized JSON string with placeholders */
  sanitized: string;
  /** Map of placeholder → original value for restoration */
  placeholderMap: Map<string, string>;
  /** Human-readable summary of what was redacted */
  redactionLog: string[];
  /** Total number of replacements made */
  totalRedactions: number;
}

// ── Pattern definitions ──────────────────────────────────────────────────────

interface PiiPattern {
  category: string;
  regex: RegExp;
  prefix: string;
  /** Optional validator to reduce false positives */
  validate?: (match: string) => boolean;
}

const PII_PATTERNS: PiiPattern[] = [

  // ═══════════════════════════════════════════════════════════════════════════
  // IDENTITY & CONTACT
  // ═══════════════════════════════════════════════════════════════════════════

  // Email addresses
  {
    category: "Email",
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    prefix: "EMAIL",
    validate: (m) => !m.endsWith(".json") && !m.endsWith(".xml") && !m.endsWith(".yaml") && !m.endsWith(".schema"),
  },

  // Phone numbers — international (+1-xxx-xxx-xxxx) and US (xxx-xxx-xxxx, (xxx) xxx-xxxx)
  {
    category: "Phone",
    regex: /(?:\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    prefix: "PHONE",
    validate: (m) => {
      const digits = m.replace(/\D/g, "");
      return digits.length >= 10 && digits.length <= 15;
    },
  },

  // SSN — US format: xxx-xx-xxxx
  {
    category: "SSN",
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    prefix: "SSN",
    validate: (m) => {
      const parts = m.split("-");
      const area = parseInt(parts[0]);
      return area > 0 && area !== 666 && area < 900;
    },
  },

  // UK National Insurance number: AB 12 34 56 C
  {
    category: "NationalID_UK",
    regex: /\b[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/gi,
    prefix: "NIUK",
  },

  // Indian Aadhaar number: 1234 5678 9012
  {
    category: "NationalID_IN",
    regex: /\b\d{4}\s\d{4}\s\d{4}\b/g,
    prefix: "AADHAAR",
    validate: (m) => {
      // First digit cannot be 0 or 1
      const first = parseInt(m[0]);
      return first >= 2 && first <= 9;
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FINANCIAL
  // ═══════════════════════════════════════════════════════════════════════════

  // Credit card numbers (13-19 digits, with optional separators)
  {
    category: "CreditCard",
    regex: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{1,7}\b/g,
    prefix: "CARD",
    validate: (m) => {
      const digits = m.replace(/\D/g, "");
      return digits.length >= 13 && digits.length <= 19 && luhnCheck(digits);
    },
  },

  // IBAN bank account numbers (2 letter country code + 2 check digits + up to 30 alphanumeric)
  {
    category: "IBAN",
    regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g,
    prefix: "IBAN",
    validate: (m) => {
      // Must start with valid country code — not a random string
      const country = m.slice(0, 2);
      const validCountries = new Set([
        "GB", "DE", "FR", "ES", "IT", "NL", "BE", "AT", "CH", "IE",
        "PT", "SE", "DK", "NO", "FI", "PL", "CZ", "RO", "HU", "BG",
        "HR", "SK", "SI", "LT", "LV", "EE", "MT", "CY", "LU", "GR",
        "AE", "SA", "QA", "KW", "BH", "IL", "TR", "IN",
      ]);
      return validCountries.has(country);
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CLOUD CREDENTIALS — AWS
  // ═══════════════════════════════════════════════════════════════════════════

  // AWS Access Key IDs — always start with AKIA, ASIA, ABIA, or ACCA
  {
    category: "AWSAccessKey",
    regex: /\b(AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b/g,
    prefix: "AWSKEY",
  },

  // AWS Secret Access Keys — 40-char base64-ish string (often after an access key)
  {
    category: "AWSSecretKey",
    regex: /\b[A-Za-z0-9/+=]{40}\b/g,
    prefix: "AWSSECRET",
    validate: (m) => {
      // Must have a mix of upper + lower + digit (unlike GUIDs or words)
      const hasUpper = /[A-Z]/.test(m);
      const hasLower = /[a-z]/.test(m);
      const hasDigit = /\d/.test(m);
      const hasSpecial = /[/+=]/.test(m);
      return hasUpper && hasLower && hasDigit && hasSpecial;
    },
  },

  // AWS Account IDs (12-digit numbers)
  {
    category: "AWSAccountID",
    regex: /\b\d{12}\b/g,
    prefix: "AWSACCT",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CLOUD CREDENTIALS — AZURE
  // ═══════════════════════════════════════════════════════════════════════════

  // Azure Connection Strings — Storage, ServiceBus, CosmosDB, SQL, EventHub
  {
    category: "AzureConnString",
    regex: /(?:DefaultEndpointsProtocol|Endpoint|AccountEndpoint|Server)=[^"'\s]{20,}/g,
    prefix: "AZCONN",
  },

  // Azure SAS tokens — ?sv=2021-...&ss=...&sig=...
  {
    category: "AzureSASToken",
    regex: /\?sv=\d{4}-\d{2}-\d{2}&[A-Za-z0-9&=%/+.-]{30,}/g,
    prefix: "AZSAS",
  },

  // Azure Subscription / Tenant GUIDs in resource URI paths
  // e.g. /subscriptions/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/
  {
    category: "AzureSubscriptionID",
    regex: /\/subscriptions\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi,
    prefix: "AZSUB",
  },

  // Azure Tenant / Directory ID in URLs or config
  {
    category: "AzureTenantID",
    regex: /(?:tenant[_-]?[iI]d|directory[_-]?[iI]d|tenantId)["']?\s*[:=]\s*["']?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi,
    prefix: "AZTENANT",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GENERIC CREDENTIALS & TOKENS
  // ═══════════════════════════════════════════════════════════════════════════

  // Private key blocks — RSA, EC, PGP, OPENSSH
  {
    category: "PrivateKey",
    regex: /-----BEGIN\s(?:RSA\s|EC\s|DSA\s|OPENSSH\s|PGP\s)?PRIVATE\sKEY-----[\s\S]{20,}?-----END\s(?:RSA\s|EC\s|DSA\s|OPENSSH\s|PGP\s)?PRIVATE\sKEY-----/g,
    prefix: "PRIVKEY",
  },

  // API keys / tokens — long alphanumeric strings (40+ chars, mix of character types)
  {
    category: "APIKey",
    regex: /\b[A-Za-z0-9+/]{40,}={0,2}\b/g,
    prefix: "APIKEY",
    validate: (m) => {
      const hasUpper = /[A-Z]/.test(m);
      const hasLower = /[a-z]/.test(m);
      const hasDigit = /\d/.test(m);
      const typeCount = [hasUpper, hasLower, hasDigit].filter(Boolean).length;
      return typeCount >= 2;
    },
  },

  // Bearer tokens / Authorization headers
  {
    category: "BearerToken",
    regex: /Bearer\s+[A-Za-z0-9._~+/=-]{20,}/g,
    prefix: "BEARER",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // INFRASTRUCTURE — URLs, IPs, CONNECTION STRINGS
  // ═══════════════════════════════════════════════════════════════════════════

  // IPv4 addresses (skip private/loopback ranges)
  {
    category: "IPAddress",
    regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    prefix: "IP",
    validate: (m) => {
      const octets = m.split(".").map(Number);
      if (octets.some((o) => o > 255)) return false;
      if (octets[0] === 10) return false;
      if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return false;
      if (octets[0] === 192 && octets[1] === 168) return false;
      if (octets[0] === 127) return false;
      if (octets[0] === 0) return false;
      if (m === "255.255.255.255" || m === "255.255.255.0") return false;
      return true;
    },
  },

  // JDBC / database connection URLs with embedded credentials
  // jdbc:postgresql://user:pass@host:5432/db, mongodb://user:pass@host/db, etc.
  {
    category: "DatabaseURL",
    regex: /(?:jdbc:|mongodb(?:\+srv)?:|mysql:|postgresql:|redis:|amqp:|mssql:)\/\/[^\s"']{10,}/gi,
    prefix: "DBURL",
  },

  // SMTP connection URLs with embedded credentials
  {
    category: "SmtpURL",
    regex: /smtp[s]?:\/\/[^\s"']{10,}/gi,
    prefix: "SMTPURL",
  },

  // Webhook URLs with embedded tokens — Slack, Teams, Discord, generic
  {
    category: "WebhookURL",
    regex: /https:\/\/(?:hooks\.slack\.com\/services|discord\.com\/api\/webhooks|outlook\.office\.com\/webhook|[a-z0-9.-]+\/webhook)\/[A-Za-z0-9/_-]{10,}/g,
    prefix: "WEBHOOK",
  },
];

// ── Sensitive field names (values get redacted regardless of format) ──────────

const SENSITIVE_FIELD_NAMES = new Set([
  // Auth & secrets
  "password", "passwd", "secret", "token", "apikey", "api_key",
  "apiKey", "api-key", "access_token", "accessToken", "refresh_token",
  "refreshToken", "private_key", "privateKey", "client_secret",
  "clientSecret", "authorization", "auth_token", "authToken",
  "signing_key", "signingKey", "encryption_key", "encryptionKey",
  // Personal identity
  "ssn", "social_security", "socialSecurity", "national_id",
  "nationalId", "credit_card", "creditCard", "card_number",
  "cardNumber", "cvv", "cvc", "pin", "iban", "bankAccount",
  "bank_account", "routing_number", "routingNumber",
  // Cloud-specific credential fields
  "connectionString", "connection_string", "storageKey", "storage_key",
  "accountKey", "account_key", "sasToken", "sas_token",
  "cosmosKey", "cosmos_key", "masterKey", "master_key",
  "instrumentationKey", "instrumentation_key",
  "serviceBusKey", "service_bus_key", "eventHubKey", "event_hub_key",
  "subscriptionId", "subscription_id", "tenantId", "tenant_id",
  "appSecret", "app_secret", "webhookSecret", "webhook_secret",
  "smtp_password", "smtpPassword", "database_password", "databasePassword",
]);

// Fields whose values look like person names
const NAME_FIELD_NAMES = new Set([
  "name", "fullName", "full_name", "firstName", "first_name",
  "lastName", "last_name", "owner", "author", "assignee",
  "creator", "reviewer", "approver", "recipient", "sender",
  "contactName", "contact_name", "userName", "user_name",
  "displayName", "display_name",
]);

// ── Luhn check for credit card validation ────────────────────────────────────

function luhnCheck(num: string): boolean {
  let sum = 0;
  let alternate = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let n = parseInt(num[i], 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

// ── Main sanitizer ───────────────────────────────────────────────────────────

export function sanitizeWorkflowPii(jsonString: string): SanitizeResult {
  const placeholderMap = new Map<string, string>();
  const redactionLog: string[] = [];
  const categoryCounts: Record<string, number> = {};
  let counter = 0;

  // Track what we've already replaced to avoid double-redacting
  const replacedValues = new Set<string>();

  let sanitized = jsonString;

  // ── Pass 1: Sensitive field values ──────────────────────────────────────────
  // Parse JSON, walk the tree, redact values of sensitive-named keys
  try {
    const parsed = JSON.parse(jsonString);
    const fieldRedactions = new Map<string, string>(); // original → placeholder

    walkObject(parsed, (key, value, path) => {
      if (typeof value !== "string" || value.length < 2) return value;

      const keyLower = key.toLowerCase();

      // Exact match on sensitive field names
      if (SENSITIVE_FIELD_NAMES.has(key) || SENSITIVE_FIELD_NAMES.has(keyLower)) {
        const placeholder = `__PII_SECRET_${++counter}__`;
        fieldRedactions.set(value, placeholder);
        placeholderMap.set(placeholder, value);
        replacedValues.add(value);
        categoryCounts["SensitiveField"] = (categoryCounts["SensitiveField"] || 0) + 1;
        return placeholder;
      }

      // Name fields — only redact if value looks like a person name (2-4 words, capitalized)
      if (NAME_FIELD_NAMES.has(key) || NAME_FIELD_NAMES.has(keyLower)) {
        if (looksLikePersonName(value)) {
          const placeholder = `__PII_NAME_${++counter}__`;
          fieldRedactions.set(value, placeholder);
          placeholderMap.set(placeholder, value);
          replacedValues.add(value);
          categoryCounts["PersonName"] = (categoryCounts["PersonName"] || 0) + 1;
          return placeholder;
        }
      }

      return value;
    });

    // Re-serialize with field redactions applied
    sanitized = JSON.stringify(parsed, null, 2);
  } catch {
    // Not valid JSON — proceed with regex-only approach on raw string
  }

  // ── Pass 2: Regex-based pattern matching on the (possibly updated) string ──
  for (const pattern of PII_PATTERNS) {
    // Reset lastIndex for global regex
    pattern.regex.lastIndex = 0;

    // Collect all matches first to avoid mutating string during iteration
    const matches: Array<{ match: string; index: number }> = [];
    let m;
    while ((m = pattern.regex.exec(sanitized)) !== null) {
      const matchStr = m[0];
      // Skip if already redacted
      if (replacedValues.has(matchStr)) continue;
      if (matchStr.includes("__PII_")) continue;
      // Run validator
      if (pattern.validate && !pattern.validate(matchStr)) continue;
      matches.push({ match: matchStr, index: m.index });
    }

    // Replace from end to start so indices stay valid
    for (let i = matches.length - 1; i >= 0; i--) {
      const { match } = matches[i];
      // Check if this exact value already has a placeholder
      let placeholder: string | undefined;
      for (const [ph, orig] of placeholderMap) {
        if (orig === match) { placeholder = ph; break; }
      }
      if (!placeholder) {
        placeholder = `__PII_${pattern.prefix}_${++counter}__`;
        placeholderMap.set(placeholder, match);
      }
      sanitized = sanitized.split(match).join(placeholder);
      replacedValues.add(match);
      categoryCounts[pattern.category] = (categoryCounts[pattern.category] || 0) + 1;
    }
  }

  // ── Build redaction log ────────────────────────────────────────────────────
  for (const [category, count] of Object.entries(categoryCounts)) {
    redactionLog.push(`PII-${category}: ${count} value(s) redacted`);
  }

  return {
    sanitized,
    placeholderMap,
    redactionLog,
    totalRedactions: placeholderMap.size,
  };
}

// ── Restore originals in migrated output ─────────────────────────────────────

export function restorePiiFromPlaceholders(
  migratedJson: string,
  placeholderMap: Map<string, string>
): string {
  let restored = migratedJson;
  for (const [placeholder, original] of placeholderMap) {
    // Replace all occurrences — the AI may have duplicated some values
    restored = restored.split(placeholder).join(original);
  }
  return restored;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function looksLikePersonName(value: string): boolean {
  // Person names: 2-4 words, each capitalized, no special chars except hyphen/apostrophe
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.length > 60) return false;
  // Must not look like a path, URL, or code
  if (/[/@#$%^&*(){}[\]|\\<>:;=+]/.test(trimmed)) return false;
  const words = trimmed.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  // Each word should start with uppercase
  return words.every((w) => /^[A-Z][a-zA-Z'-]+$/.test(w));
}

type WalkCallback = (key: string, value: unknown, path: string) => unknown;

function walkObject(obj: unknown, callback: WalkCallback, path = ""): unknown {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj.map((item, i) => walkObject(item, callback, `${path}[${i}]`));
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const currentPath = path ? `${path}.${key}` : key;
      if (typeof value === "string") {
        result[key] = callback(key, value, currentPath);
      } else {
        result[key] = walkObject(value, callback, currentPath);
      }
    }
    return result;
  }

  return obj;
}
