
const SEVERITY = { HIGH: "high", MEDIUM: "medium", LOW: "low" };

function detectLanguage(filename, code) {
  if (filename) {
    const ext = filename.split(".").pop().toLowerCase();
    if (["py"].includes(ext)) return "python";
    if (["js", "jsx", "mjs", "cjs"].includes(ext)) return "javascript";
    if (["ts", "tsx"].includes(ext)) return "typescript";
    if (["java"].includes(ext)) return "java";
  }
  // fall back to sniffing the source
  if (/^\s*def\s+\w+\(.*\):/m.test(code) || /^\s*import\s+\w+/m.test(code)) {
    return "python";
  }
  if (/\b(const|let|function|=>)\b/.test(code)) return "javascript";
  return "unknown";
}

function addIssue(issues, { line, severity, category, message, suggestion }) {
  issues.push({ line, severity, category, message, suggestion });
}

function analyzeCommon(lines, issues) {
  lines.forEach((raw, idx) => {
    const line = idx + 1;
    const text = raw;

    if (text.length > 100) {
      addIssue(issues, {
        line,
        severity: SEVERITY.LOW,
        category: "Formatting",
        message: `Line is ${text.length} characters long.`,
        suggestion: "Keep lines under ~100 characters for readability.",
      });
    }
    if (/[ \t]+$/.test(text)) {
      addIssue(issues, {
        line,
        severity: SEVERITY.LOW,
        category: "Formatting",
        message: "Trailing whitespace.",
        suggestion: "Remove trailing spaces/tabs at the end of the line.",
      });
    }
    if (/\bTODO\b|\bFIXME\b/.test(text)) {
      addIssue(issues, {
        line,
        severity: SEVERITY.LOW,
        category: "Best Practice",
        message: "Unresolved TODO/FIXME comment.",
        suggestion: "Resolve before merging, or file a tracked issue.",
      });
    }
    if (/\b(password|secret|api[_-]?key|token)\s*=\s*["'][^"']+["']/i.test(text)) {
      addIssue(issues, {
        line,
        severity: SEVERITY.HIGH,
        category: "Security",
        message: "Possible hard-coded secret or credential.",
        suggestion: "Load secrets from environment variables or a secret manager instead.",
      });
    }
  });
}

function analyzeJavaScript(code, lines, issues) {
  lines.forEach((raw, idx) => {
    const line = idx + 1;
    const text = raw;

    if (/^\s*var\s+/.test(text)) {
      addIssue(issues, {
        line,
        severity: SEVERITY.MEDIUM,
        category: "Best Practice",
        message: "Use of `var`.",
        suggestion: "Prefer `let` or `const` for block-scoped variables.",
      });
    }
    if (/console\.(log|debug)\(/.test(text)) {
      addIssue(issues, {
        line,
        severity: SEVERITY.LOW,
        category: "Code Quality",
        message: "Debug `console.log` left in code.",
        suggestion: "Remove debug statements or replace with a real logger.",
      });
    }
    if (/==(?!=)/.test(text) && !/===/.test(text)) {
      addIssue(issues, {
        line,
        severity: SEVERITY.MEDIUM,
        category: "Possible Bug",
        message: "Loose equality (`==`) used.",
        suggestion: "Use `===`/`!==` to avoid implicit type coercion bugs.",
      });
    }
    if (/\beval\(/.test(text)) {
      addIssue(issues, {
        line,
        severity: SEVERITY.HIGH,
        category: "Security",
        message: "Use of `eval()`.",
        suggestion: "Avoid `eval` — it can execute arbitrary code and is a common injection vector.",
      });
    }
    if (/catch\s*\([^)]*\)\s*{\s*}/.test(text)) {
      addIssue(issues, {
        line,
        severity: SEVERITY.MEDIUM,
        category: "Possible Bug",
        message: "Empty catch block silently swallows errors.",
        suggestion: "At minimum log the error, or handle it explicitly.",
      });
    }
    if (/^[^/]*[^\s;{}]\s*$/.test(text) && /\b(let|const|return|break|continue)\b.*[^;{}\s]$/.test(text.trim())) {
      addIssue(issues, {
        line,
        severity: SEVERITY.LOW,
        category: "Formatting",
        message: "Statement may be missing a semicolon.",
        suggestion: "Add a trailing semicolon for consistency.",
      });
    }
  });

  // Very rough "declared but never referenced again" pass
  const declRe = /\b(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=/g;
  let match;
  while ((match = declRe.exec(code)) !== null) {
    const name = match[1];
    const occurrences = code.split(new RegExp(`\\b${name}\\b`)).length - 1;
    if (occurrences <= 1) {
      const line = code.slice(0, match.index).split("\n").length;
      addIssue(issues, {
        line,
        severity: SEVERITY.LOW,
        category: "Code Quality",
        message: `\`${name}\` is declared but never used.`,
        suggestion: "Remove the unused variable or use it.",
      });
    }
  }
}

function analyzePython(code, lines, issues) {
  lines.forEach((raw, idx) => {
    const line = idx + 1;
    const text = raw;

    if (/except\s*:\s*$/.test(text)) {
      addIssue(issues, {
        line,
        severity: SEVERITY.MEDIUM,
        category: "Best Practice",
        message: "Bare `except:` clause.",
        suggestion: "Catch specific exceptions instead of every possible error.",
      });
    }
    if (/^\s*print\(/.test(text)) {
      addIssue(issues, {
        line,
        severity: SEVERITY.LOW,
        category: "Code Quality",
        message: "Debug `print()` left in code.",
        suggestion: "Remove debug prints or use the `logging` module.",
      });
    }
    if (/def\s+\w+\([^)]*=\s*(\[\]|\{\})/.test(text)) {
      addIssue(issues, {
        line,
        severity: SEVERITY.MEDIUM,
        category: "Possible Bug",
        message: "Mutable default argument (list/dict).",
        suggestion: "Use `None` as the default and create the list/dict inside the function.",
      });
    }
    if (/\t/.test(text)) {
      addIssue(issues, {
        line,
        severity: SEVERITY.LOW,
        category: "Formatting",
        message: "Tab character used for indentation.",
        suggestion: "PEP 8 recommends 4 spaces per indentation level.",
      });
    }
  });
}

function runStaticAnalysis(code, filename) {
  const language = detectLanguage(filename, code);
  const lines = code.split("\n");
  const issues = [];

  analyzeCommon(lines, issues);
  if (language === "javascript" || language === "typescript") {
    analyzeJavaScript(code, lines, issues);
  } else if (language === "python") {
    analyzePython(code, lines, issues);
  }

  const summary = {
    high: issues.filter((i) => i.severity === SEVERITY.HIGH).length,
    medium: issues.filter((i) => i.severity === SEVERITY.MEDIUM).length,
    low: issues.filter((i) => i.severity === SEVERITY.LOW).length,
  };

  return {
    language,
    totalLines: lines.length,
    issues: issues.sort((a, b) => a.line - b.line),
    summary,
  };
}

module.exports = { runStaticAnalysis, detectLanguage, SEVERITY };
