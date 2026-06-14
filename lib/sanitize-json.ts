/**
 * AI JSON Sanitizer
 *
 * LLM output for large workflows frequently contains two classes of escaping
 * errors inside long string values (e.g. multi-line SNS message bodies that
 * embed shell commands):
 *
 *   1. Over-escaped backslash runs   — "\\\\\\n"  → should be "\n"
 *   2. Raw control characters        — a literal newline inside a JSON string
 *
 * Either one makes JSON.parse throw, which previously cascaded into a blank
 * workflow graph, an empty step-mapping summary, and non-deployable output.
 *
 * sanitizeAiJson walks the text character-by-character, tracking whether it is
 * inside a string literal, and repairs both problems without disturbing the
 * surrounding structure. It is intentionally conservative: it only rewrites
 * content inside string literals.
 */
export function sanitizeAiJson(input: string): string {
  let res = "";
  let inStr = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const code = input.charCodeAt(i);

    if (!inStr) {
      if (ch === '"') inStr = true;
      res += ch;
      continue;
    }

    // Inside a string literal.
    if (ch === "\\") {
      // Collapse a run of backslashes down to the single escape the value meant.
      let j = i;
      while (input[j] === "\\") j++;
      const next = input[j];
      const validEsc = '"\\/bfnrtu';
      if (next !== undefined && validEsc.includes(next)) {
        res += "\\" + next;
        i = j; // skip the run and the escaped character
      } else {
        // Backslashes not followed by a valid escape char — drop the strays.
        i = j - 1;
      }
      continue;
    }

    if (ch === '"') {
      inStr = false;
      res += ch;
      continue;
    }

    // Escape raw control characters that are illegal inside a JSON string.
    if (code < 0x20) {
      if (ch === "\n") res += "\\n";
      else if (ch === "\r") res += "\\r";
      else if (ch === "\t") res += "\\t";
      else res += "\\u" + code.toString(16).padStart(4, "0");
      continue;
    }

    res += ch;
  }

  return res;
}

/**
 * Parse JSON that may have come from an LLM. Tries a strict parse first, then
 * falls back to the sanitized form. Returns null if both fail.
 */
export function safeParseJson<T = Record<string, unknown>>(input: string): T | null {
  if (!input || !input.trim()) return null;
  try {
    return JSON.parse(input) as T;
  } catch {
    try {
      return JSON.parse(sanitizeAiJson(input)) as T;
    } catch {
      return null;
    }
  }
}
