export interface DiffLine {
  type: "added" | "removed" | "unchanged";
  content: string;
  lineNumber: number; // line in original (for removed/unchanged) or new (for added)
}

/**
 * Minimal Myers-algorithm line diff.
 * Returns unified diff lines for display.
 */
export function lineByLineDiff(a: string, b: string): DiffLine[] {
  const aLines = a.split("\n");
  const bLines = b.split("\n");

  // Build edit script using LCS
  const lcs = computeLCS(aLines, bLines);
  const result: DiffLine[] = [];

  let ai = 0;
  let bi = 0;

  for (const [la, lb] of lcs) {
    // Lines removed from a (before this LCS match)
    while (ai < la) {
      result.push({ type: "removed", content: aLines[ai], lineNumber: ai + 1 });
      ai++;
    }
    // Lines added in b (before this LCS match)
    while (bi < lb) {
      result.push({ type: "added", content: bLines[bi], lineNumber: bi + 1 });
      bi++;
    }
    // Common line
    result.push({ type: "unchanged", content: aLines[ai], lineNumber: ai + 1 });
    ai++;
    bi++;
  }

  // Remaining removed
  while (ai < aLines.length) {
    result.push({ type: "removed", content: aLines[ai], lineNumber: ai + 1 });
    ai++;
  }
  // Remaining added
  while (bi < bLines.length) {
    result.push({ type: "added", content: bLines[bi], lineNumber: bi + 1 });
    bi++;
  }

  return result;
}

/** Compute LCS indices as pairs [indexInA, indexInB] */
function computeLCS(a: string[], b: string[]): [number, number][] {
  const m = a.length;
  const n = b.length;

  // For very large inputs, use a simpler O(nm) approach with space optimization
  // We store the LCS length table row by row
  const prev = new Uint16Array(n + 1);
  const curr = new Uint16Array(n + 1);
  const dirs: Uint8Array[] = [];

  for (let i = 0; i <= m; i++) {
    dirs.push(new Uint8Array(n + 1));
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
        dirs[i][j] = 1; // diagonal
      } else if (prev[j] >= curr[j - 1]) {
        curr[j] = prev[j];
        dirs[i][j] = 2; // up
      } else {
        curr[j] = curr[j - 1];
        dirs[i][j] = 3; // left
      }
    }
  }

  // Backtrack to find LCS pairs
  const pairs: [number, number][] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (dirs[i][j] === 1) {
      pairs.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (dirs[i][j] === 2) {
      i--;
    } else {
      j--;
    }
  }

  return pairs.reverse();
}

/** Quick stats from diff */
export function diffStats(lines: DiffLine[]): { added: number; removed: number; unchanged: number } {
  let added = 0, removed = 0, unchanged = 0;
  for (const l of lines) {
    if (l.type === "added") added++;
    else if (l.type === "removed") removed++;
    else unchanged++;
  }
  return { added, removed, unchanged };
}
