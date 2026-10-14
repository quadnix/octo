# Coding standards

How code is written here. `ARCHITECTURE.md` holds what exists, `README.md` the commands,
`OPEN-ITEMS.md` what is broken or unbuilt.

Where the code and this file disagree, the code wins — fix the file. A rule belongs here only if it
changes what someone writes and is not already enforced by lint, prettier, the compiler, or a test.

---

## Naming

Full US English words. `address`, not `addr`. Single letters only in a lambda, a loop, or a test
local.

- `A` prefixes an abstract class, `I` an interface, `Schema` a schema class.
- **`dictionary.dic` is for names we do not control** — a package, an AWS id segment, a Terraform
  attribute — added at first sighting, **and for our own words once they recur three times.** Below
  that, silence the line with `// eslint-disable-next-line spellcheck/spell-checker`. Never add a
  shorthand to get it past spellcheck. A file that is not prose turns the rule off in its project's
  `eslint.config.js`.
- **"Run" means one lock**, from the `generate` before it to its release. One `octo` process is a
  **command**. **Cycle** means a dependency loop and nothing else. The files a command records are
  the **journal**.
- **Do not rename something that works.**

---

## Files

One concept per folder; the suffix carries the meaning. One class per file, except an area's errors
and a service's factory.

| Suffix                                               | Holds                                                                    |
|------------------------------------------------------|--------------------------------------------------------------------------|
| `*.model.ts`, `*.overlay.ts`, `*.anchor.ts`          | one node class                                                           |
| `*.resource.ts`, `*.module.ts`                       | one resource / module class                                              |
| `*.schema.ts`                                        | schema classes only, never beside the class that consumes them           |
| `<verb>-<node>.<model\|overlay\|resource>.action.ts` | one action, under `models/<node>/actions/` or `overlays/<node>/actions/` |
| `*.service.ts`                                       | one container-registered service plus its `*ServiceFactory`              |
| `*.factory.ts`                                       | container factories for third-party classes, such as an SDK client       |
| `*.utility.ts`                                       | one class of `static` methods, holding no state                          |
| `*.error.ts`                                         | the error classes of one area                                            |
| `index.ts`                                           | re-exports, nothing else                                                 |

**Prefer a class.** A bare function only where a class cannot work: decorators and type helpers.

---

## Models, anchors and overlays

- **An anchor reports its model.** Read every property off the model, even one that never varies —
  `subnetName: subnet.subnetName`, never `'default'`. A marker telling two anchor schemas apart
  (`serverless: true`) is the only exception.
- **An overlay's anchors are typed to the anchors it takes**: each position names its anchor or
  `MatchingAnchor<Schema>`, never `AAnchor<BaseAnchorSchema, any>`.
- **An overlay's id is unique across the app.** Overlays get no scope, so build the id from keys that
  differ wherever the overlay can repeat — a regional name carries its region.
- **Two modules implementing the same model shape their inputs and overlays alike.** Compare with
  the sibling before adding a field.
- **A module reaches another family only through anchors** (lint forbids the imports). To touch the
  other module's resources, join its model's anchor with an overlay of your own. Two families
  sharing resource logic each keep their copy.
- **A module composes offline. Only an action reaches the network.** A module runs in every
  command, `generate` and every `run-action` callback included.
- **Do not ask the user for what octo knows.** Derive an input that repeats a known fact, drop an
  input where one value is always safe, and check a limit one module imposes on another where they
  meet.

---

## Resources

**A resource owns one thing, and never derives another.** Where one thing holds many — a repository
holding images — the container is a model and each thing inside it an overlay with a module of its
own. Prefer an overlay to a new base model.

### Naming a resource

- **`localResourceId` is a kind prefix, the creating node's key, then whatever the action fans out
  over that the graph does not show** (a region, an account). Add nothing the scope already says:
  `alb-<albName>`, not `alb-<regionId>-<albName>`. See "Resource scope" in `packages/octo/README.md`.
- **What names the thing goes in the id; what does not is not a diff.** Changing an identity input is
  an add and a delete. A write-once resource reports nothing for inputs that only describe how it was
  made. Never react to a weak signal of change while ignoring a stronger one.
- **Every terraform block a resource emits is named `this.resourceId` or `${this.resourceId}_<suffix>`**
  — octo moves state only for blocks named that way.
- **Declare every name the provider keeps unique in `@Resource({ uniqueProperties })`**, with
  `within` set to the provider's domain for it, taken from the provider's documentation.
- **Declare `destroyLosesData` on a resource holding data octo cannot put back** — rows, objects,
  images. Not on content octo rewrites every apply, nor on a loss that breaks loudly.

### Parents

**A resource is a parent only if the provider needs it first.** Answer from the provider's API
reference or a live call, never from memory:

1. Does the call carry a value the provider assigns at creation (a `vpc-…` id, a function URL)? Read
   it with `terraform.getRef(parent, key)`; it is a parent.
2. Does the provider reject the call while the other is missing (a bucket policy naming a missing
   role)? It is a parent — `getRef` where a value is used, `explicitParents` where none is.

A parent is never a literal. Two noes mean it is not a parent: build what you need from names
somebody chose, through a method on the resource that reads them (`IamRole.addS3BucketPolicy`), so
the user names the model, never the ARN. This is what keeps grants acyclic.

- **A parent may also be taken only to wait** where the result would otherwise be wrong. A parent
  must never close a cycle; where it would, settle for something weaker and say so in the resource.
- **A parent found after construction is added by a method on the child** that records why
  (`EcsService.addLoadBalancer`). An action never calls `addChild` for a resource. `declare parents`
  lists every kind; the constructor's `parents` lists only those passed at construction.
- **Reach another module's resource through the node that owns it**, with
  `searchBoundaryMembers: false`. A boundary search is acceptable only when it filters on a
  `uniqueProperties` key.

### Behaviors

`addChild` already orders a child born or dying with its parent. Add a behavior only for **a child
that survives while its parent comes or goes**:

1. List the diffs each side really emits, from its `diff()` and `diffProperties()`.
2. Each child UPDATE and REPLACE waits for the parent's ADD and REPLACE.
3. The parent's DELETE waits for each child UPDATE and REPLACE.

Never name a pair that cannot occur, and never the reverse of an existing wait. Each behavior gets a
`// Before <action> <resource> must <action> <parent>.` comment and a `hasMatchingBehavior`
assertion. `LambdaFunction` is the worked example.

### External resources

- **Declare its parents and behaviors anyway.** Octo orders it; terraform cannot. Where nobody can
  know whether something still points at it, defer the deletion rather than guess.
- **Its diff and its trigger hash agree.** A `diffProperties` that ignores a property means
  `getExternalTriggerProperties()` drops it too.
- **An action does one verb.** Where the cloud makes one look like two, the other half is another
  action's work.
- **Octo state is the authority for a response.** Record it in state when the action produces it;
  never park it in a file — `.terragrunt-cache` belongs to one machine.
- **A record kept outside the committed graph is enumerable** (`IStateProvider.listStates`) and
  reported by `validate`. Never clear one to hide it; it is the only evidence the thing exists.

---

## Services, utilities and factories

- **Services hold state and resolve through `Container`. Utilities are stateless `static` methods.**
- **An exported utility is public whole**, every method documented; never part `@internal`. Export
  one only when a module author would find it hard to write. Generic helpers go into `octo`.
- **A factory for a global service passes its own region** (`us-east-1` for CloudFront, IAM).
- **A resource registers the factories it needs, in its own `index.ts`.**

---

## Functions

- **A function carries one scope of work, and medium is fine.** `AwsSimpleSubnetModule.onInit` is
  the reference. Never split to shorten.
- Separate blocks with a blank line and a one-line `//` comment naming each.
- **Extract on the third occurrence**, not to hit a line count.
- Guard clauses first, then the work, then the return.

---

## Comments and JSDoc

- **Say what the code is**, never how it got there or why it was chosen. No "previously", "no
  longer", "used to".
- **A docblock is one or two lines**, longer only for a contract a caller cannot infer: a precedence
  rule, an ordering, all-or-nothing behavior. Never restate the line below.
- `packages/` JSDoc builds the API site: `@group <Area>/<Name>` on every exported class,
  `@internal` on what users never call, `@example` on what a user constructs. Write what an item is
  for, not how octo achieves it.
- **`{@link X}` resolves only within a package.** Across packages, link the site:
  `[ModuleError](/api/octo/class/ModuleError)`.

---

## Types and exports

- **A closed set is a literal union**, on parameters as well as schemas — never `string`.
- **Derive before declaring.** No new type that `Parameters`, `ReturnType` or an existing export
  already gives.
- **Export only what a consumer cannot derive.** Every export is a compatibility commitment.
- **`packages/octo` holds no presentation.** It emits what it did; a label change ships in one
  package, never in octo.

---

## Errors

- One class per failure kind, in the area's `*.error.ts`, extending the area's base error.
- Carry the subject as a readonly field; call `Object.setPrototypeOf(this, X.prototype)` last.
- Messages are short, imperative, and end in `!` — `'Subnet already exists!'`.
- **Refuse input only where accepting it breaks something.** Nonsensical but harmless input is the
  author's business.

---

## Tests

Tests catch breakage between releases; they do not chase coverage.

| File            | Kind        | Runs against                                                   |
|-----------------|-------------|----------------------------------------------------------------|
| `*.spec.ts`     | unit        | nothing                                                        |
| `*.ispec.ts`    | integration | real terraform, locally or against LocalStack                  |
| `*.e2e-spec.ts` | e2e         | real AWS — `octo-aws-cdk` plans only, `octo-templates` applies |

- Structure: `describe('<Subject> UT')`, one `describe('methodName()')` per method in class order,
  every `it` starting with `should`, errors before happy paths.
- **Build fixtures through `TestModuleContainer`**, never by hand.
- **A framework guarantee is tested once, in `octo`**, through its public entry point. A library
  does not re-test it per resource.
- **An `octo-aws-cdk` e2e asserts inline, never with a snapshot.** It has no redaction serializer.
- **A template with an external resource is driven through the CLI** (`OctoCliUtility`) with a
  `LocalStateProvider`: `run-action` is a second process and cannot see in-memory state.

---

## Secrets

The repository is public and e2e suites run against a live account.

- **A snapshot of a live run holds what octo decides, not what the provider returned.** Summarize a
  validate report through `ValidateReportUtility.summarize()`. A provider-assigned id churns every
  run.
- What must never be committed is a rule under `octo-templates/src/utilities/redaction/rules`;
  `repository-secrets.spec.ts` enforces it. A new cloud is a new rule file.
- Fixtures use account `123456789012` and invented hexadecimal ids. Real values come from a
  gitignored `.env`; the tracked `.env.defaults` documents the key.
- **A resource pointing at a file emits `terraform.localPath(filePath)`**, never an absolute path:
  generated terraform is committed.

---

## Changing code

- **Search first.** Most "missing" data is already computed and not returned.
- **Do not duplicate data that already flows**, and do not invent state — every state write is a diff on every run.
- **Do not build for a future caller.**
- **Clean cuts over shims.** Delete the old path.

---

## Commits

`<chore|major|minor|patch>(<docs|feat|fix|refactor|release|revert|test>): <package> | <sentence>.` —
`.github/jobs/validate-pr-title.job.sh` holds which category may carry which bump.

- Never commit by `major` or `minor` unless told to do so.
- The subject is lowercase, ends in a period, and stays under 80 characters. Everything else goes in
  the body, one bullet per part.
- One concern per commit. A fix never rides with a refactor.
- **A change ships its doc change in the same commit** — `apps/octo-docs` per
  `DOCUMENTATION-STANDARDS.md`, and any file in `AGENTS.md`'s map that it makes untrue.
