import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { SAMPLE_PROGRAM, analyzeClassPad, transpileClassPadToJs } from '../web/src/classpad.js';
import { convertTextToXcp, encodeProgramText, normalizeTextNewlines } from '../web/src/xcp.js';

test('JavaScript XCP writer matches original C writer for ASCII text and -l newline conversion', () => {
  execFileSync('make', ['txt2xcp'], { stdio: 'pipe' });
  const dir = mkdtempSync(join(tmpdir(), 'txt2xcp-'));
  const input = join(dir, 'input.txt');
  const output = join(dir, 'output.xcp');
  const source = 'ClrText\nPrint "Hello"\n1⇒a\n';
  writeFileSync(input, source, 'utf8');

  execFileSync('./txt2xcp', ['-l', '-n', 'file', '-d', 'main', input, output], { stdio: 'pipe' });
  const cBytes = readFileSync(output);
  const jsBytes = convertTextToXcp(source, {
    convertNewlines: true,
    variableName: 'file',
    folderName: 'main',
  }).bytes;

  assert.deepEqual([...jsBytes], [...cBytes]);
});

test('Unicode ClassPad arrows are preserved as UTF-8 payload bytes', () => {
  const source = 'diff(u,x,1)⇒du\nlim(du/dv,x,a)⇒r';
  const payload = encodeProgramText(source, { convertNewlines: true });
  assert.deepEqual([...payload], [...new TextEncoder().encode(normalizeTextNewlines(source))]);
  assert.ok([...payload].includes(0xe2), 'UTF-8 multi-byte arrow lead byte should be present');
});

test('sample program converts, analyzes, and produces a JavaScript sketch', () => {
  const result = convertTextToXcp(SAMPLE_PROGRAM, { variableName: 'lhopital', folderName: 'main' });
  const diagnostics = analyzeClassPad(SAMPLE_PROGRAM);
  const js = transpileClassPadToJs(SAMPLE_PROGRAM);

  assert.ok(result.bytes.length > SAMPLE_PROGRAM.length);
  assert.equal(result.meta.variableName, 'lhopital');
  assert.ok(diagnostics.some((diagnostic) => diagnostic.message.includes('Unicode math tokens')));
  assert.match(js, /math\.diff/);
  assert.match(js, /math\.lim/);
});
