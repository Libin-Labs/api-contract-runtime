import assert from 'node:assert/strict';
import test from 'node:test';
import { createContractRuntime } from '../dist/esm/index.js';

const text = (value) =>
  typeof value === 'string'
    ? { success: true, value }
    : { success: false, issues: [{ code: 'not-text', path: '$' }] };
const greeting = {
  id: 'greeting',
  version: 'v1',
  validateInput: (value) =>
    typeof value === 'object' && value !== null && typeof value.name === 'string'
      ? { success: true, value: { name: value.name } }
      : { success: false, issues: [{ code: 'missing-name', path: '$.name' }] },
  validateOutput: text,
};

test('validates input then output and dispatches the selected version', async () => {
  const runtime = createContractRuntime([greeting]);
  const result = await runtime.invoke('greeting', { name: 'Ada' }, ({ name }, version) => {
    assert.equal(version, 'v1');
    return `Hello ${name}`;
  });
  assert.deepEqual(result, { ok: true, contractId: 'greeting', version: 'v1', value: 'Hello Ada' });
  assert.deepEqual(runtime.versions('greeting'), ['v1']);
});

test('reports invalid input without calling the handler', async () => {
  const runtime = createContractRuntime([greeting]);
  let called = false;
  const result = await runtime.invoke('greeting', {}, () => {
    called = true;
    return 'unused';
  });
  assert.equal(called, false);
  assert.deepEqual(result, {
    ok: false,
    kind: 'invalid-input',
    contractId: 'greeting',
    version: 'v1',
    issues: [{ code: 'missing-name', path: '$.name' }],
  });
});

test('validates handler output and supports exact version selection', async () => {
  const runtime = createContractRuntime([greeting, { ...greeting, version: 'v2' }]);
  const invalid = await runtime.invoke('greeting', { name: 'Ada' }, () => 42, 'v2');
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.kind, 'invalid-output');
  assert.equal(runtime.versions('greeting').length, 2);
});

test('reports missing contracts and unsupported versions', async () => {
  const runtime = createContractRuntime([greeting]);
  assert.deepEqual(await runtime.invoke('absent', {}, () => 'x'), {
    ok: false,
    kind: 'unknown-contract',
    contractId: 'absent',
  });
  assert.deepEqual(await runtime.invoke('greeting', {}, () => 'x', 'v9'), {
    ok: false,
    kind: 'unsupported-version',
    contractId: 'greeting',
    version: 'v9',
  });
});

test('bounds and sanitizes issue details without retaining values or messages', async () => {
  const runtime = createContractRuntime(
    [
      {
        ...greeting,
        validateInput: () => ({
          success: false,
          issues: [
            { code: 'bad', path: '$.secret', message: 'do not expose' },
            { code: 'also-bad' },
          ],
        }),
      },
    ],
    { maxIssues: 1 },
  );
  const result = await runtime.invoke('greeting', { secret: 'private' }, () => 'unused');
  assert.deepEqual(result, {
    ok: false,
    kind: 'invalid-input',
    contractId: 'greeting',
    version: 'v1',
    issues: [{ code: 'bad', path: '$.secret' }, { code: 'issues-truncated' }],
  });
  assert.equal(JSON.stringify(result).includes('private'), false);
  assert.equal(JSON.stringify(result).includes('do not expose'), false);
});

test('rejects duplicate versions, invalid definitions, and invalid limits', () => {
  assert.throws(() => createContractRuntime([greeting, greeting]), /Duplicate/);
  assert.throws(() => createContractRuntime([{}]), TypeError);
  assert.throws(() => createContractRuntime([], { maxIssues: 0 }), RangeError);
});

test('propagates handler and validator exceptions', async () => {
  const runtime = createContractRuntime([greeting]);
  await assert.rejects(
    runtime.invoke('greeting', { name: 'A' }, () => Promise.reject(new Error('handler'))),
    /handler/,
  );
  const broken = createContractRuntime([
    { ...greeting, validateInput: () => ({ success: 'yes' }) },
  ]);
  await assert.rejects(
    broken.invoke('greeting', {}, () => 'ok'),
    /invalid result/,
  );
  const missingValue = createContractRuntime([
    { ...greeting, validateInput: () => ({ success: true }) },
  ]);
  await assert.rejects(
    missingValue.invoke('greeting', {}, () => 'ok'),
    /omitted its value/,
  );
});
