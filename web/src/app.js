import { analyzeClassPad, SAMPLE_PROGRAM, transpileClassPadToJs } from './classpad.js';
import { convertTextToXcp, makeDownloadName } from './xcp.js';

const editorHost = document.querySelector('#editor');
const fallbackEditor = document.querySelector('#fallback-editor');
const diagnosticsEl = document.querySelector('#diagnostics');
const transpiledEl = document.querySelector('#transpiled');
const statusEl = document.querySelector('#status');
const downloadBtn = document.querySelector('#download');
const sampleBtn = document.querySelector('#load-sample');
const copyJsBtn = document.querySelector('#copy-js');
const folderInput = document.querySelector('#folder-name');
const variableInput = document.querySelector('#variable-name');
const newlineInput = document.querySelector('#convert-newlines');
const payloadBytesEl = document.querySelector('#payload-bytes');
const outputBytesEl = document.querySelector('#output-bytes');
const checksumEl = document.querySelector('#checksum');

let monacoEditor;
let lastXcp;

function getSource() {
  return monacoEditor ? monacoEditor.getValue() : fallbackEditor.value;
}

function setSource(value) {
  if (monacoEditor) {
    monacoEditor.setValue(value);
  } else {
    fallbackEditor.value = value;
  }
  update();
}

function options() {
  return {
    folderName: folderInput.value,
    variableName: variableInput.value,
    convertNewlines: newlineInput.checked,
  };
}

function severityIcon(severity) {
  return { error: '⛔', warning: '⚠️', info: 'ℹ️' }[severity] || 'ℹ️';
}

function renderDiagnostics(diagnostics) {
  diagnosticsEl.innerHTML = '';
  if (diagnostics.length === 0) {
    diagnosticsEl.innerHTML = '<li class="ok">No obvious text-level issues found.</li>';
    return;
  }

  for (const diagnostic of diagnostics) {
    const li = document.createElement('li');
    li.className = diagnostic.severity;
    const location = diagnostic.line ? `Line ${diagnostic.line}: ` : '';
    li.textContent = `${severityIcon(diagnostic.severity)} ${location}${diagnostic.message}`;
    diagnosticsEl.append(li);
  }
}

function decorateMonaco(diagnostics) {
  if (!monacoEditor || !window.monaco) return;
  const markers = diagnostics.filter((item) => item.line > 0).map((item) => ({
    startLineNumber: item.line,
    startColumn: 1,
    endLineNumber: item.line,
    endColumn: Number.MAX_SAFE_INTEGER,
    message: item.message,
    severity: item.severity === 'error' ? monaco.MarkerSeverity.Error : item.severity === 'warning' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Info,
  }));
  monaco.editor.setModelMarkers(monacoEditor.getModel(), 'classpad', markers);
}

function update() {
  const source = getSource();
  const diagnostics = analyzeClassPad(source);
  const result = convertTextToXcp(source, options());
  lastXcp = result;

  renderDiagnostics(diagnostics);
  decorateMonaco(diagnostics);
  transpiledEl.textContent = transpileClassPadToJs(source);
  payloadBytesEl.textContent = result.meta.dataLength.toLocaleString();
  outputBytesEl.textContent = result.bytes.length.toLocaleString();
  checksumEl.textContent = `0x${result.meta.checksum.toString(16).padStart(2, '0')}`;
  statusEl.textContent = `Ready: ${result.meta.variableName}.xcp in folder ${result.meta.folderName}`;

  const truncations = [];
  if (result.meta.variableTruncated) truncations.push('variable name truncated to 8 bytes');
  if (result.meta.folderTruncated) truncations.push('folder name truncated to 8 bytes');
  if (truncations.length) statusEl.textContent += ` (${truncations.join(', ')})`;
}

function downloadXcp() {
  if (!lastXcp) update();
  const blob = new Blob([lastXcp.bytes], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = makeDownloadName(variableInput.value);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function copyTranspiledJs() {
  await navigator.clipboard.writeText(transpiledEl.textContent);
  copyJsBtn.textContent = 'Copied';
  setTimeout(() => {
    copyJsBtn.textContent = 'Copy JS';
  }, 1200);
}

function bootFallbackEditor() {
  fallbackEditor.hidden = false;
  fallbackEditor.value = SAMPLE_PROGRAM;
  fallbackEditor.addEventListener('input', update);
  update();
}

function bootMonaco() {
  if (!window.require) {
    bootFallbackEditor();
    return;
  }

  window.require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' } });
  window.require(['vs/editor/editor.main'], () => {
    monaco.languages.register({ id: 'classpad' });
    monaco.languages.setMonarchTokensProvider('classpad', {
      tokenizer: {
        root: [
          [/"[^"\\]*(?:\\.[^"\\]*)*"/, 'string'],
          [/\b(?:ClrText|DelVar|Local|Input|Print|If|Then|Else|For|Next|While|Return)\b/, 'keyword'],
          [/\b(?:diff|lim|sin|cos|tan|sqrt|ln|log|solve|expand|factor)\b/, 'type.identifier'],
          [/[⇒→≤≥≠÷×−]/, 'operator'],
        ],
      },
    });
    monacoEditor = monaco.editor.create(editorHost, {
      value: SAMPLE_PROGRAM,
      language: 'classpad',
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 15,
      unicodeHighlight: { ambiguousCharacters: false, nonBasicASCII: false },
    });
    monacoEditor.onDidChangeModelContent(update);
    fallbackEditor.remove();
    update();
  }, bootFallbackEditor);
}

[sampleBtn, downloadBtn, copyJsBtn, folderInput, variableInput, newlineInput].forEach((element) => {
  const eventName = element.tagName === 'INPUT' ? 'input' : 'click';
  element.addEventListener(eventName, update);
});
sampleBtn.addEventListener('click', () => setSource(SAMPLE_PROGRAM));
downloadBtn.addEventListener('click', downloadXcp);
copyJsBtn.addEventListener('click', copyTranspiledJs);

bootMonaco();
