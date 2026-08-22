# Coding standards

How this repo writes code. Read this before changing anything under `packages/`.

These rules are deduced from the code. Where code and this doc disagree, the code wins — fix the doc.

---

## Naming

- Full US English words, everywhere. Shorthands like `r` for `resource`, `d` for `dependency` applies only to lambda
  parameters, loop variables, and test locals. But things like `addr` for `address` is not fine.
- Never add shorthand to `dictionary.dic` to get it past spellcheck.
- `A` prefixes abstract classes — `AModel`, `AResource`, `ATerraformResource`.
- `I` prefixes interfaces — `IStateProvider`, `IModelAction`.
- `Schema` suffixes schema classes — `VpcSchema`, `RegionSchema`.
- PascalCase for classes, interfaces, and types. camelCase for everything else.
- Do not rename something that works. A rename costs review and gains nothing unless the old name
  is wrong.

## Files and folders

One concept per folder. The file suffix carries the meaning.

| Suffix                           | Holds                                                                                                   |
|----------------------------------|---------------------------------------------------------------------------------------------------------|
| `*.model.ts`                     | one model class                                                                                         |
| `*.resource.ts`                  | one resource class                                                                                      |
| `*.module.ts`                    | one module class                                                                                        |
| `*.anchor.ts`, `*.overlay.ts`    | one anchor / overlay class                                                                              |
| `*.schema.ts`, `index.schema.ts` | schema classes only                                                                                     |
| `*.action.ts`                    | one node action, named `<verb>-<node>.<kind>.action.ts` where kind is `model`, `overlay`, or `resource` |
| `*.service.ts`                   | one container-registered service plus its `*ServiceFactory`                                             |
| `*.utility.ts`                   | one `static`-only utility class                                                                         |
| `*.setup.ts`                     | one jest `setupFilesAfterEnv` module, registered in that package's `package.json`                       |
| `*.command.ts`                   | one octo-build CLI command                                                                              |
| `*.error.ts`                     | the error classes of one area                                                                           |
| `index.ts`                       | re-exports, nothing else                                                                                |

- Schemas live in their own file, never beside the class that consumes them.
- Actions live under `models/<node>/actions/` or `overlays/<node>/actions/`.

## Classes

Prefer a class. Write a bare function only where a class cannot work — decorators, and type-level
helpers.

Categorize by role and keep the roles apart:

- **Models** declare intent. **Resources** declare infrastructure. **Anchors and overlays** join them.
- **Actions** are the only place a model diff becomes resources.
- **Services** hold runtime state and are resolved through `Container`. **Utilities** are stateless
  `static` methods.
- One class per file. The exceptions are error subclasses of one area, and a service's factory.

## Functions

- Medium, not tiny. A function covers one *scope of work*, not one statement. Splitting to a single
  thing produces a swarm of functions that is harder to read than the code it replaced.
  `AwsSimpleSubnetModule.onInit` is the reference — about 90 lines, one job, readable top to bottom.
- Separate the work into blocks: a blank line between blocks, and a one-line `//` comment naming each.
- Extract a helper when a second caller exists, not to hit a line count.
- Guard clauses first, then the work, then the return.
- Explicit return type on every function (lint enforces this).

Abridged from `AwsSimpleSubnetModule.onInit`:

```ts
async
onInit(inputs
:
AwsSimpleSubnetModuleSchema
):
Promise < AwsSimpleSubnet[] > {
  const region = inputs.region;
  const { awsAvailabilityZones, awsRegionVpcCidrBlock } = await this.registerMetadata(inputs);

  // Validate subnet availability zone.
  if (!
awsAvailabilityZones.includes(inputs.subnetAvailabilityZone)
)
{
  throw new ModuleError('Invalid subnet availability zone!', this.constructor.name);
}

// Validate subnet CIDR is within region CIDR.
if (!contains([awsRegionVpcCidrBlock], [inputs.subnetCidrBlock])) {
  throw new ModuleError('Subnet CIDR is not within region CIDR!', this.constructor.name);
}

// Create a new subnet.
const subnet = new AwsSimpleSubnet(region, inputs.subnetName);
region.addSubnet(subnet);

return [subnet];
}
```

## Comments

- Describe what the code **is**, never how it got there.
- Banned: any comparison to a former version — "previously," "used to," "no longer," "this was
  broken," "an earlier cut." Rationale goes in the commit message or a `docs/` file.
- Block comments inside a function: one line, imperative, naming the block. `// Add anchors.`
- Docblocks: one or two lines. Longer only for a contract a caller cannot infer — a precedence rule,
  an ordering constraint, all-or-nothing behavior.
- Never restate the line below it.
- Never justify a decision in a comment. If it needs defending, it is probably wrong.

```ts
// wrong
/**
 * Collapses diffs into the one action a reader cares about. `reason` is carried from whichever diff
 * won, because that is the diff whose explanation applies, and it is the single most useful thing a
 * report can show. Shared by validate and the builder so they can never disagree.
 */

// right
/**
 * Collapses a resource's field-level diffs into one action per resource.
 *
 * Precedence: an add/delete of `resourceId` wins; a REPLACE beats an UPDATE; otherwise UPDATE.
 */
```

## JSDoc

`packages/` JSDoc feeds the API docs site, so public classes carry it.

- `@group <Area>/<Name>` on every exported class — this is how the docs site files it. A group is
  one concept: two folders sharing a group name merge into one page.
- `@internal` on anything not meant for users. The docs site builds with `excludeInternal`, so this
  drops the item entirely. Use it on the framework plumbing of an exported class — serialization,
  diffing, cloning — so the page shows only what a user calls.
- `@example` with a fenced `ts` block on models, modules, and anything a user constructs. Nobody
   compiles an example, so check its inputs against the schema when you touch too.
- `@see`, `@link`, `@reference` to connect a module to the schemas and resources it touches.
- `{@link X}` resolves only within the same package. Across packages, link the docs site instead —
  `[ModuleError](/api/octo/class/ModuleError)`. A broken `{@link}` renders as bare text.
- No `@returns` on a class, and no `@param` that restates the parameter's name.

Write what the item is *for* and how to call it. Users do not read octo's internals, so an
explanation of how the framework achieves something is noise to them; a signature they can already
read is noise too.

Verify with `typedoc --excludeInternal --excludePrivate --useTsLinkResolution` over the package's
`src/index.ts`, and fix every `Failed to resolve link`.

## Types and imports

- ESM: every relative import ends in `.js`.
- `import type` / inline `type` for type-only imports (lint enforces this).
- `override` is required on every override.
- Imports are alphabetically sorted and grouped; so are class members, interface members, object
  literals, and JSON keys. Run `pnpm run lint:fix` rather than sorting by hand.
- Do not add new interfaces or types unless they are unique and not defined anywhere else. Re-use if possible.
- Do not export file internals unless someone actually needs them.
- Do not export a type or interface if it can be derived easily by other means, such as TypeScript helpers like
  Parameters, ReturnType, etc.
- Max line length 120. Single quotes. Trailing commas.

## Errors

- One error class per failure kind, in the area's `*.error.ts`, exported through `errors/index.ts`.
- Extend the area's base error (`NodeError`, `ResourceError`, …) when one fits.
- Carry the subject as a readonly field, and call `Object.setPrototypeOf(this, X.prototype)` last.
- Messages are short, imperative, and end in `!` — `'Subnet already exists!'`.

## Tests

Tests exist to catch breakage between releases, not to chase coverage.

| File            | Kind        | Cost                                                                 |
|-----------------|-------------|----------------------------------------------------------------------|
| `*.spec.ts`     | unit        | free, run constantly                                                 |
| `*.ispec.ts`    | integration | slow                                                                 |
| `*.e2e-spec.ts` | e2e         | creates real AWS resources in `octo-templates` — do not run casually |

Tests are written in sequence and read as a specification of the class:

```ts
describe('<Subject> UT', () => {
  it('should set static members', () => {});

  describe('schema validation', () => {});

  describe('methodName()', () => {
    it('should throw error if ...', () => {});
    it('should ...', () => {});
  });
});
```

- Top-level describe is `'<Subject> UT'` or `'<Subject> E2E'`.
- One `describe` per method, named `'methodName()'`, in the order the methods appear on the class.
- Every `it` starts with `should`.
- Error cases before happy paths within a method.

## Secrets

The repository is public and the e2e suites run against a live AWS account, so captured output
carries that account.

- Never commit a real AWS account number. Snapshots in `octo-templates` are redacted on the way in
  by `aws-account-redaction.setup.ts`, and `.github/jobs/detect-aws-account-id.job.sh` fails the PR
  for every other path. Add a placeholder to that script rather than widening its pattern.
- A test fixture that needs an account number uses `123456789012`. Terragrunt's own mock outputs
  read `000000000000` and are left as the tool wrote them.
- Real account values reach a suite through a gitignored `.env`, never through a source. The tracked
  `.env.defaults` beside it carries a placeholder and documents the key.
- The same rule covers anything else that identifies the account or the operator: access key ids,
  session tokens, non-default profile names, and absolute paths from the machine that ran a capture.
  `docs/DOCUMENTATION-STANDARDS.md` holds the version of this rule that applies to `apps/octo-docs`.

## Public API

- `packages/octo` is a base library: no UI, no report shapes, no presentation policy. It emits what
  it did; consumers decide what it means.
- Do not add to a package's `index.ts` unless a consumer cannot derive the type. Every export is a
  compatibility commitment.
- Derive types from what is already exported.

```ts
type Report = Awaited<ReturnType<Octo['validate']>>;
type Payload = ValidateModeCompletedEvent['payload'];
```

- A file-level `export` so a sibling can name a type is fine; that is not a public API change.
- A presentation change must ship one package. If a label needs an octo release, the layering is wrong.

## Before you add anything

- Search first. Most "missing" data is already computed somewhere and simply not returned.
- Do not duplicate data that already flows. If two things carry the same fact, delete one.
- Do not invent a state. Anything written to a state file changes it on every run — that is a cost.
- Do not build for a future caller. Write the second consumer before you generalize.
- Clean cuts over shims. Delete the old path; do not keep both behind a flag.

## Verification

- `tsc --noEmit` on every changed package, not only the one you edited.
- `pnpm run lint` must be clean — no errors, no warnings, no spelling errors.
- Run the affected suites and report the real numbers. If you did not run something, say so.
- Never claim a live or e2e run you did not do.
- `octo-templates` and `octo-aws-cdk` import `octo` from `dist` — rebuild before running their tests.

## Commits

Format is enforced by `.github/jobs/validate-pr-title.job.sh`:

```
<chore|major|minor|patch>(<docs|feat|fix|refactor|release|revert|test>): <package> | <sentence>.
```

- Lowercase sentence, ends in a period. `patch(fix): octo | stream terragrunt's output during an apply.`
- One concern per commit. A bug fix never rides along with a refactor.

## Docs

- Living docs record what is, not what was. Delete a section once its issue is fixed.
- Write the trade-offs into the doc before asking for a decision. Do not ask someone to choose
  between options they cannot weigh.
