import {
  createContractRuntime,
  type Contract,
  type ContractResult,
  type ValidationResult,
} from '@lp-labs/api-contract-runtime';

type Input = { name: string };
const validateInput = (value: unknown): ValidationResult<Input> =>
  typeof value === 'object' && value !== null && 'name' in value && typeof value.name === 'string'
    ? { success: true, value: { name: value.name } }
    : { success: false, issues: [{ code: 'invalid-name' }] };
const validateOutput: Contract<string, string>['validateOutput'] = (value) =>
  typeof value === 'string'
    ? { success: true, value }
    : { success: false, issues: [{ code: 'invalid-output' }] };
const contract: Contract<Input, string> = {
  id: 'greeting',
  version: 'v1',
  validateInput,
  validateOutput,
};
const runtime = createContractRuntime([contract]);
const result: ContractResult<string> = await runtime.invoke<Input, string>(
  'greeting',
  { name: 'Ada' },
  ({ name }) => `Hello ${name}`,
);
void result;
