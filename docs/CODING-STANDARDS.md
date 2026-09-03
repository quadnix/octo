# Coding standards

How this repo writes code. Read this before changing anything under `packages/`.

These rules are deduced from the code. Where code and this doc disagree, the code wins — fix the doc.

---

## Naming

- Full US English words, everywhere. Shorthands like `r` for `resource`, `d` for `dependency` applies only to lambda
  parameters, loop variables, and test locals. But things like `addr` for `address` is not fine.
- Never add shorthand to `dictionary.dic` to get it past spellcheck.
- A word earns a `dictionary.dic` entry once it appears three times or more. Below that, silence the
  one or two places with `// eslint-disable-next-line spellcheck/spell-checker`, or reword the
  sentence around it. Count the warnings the linter actually raises, not the substring — `grep`
  counts every `cloudfront` inside `CloudFrontDistribution` too.
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
| `*.rule.ts`                      | one redaction rule, typed by `IRedactionRule`                                                           |
| `*.command.ts`                   | one octo-build CLI command                                                                              |
| `*.error.ts`                     | the error classes of one area                                                                           |
| `*.factory.ts`                   | container factories for third-party classes octo does not own, e.g. an SDK client                       |
| `index.ts`                       | re-exports, nothing else                                                                                |

- Schemas live in their own file, never beside the class that consumes them.
- Actions live under `models/<node>/actions/` or `overlays/<node>/actions/`.

## Classes

Prefer a class. Write a bare function only where a class cannot work — decorators, and type-level
helpers.

Categorize by role and keep the roles apart:

- **Models** declare intent. **Resources** declare infrastructure. **Anchors and overlays** join them.
- **Actions** are the only place a model diff becomes resources.
- **A module composes the graph offline, and only an action reaches the network.** A module runs in
  every mode, including once per `octo run-action` callback terraform makes mid-apply, so a call it
  makes is paid by `generate` — which touches no cloud at all. Nothing a module could learn from the
  cloud is worth that price: credentials that resolve are not permission to act, and the SDK chain a
  module would check is not the chain terraform applies with. An action that needs the cloud fails on
  its first call, before it has changed anything, and the deferral and recovery rules below are what
  make that safe.
- **A resource owns one thing, and never derives another resource.** Where one thing holds many of
  another — a repository holding images — the container is a model and each thing inside it is an
  overlay pointing at that model, with a module of its own. The overlay's module takes the
  container's model as an input, matched on its anchor, and finds the container's resources through
  it. One container module is then pointed at by many of these, and adding or dropping one leaves
  its siblings alone. Reach for an overlay before a new base model: adding to octo's default models
  is a much larger change than adding to a library.
- **A resource outside terraform still declares its place in the graph.** Terraform cannot order what
  it does not manage, so octo creates and deletes an external resource itself. Declare its parents
  and their dependency behaviors anyway: octo orders its own diffs by them, and a resource a
  dependent still points at cannot leave the graph. Where neither can know whether the world still
  points at it — an apply that stopped short — defer the deletion rather than guess.
- **Name another resource's output, never a copy of it.** A value a resource holds only because
  another resource produced it — an image URI, an ARN — renders as `terraform.getRef(parent, key)`.
  The literal is the same string and orders nothing: terraform builds its graph from references, so
  a copied value leaves two resources it believes are unrelated, free to be created in either order,
  and across folders leaves out the terragrunt dependency entirely. Only where the producer has no
  resource to point at is the literal all there is. The other exception is a reference that would
  close a cycle between two folders, which terragrunt cannot order and octo refuses to render: a
  queue's policy names the topic allowed to send to it by ARN, because the topic's own module
  already references the queue. Where a literal is used for either reason, the resource says so.
- **A resource's identity belongs in its resource id, and what is not identity is not a diff.** Two
  resources sharing an id are the same thing, so decide up front which inputs name the thing and put
  those in the id: changing one is then an add and a delete of two different resources, which needs
  no third kind of action. Inputs that only describe *how* the thing was made are not changes to it,
  and a resource whose subject cannot be edited in place — anything write-once — reports nothing for
  them. Do not make a diff react to a weak signal of change while ignoring a stronger one it cannot
  see: report on both or neither.
- **An external resource's diff and its terraform trigger hash answer the same question.**
  `octo_properties_hash` comes from `AResource.getExternalTriggerProperties()`, which defaults to
  every property. A resource whose `diffProperties` ignores a property overrides it to drop that
  property too, or terraform plans a replacement octo reports no change for.
- **An action does one verb.** An add action adds. Where the cloud makes one verb look like two —
  a registry that will not overwrite — that is the other action's work on its own resource, not a
  branch inside this one.
- **Services** hold runtime state and are resolved through `Container`. **Utilities** are stateless
  `static` methods.
- **A factory for a global service supplies its own region.** A client is cached per account and
  region, but the region a global service is reached at — `us-east-1` for CloudFront, for IAM — is a
  fact about that service rather than something a caller chooses. Such a factory overrides `create()`
  to pass the region itself, so callers name the account alone and no call site repeats a constant it
  does not own.
- **A resource registers the factories it needs, in its own `index.ts`.** The registration is a
  side-effect import, so it looks like something to hoist somewhere common — and the common places
  are all a layer above. An account module importing every SDK client some resource might one day
  need points the dependency the wrong way round. Keep it with the resource that resolves the client.
- One class per file. The exceptions are error subclasses of one area, and a service's factory.

## Functions

- Medium, not tiny. A function covers one *scope of work*, not one statement. Splitting to a single
  thing produces a swarm of functions that is harder to read than the code it replaced.
  `AwsSimpleSubnetModule.onInit` is the reference — about 90 lines, one job, readable top to bottom.
- Separate the work into blocks: a blank line between blocks, and a one-line `//` comment naming each.
- Extract a helper when a second caller exists, not to hit a line count. Two call sites in the same
  folder are not a second caller worth a `*.utility.ts` of its own: inline the work in both and let
  the third occurrence be what pulls it out.
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

- **A template holding an external resource is driven through the `octo` CLI.** `TestModuleContainer`
  runs a lifecycle in one process and an external resource's action does not: terraform shells back
  out to `octo run-action` mid-apply, and that second process finds the modules through the
  definition file and the prior state through the state provider the definition names. An in-memory
  state provider is invisible to it. Such a template therefore ships an `octo.yaml` naming a
  `LocalStateProvider`, and its e2e drives `OctoCliUtility`. The state left on disk is the other half
  of why: a run killed midway through creating something slow to destroy is one the next run can
  still tear down.

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

- What must never be committed is declared once, as a rule under
  `packages/octo-templates/src/utilities/redaction/rules`. Both enforcers read those rules: the jest
  snapshot serializer redacts on the way into a snapshot, and `repository-secrets.spec.ts` fails the
  build on any other tracked file. A new cloud is a new rule file, never a second copy of a pattern.
- Never commit a real AWS account number. Add a placeholder to its rule rather than widening the
  pattern.
- Never commit an AWS-assigned identifier captured from a run under `packages/` — a `vpc-…`,
  `subnet-…`, or a public address. Do not capture one in the first place: **a snapshot taken from a
  live run holds what octo decides and not what the provider returned.** A validate report goes
  through `ValidateReportUtility.summarize()`, which keeps the octo action per resource, the
  terraform addresses, and the names of the arguments that moved, and drops their values. Secrecy is
  the smaller half of the reason: an identifier AWS handed out on one run is new on the next, so a
  snapshot holding one churns on every run and buries the drift it exists to show — and no
  substitution closes that, because a list returned in a different order has no shape to match.
  `apps/octo-docs` keeps captured ids on purpose — see `docs/DOCUMENTATION-STANDARDS.md`, which owns
  that call.
- A test fixture that needs an account number uses `123456789012`. One that needs a resource id
  invents the hexadecimal rather than pasting a captured id, so aliasing has something to bite on.
  Terragrunt's own mock outputs read `000000000000` and are left as the tool wrote them, as are
  `…0123456789abcdef0` identifiers.
- Real account values reach a suite through a gitignored `.env`, never through a source. The tracked
  `.env.defaults` beside it carries a placeholder and documents the key.
- Generated terraform is committed and reviewed, so nothing in it may name the machine that produced
  it. A resource pointing at a file on disk emits `terraform.localPath(filePath)`, which renders the
  path relative to the project root against `var.OCTO_PROJECT_ROOT`; octo declares that variable in
  the folder's `variables.tf` and supplies it as `TF_VAR_OCTO_PROJECT_ROOT` on every terragrunt
  command. An absolute path written straight into `source` or `filemd5()` renders differently on
  every checkout and puts a developer's directory layout in the repository.
- Generated terraform is the one committed artifact that carries an account number by design, as the
  provider alias `aws._<accountId>-<regionId>`. `accountName` on a provider replaces the id with a
  name a repository can show, and is the fix where that matters; the default stays the id, so a
  generated `main.tf` holding one is expected rather than a leak. This is the only such exception —
  everywhere else the rules above apply.
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
- **Octo state is the authority for what a resource produced.** A response reaches terraform through
  octo state and nothing else. A file on disk is scratch: terragrunt runs terraform in a per-unit
  `.terragrunt-cache` copy, which is gitignored and belongs to one machine, so anything left there
  is gone on the next checkout. Where a response has to survive between the action that produced it
  and the commit that records it, record it in octo state at that moment rather than parking it in a
  file.
- **A record octo keeps outside the committed graph is reachable only by the id that filed it.**
  State is read by name, so a record filed under a resource id vanishes from view the moment intent
  stops naming that id, while the thing it recorded outlives it untracked. Anything recorded outside
  the committed graph is therefore enumerable — `IStateProvider.listStates(prefix)` — and reported
  where a user reads before acting, which is `validate`: named as adopted by the next commit when
  either graph still holds it, and as unreachable when neither does. Clearing the record is never
  the fix for the second case; it is the only evidence the thing exists.
- Do not build for a future caller. Write the second consumer before you generalize.
- Clean cuts over shims. Delete the old path; do not keep both behind a flag.

## Verification

- `tsc --noEmit` on every changed package, not only the one you edited.
- `pnpm run lint` must be clean — no errors, no warnings, no spelling errors.
- Run the affected suites and report the real numbers. If you did not run something, say so.
- Never claim a live or e2e run you did not do.
- `octo-templates` and `octo-aws-cdk` import `octo` from `dist` — rebuild before running their tests.
- A flag passed through `pnpm run` is written without npm's `--` separator. pnpm forwards the `--`
  rather than consuming it, and the arg parser behind it reads it as the end of options and drops
  the flag — which is how `octo-docs`'s `plugin:post-script` broke at the pnpm migration.

## Commits

Format is enforced by `.github/jobs/validate-pr-title.job.sh`:

```
<chore|major|minor|patch>(<docs|feat|fix|refactor|release|revert|test>): <package> | <sentence>.
```

- Lowercase sentence, ends in a period. `patch(fix): octo | stream terragrunt's output during an apply.`
- One concern per commit. A bug fix never rides along with a refactor.

## Docs

- A change that moves something a reader can see or type ships its doc change in the same commit.
  Decide which page with the map at the top of `docs/DOCUMENTATION-STANDARDS.md`: it asks one
  question, and names the page that owns each surface. Do not read the docs looking for work — a
  change that moves no surface needs no page, and the map says so in a sentence.
- A doc change split into a follow-up commit is a doc change that does not happen. The commit that
  renames the flag is the only one that knows the flag was renamed.
- Living docs record what is, not what was. Delete a section once its issue is fixed.
- Write the trade-offs into the doc before asking for a decision. Do not ask someone to choose
  between options they cannot weigh.
- Committing @docs requires explicit permissions. Do not commit anything in this folder automatically.
