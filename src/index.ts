export type ValidationIssue = Readonly<{
  code: string;
  path?: string;
}>;

export type ValidationResult<T> =
  | Readonly<{ success: true; value: T }>
  | Readonly<{ success: false; issues: readonly ValidationIssue[] }>;

export type Validator<T> = (value: unknown) => ValidationResult<T>;

export type Contract<I, O> = Readonly<{
  id: string;
  version: string;
  validateInput: Validator<I>;
  validateOutput: Validator<O>;
}>;

export type ContractFailure = Readonly<{
  ok: false;
  kind: 'unknown-contract' | 'unsupported-version' | 'invalid-input' | 'invalid-output';
  contractId: string;
  version?: string;
  issues?: readonly ValidationIssue[];
}>;

export type ContractSuccess<O> = Readonly<{
  ok: true;
  contractId: string;
  version: string;
  value: O;
}>;

export type ContractResult<O> = ContractFailure | ContractSuccess<O>;

export type ContractRuntimeOptions = Readonly<{
  maxContracts?: number;
  maxIssues?: number;
}>;

export type ContractRuntime = Readonly<{
  versions(contractId: string): readonly string[];
  invoke<I, O>(
    contractId: string,
    input: unknown,
    handler: (input: I, version: string) => O | Promise<O>,
    requestedVersion?: string,
  ): Promise<ContractResult<O>>;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function boundedInteger(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1) {
    throw new RangeError(`${label} must be a positive safe integer`);
  }
  return resolved;
}

function cleanIssues(
  issues: readonly ValidationIssue[],
  limit: number,
): readonly ValidationIssue[] {
  if (!Array.isArray(issues)) return Object.freeze([{ code: 'invalid-validator-result' }]);
  const cleaned: ValidationIssue[] = [];
  for (const issue of issues.slice(0, limit)) {
    if (!isRecord(issue) || typeof issue.code !== 'string' || issue.code.length === 0) {
      cleaned.push(Object.freeze({ code: 'invalid-validator-result' }));
      continue;
    }
    const path = typeof issue.path === 'string' ? issue.path.slice(0, 256) : undefined;
    cleaned.push(
      Object.freeze(
        path === undefined
          ? { code: issue.code.slice(0, 128) }
          : {
              code: issue.code.slice(0, 128),
              path,
            },
      ),
    );
  }
  if (issues.length > limit) cleaned.push(Object.freeze({ code: 'issues-truncated' }));
  return Object.freeze(cleaned);
}

export function createContractRuntime(
  contracts: Iterable<Contract<unknown, unknown>>,
  options: ContractRuntimeOptions = {},
): ContractRuntime {
  if (!options || typeof options !== 'object') throw new TypeError('options are required');
  const maxContracts = boundedInteger(options.maxContracts, 500, 'maxContracts');
  const maxIssues = boundedInteger(options.maxIssues, 50, 'maxIssues');
  const byId = new Map<string, Map<string, Contract<unknown, unknown>>>();
  let count = 0;

  for (const contract of contracts) {
    if (
      !isRecord(contract) ||
      typeof contract.id !== 'string' ||
      contract.id.length === 0 ||
      contract.id.length > 128 ||
      typeof contract.version !== 'string' ||
      contract.version.length === 0 ||
      contract.version.length > 64 ||
      typeof contract.validateInput !== 'function' ||
      typeof contract.validateOutput !== 'function'
    ) {
      throw new TypeError('Each contract needs a bounded id, version, and input/output validators');
    }
    if (++count > maxContracts) throw new RangeError('Contract limit exceeded');
    let versions = byId.get(contract.id);
    if (!versions) {
      versions = new Map();
      byId.set(contract.id, versions);
    }
    if (versions.has(contract.version)) {
      throw new TypeError(`Duplicate contract version: ${contract.id}@${contract.version}`);
    }
    versions.set(contract.version, contract);
  }

  const runtime: ContractRuntime = {
    versions(contractId: string) {
      return Object.freeze([...(byId.get(contractId)?.keys() ?? [])]);
    },
    async invoke<I, O>(
      contractId: string,
      input: unknown,
      handler: (input: I, version: string) => O | Promise<O>,
      requestedVersion?: string,
    ): Promise<ContractResult<O>> {
      if (typeof handler !== 'function') throw new TypeError('handler must be a function');
      const versions = byId.get(contractId);
      if (!versions) return Object.freeze({ ok: false, kind: 'unknown-contract', contractId });
      const version = requestedVersion ?? versions.keys().next().value;
      if (version === undefined || !versions.has(version)) {
        return Object.freeze({
          ok: false,
          kind: 'unsupported-version',
          contractId,
          ...(requestedVersion === undefined ? {} : { version: requestedVersion }),
        });
      }

      const contract = versions.get(version);
      if (!contract) throw new Error('Contract registry invariant violated');
      const inputResult = contract.validateInput(input);
      if (!isRecord(inputResult) || typeof inputResult.success !== 'boolean') {
        throw new TypeError('Input validator returned an invalid result');
      }
      if (inputResult.success && !Object.hasOwn(inputResult, 'value')) {
        throw new TypeError('Input validator omitted its value');
      }
      if (!inputResult.success) {
        return Object.freeze({
          ok: false,
          kind: 'invalid-input',
          contractId,
          version,
          issues: cleanIssues(inputResult.issues, maxIssues),
        });
      }

      const output = await handler(inputResult.value as I, version);
      const outputResult = contract.validateOutput(output);
      if (!isRecord(outputResult) || typeof outputResult.success !== 'boolean') {
        throw new TypeError('Output validator returned an invalid result');
      }
      if (outputResult.success && !Object.hasOwn(outputResult, 'value')) {
        throw new TypeError('Output validator omitted its value');
      }
      if (!outputResult.success) {
        return Object.freeze({
          ok: false,
          kind: 'invalid-output',
          contractId,
          version,
          issues: cleanIssues(outputResult.issues, maxIssues),
        });
      }
      return Object.freeze({
        ok: true,
        contractId,
        version,
        value: outputResult.value as O,
      });
    },
  };
  return Object.freeze(runtime);
}
