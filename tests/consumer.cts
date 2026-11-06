import { createContractRuntime, type ValidationResult } from '@lp-labs/api-contract-runtime';
const validate = (value: unknown): ValidationResult<number> =>
  typeof value === 'number'
    ? { success: true, value }
    : { success: false, issues: [{ code: 'number-required' }] };
const runtime = createContractRuntime([
  {
    id: 'count',
    version: 'one',
    validateInput: validate,
    validateOutput: validate,
  },
]);
const versions: readonly string[] = runtime.versions('count');
void versions;
