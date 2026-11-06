# @lp-labs/api-contract-runtime

Versioned API request/response validation and handler dispatch using validators supplied by your
application. This library does not interpret JSON Schema, OpenAPI, or any other schema language.
It has zero runtime and peer dependencies.

## Install

```bash
npm install @lp-labs/api-contract-runtime
```

The package provides ESM, CommonJS, and TypeScript declarations.

## Quickstart

```js
import { createContractRuntime } from '@lp-labs/api-contract-runtime';

const isObject = (value) => typeof value === 'object' && value !== null;
const runtime = createContractRuntime([
  {
    id: 'greeting',
    version: 'v1',
    validateInput: (value) =>
      isObject(value) && typeof value.name === 'string'
        ? { success: true, value: { name: value.name } }
        : { success: false, issues: [{ code: 'name-required', path: 'name' }] },
    validateOutput: (value) =>
      typeof value === 'string'
        ? { success: true, value }
        : { success: false, issues: [{ code: 'expected-string' }] },
  },
]);

const result = await runtime.invoke('greeting', { name: 'Ada' }, ({ name }) => `Hello, ${name}!`);
if (!result.ok || result.value !== 'Hello, Ada!') throw new Error('Contract invocation failed');
```

## API

- `createContractRuntime(contracts, options?)` copies a bounded contract registry. Every contract
  has a nonempty `id`, opaque `version`, `validateInput`, and `validateOutput`.
- `ContractRuntime.versions(id)` returns the registered versions in insertion order.
- `ContractRuntime.invoke(id, input, handler, requestedVersion?)` validates input before calling the
  handler, then validates its output. With no requested version, the first registered version is
  selected. Handler exceptions propagate to the caller.
- A validator returns `{ success: true, value }` or `{ success: false, issues }`; each issue has a
  nonempty `code` and optional `path`. Failed results expose only bounded codes and paths, never
  input/output values or validator messages.

Invocation results are `{ ok: true, contractId, version, value }` or `{ ok: false, kind, ... }`.
Failure kinds are `unknown-contract`, `unsupported-version`, `invalid-input`, and `invalid-output`.
Malformed validator results throw `TypeError`; validator-thrown errors also propagate. Issue lists
are truncated at `maxIssues` (default 50, with an `issues-truncated` marker). The registry defaults
to 500 contracts. Both limits must be positive safe integers.

## Customization and limits

Write small validators around your own runtime types, or adapt an existing validation library at
your application boundary. Version strings are opaque: this runtime does no semantic-version
comparison, automatic negotiation, schema compilation, compatibility analysis, retries, or
transport. You decide the fallback version by registration order and can request an exact version.
Validators are trusted application code and should avoid placing sensitive data in issue codes or
paths. No input values are copied or retained by the runtime.

## Exported types

`ValidationIssue`, `ValidationResult<T>`, `Validator<T>`, `Contract<I, O>`,
`ContractFailure`, `ContractSuccess<O>`, `ContractResult<O>`, `ContractRuntimeOptions`, and
`ContractRuntime` describe the validator, contract, result, and runtime APIs.

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
