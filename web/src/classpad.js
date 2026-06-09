const SAMPLE_PROGRAM = `ClrText
DelVar x
Local u,v,a,du,dv,r
Input u,"Numerator:"
Input v,"Denominator:"
Input a,"x approaches:"
ClrText
diff(u,x,1)⇒du
diff(v,x,1)⇒dv
Print "u'="
Print du
Print "v'="
Print dv
lim(du/dv,x,a)⇒r
Print "Result:"
Print r`;

const KNOWN_COMMANDS = new Set([
  'ClrText', 'DelVar', 'Local', 'Input', 'Print', 'If', 'Then', 'Else', 'IfEnd', 'For', 'To', 'Step',
  'Next', 'While', 'WhileEnd', 'Return', 'Break', 'Stop', 'Define', 'Goto', 'Lbl', 'Try', 'Catch',
  'TryEnd', 'Do', 'LpWhile', 'Switch', 'Case', 'Default', 'SwitchEnd', 'Function', 'EndFunc',
]);

const KNOWN_FUNCTIONS = new Set([
  'diff', 'lim', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sqrt', 'ln', 'log', 'exp', 'abs',
  'factor', 'expand', 'solve', 'simplify', 'int', 'sum', 'prod', 'seq', 'min', 'max', 'mean',
]);

const OPERATORS = new Map([
  ['⇒', '='],
  ['→', '='],
  ['÷', '/'],
  ['×', '*'],
  ['−', '-'],
  ['≤', '<='],
  ['≥', '>='],
  ['≠', '!=='],
  ['^', '**'],
]);

function stripStringLiterals(line) {
  return line.replace(/"(?:[^"\\]|\\.)*"/g, '');
}

function jsIdentifier(name) {
  return name.replace(/[^\p{L}\p{N}_$]/gu, '_').replace(/^[^\p{L}_$]/u, '_$&');
}

function translateExpression(expression) {
  let output = expression.trim();
  for (const [from, to] of OPERATORS) {
    output = output.split(from).join(to);
  }
  output = output.replace(/\blim\s*\(/g, 'math.lim(').replace(/\bdiff\s*\(/g, 'math.diff(');
  return output;
}

export function analyzeClassPad(source) {
  const diagnostics = [];
  const lines = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();
    if (!trimmed) return;

    const quoteCount = (line.match(/"/g) || []).length;
    if (quoteCount % 2 === 1) {
      diagnostics.push({ line: lineNumber, severity: 'error', message: 'Unclosed string literal.' });
    }

    if (/->|=>/.test(trimmed)) {
      diagnostics.push({ line: lineNumber, severity: 'warning', message: 'Use the ClassPad store arrow ⇒ instead of -> or =>.' });
    }

    const stripped = stripStringLiterals(trimmed);
    const openParens = (stripped.match(/\(/g) || []).length;
    const closeParens = (stripped.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      diagnostics.push({ line: lineNumber, severity: 'error', message: 'Unbalanced parentheses.' });
    }

    const firstWord = stripped.match(/^([A-Za-z][A-Za-z0-9_]*)\b/)?.[1];
    if (firstWord && !KNOWN_COMMANDS.has(firstWord) && !KNOWN_FUNCTIONS.has(firstWord)) {
      diagnostics.push({ line: lineNumber, severity: 'info', message: `Unknown leading token “${firstWord}”; verify it exists on ClassPad II.` });
    }
  });

  if (/⇒|→|≤|≥|≠|÷|×|−/.test(source)) {
    diagnostics.push({ line: 0, severity: 'info', message: 'Unicode math tokens detected and preserved as UTF-8 in the .xcp payload.' });
  }

  return diagnostics;
}

export function transpileClassPadToJs(source) {
  const declared = new Set();
  const output = [
    '// Experimental helper output; this is not a Casio executable compiler.',
    'const math = {',
    '  diff: (expr, variable, order = 1) => `diff(${expr}, ${variable}, ${order})`,',
    '  lim: (expr, variable, value) => `lim(${expr}, ${variable}, ${value})`,',
    '};',
    'const input = async (prompt) => window.prompt(prompt) ?? "";',
    '',
    'async function runClassPadProgram() {',
  ];

  const lines = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      output.push('');
      continue;
    }

    let match;
    if (line === 'ClrText') {
      output.push('  console.clear();');
    } else if ((match = line.match(/^DelVar\s+(.+)$/))) {
      output.push(`  ${translateExpression(match[1])} = undefined;`);
    } else if ((match = line.match(/^Local\s+(.+)$/))) {
      const names = match[1].split(',').map((name) => jsIdentifier(name.trim())).filter(Boolean);
      names.forEach((name) => declared.add(name));
      output.push(`  let ${names.join(', ')};`);
    } else if ((match = line.match(/^Input\s+([^,]+)\s*,\s*"([^"]*)"$/))) {
      const name = jsIdentifier(match[1].trim());
      if (!declared.has(name)) {
        declared.add(name);
        output.push(`  let ${name};`);
      }
      output.push(`  ${name} = await input(${JSON.stringify(match[2])});`);
    } else if ((match = line.match(/^Print\s+(.+)$/))) {
      output.push(`  console.log(${translateExpression(match[1])});`);
    } else if ((match = line.match(/^(.+?)(?:⇒|→)([A-Za-z_$][\w$]*)$/u))) {
      const expression = translateExpression(match[1]);
      const target = jsIdentifier(match[2]);
      if (!declared.has(target)) {
        declared.add(target);
        output.push(`  let ${target};`);
      }
      output.push(`  ${target} = ${expression};`);
    } else {
      output.push(`  // TODO: ${rawLine}`);
    }
  }

  output.push('}', 'runClassPadProgram();');
  return output.join('\n');
}

export { SAMPLE_PROGRAM };
