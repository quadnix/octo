# Plan: Validate an octo-aws-cdk Resource

**Goal:** Find and report bugs — do not fix anything. File a GitHub issue per bug at the end.

---

## 0. Establish How the Resource Is Backed

Read the class declaration in `{name}.resource.ts` first. It decides which sections apply.

| Class extends                 | Backing                | Sections to run              |
|-------------------------------|------------------------|------------------------------|
| `ATerraformResource<S, T>`    | Terraform              | §1, §2, §3, §4, §6           |
| `AResource<S, T>` directly    | External — Octo's SDK  | §1, §2, §3, §5, §6           |

`TransactionService.generateTerraform()` makes this split: a resource that is an
`instanceof ATerraformResource` is rendered through `toHCL()`, and anything else is handed to
`addOctoTerraformExternalResource()`, which emits a `null_resource` + `data "external"` pair that
calls `octo run-action` at apply time and runs the resource's `IResourceAction`s.

Every resource in `packages/octo-aws-cdk/src/resources/` is currently Terraform-backed. §5 documents
the external branch the framework still supports, for when a resource has to be driven by an SDK
because no Terraform resource covers it.

---

## 1. Discover All Files

### 1a. Locate the resource directory

```
packages/octo-aws-cdk/src/resources/{name}/
```

### 1b. Read every file — do not skip any

| File                 | What to check                                            |
|----------------------|----------------------------------------------------------|
| `index.schema.ts`    | `@Validate` rules, property types, response types + defaults |
| `{name}.resource.ts` | Constructor guards, `diff()`, `diffProperties()`, `toHCL()` |
| `index.ts`           | Exports complete                                         |

`ls` the directory before reading. A Terraform-backed resource has no `actions/` directory — if one
is present, the resource is external, and §5 applies instead of §4.

---

## 2. Schema Checks (`index.schema.ts`)

### 2a. For every property field in `Schema<{...}>`, verify

- **String**: `minLength`? `maxLength` where AWS has a limit? `regex` where AWS restricts characters?
- **Number**: min/max value enforced?
- **Enum/union**: all allowed values covered and no extra values permitted?
- **Optional field that becomes required under a condition**: `@Validate` cannot express this — flag for §3a.
- **Array**: length bounds? Each element validated via `isSchema`?
- **Nested schema class** (`isSchema`): recursively apply the same checks to that sub-schema class.

Check the constraint against **both** the AWS service limit and the Terraform provider's argument
reference. The provider is sometimes stricter (or rejects a value AWS would accept), and the provider
is what actually runs.

### 2b. Response fields

The response schema is the resource's public output surface. Three separate checks:

1. **Declared ⟺ emitted.** Every field declared in the response schema must be written by
   `toHCL()`'s `output({...})` call, and every field written by `output({...})` must be declared. A
   declared-but-never-emitted field is silently `undefined` for every consumer.
2. **Consumed ⟹ declared.** Any field another resource reads via `terraform.getRef(resource, 'Field')`
   must be declared here. `getRef`'s key is typed against this schema, so a missing declaration is a
   compile error — but a field declared and never emitted is not, which is check 1's job.
3. **Every response field has a realistic default.** `Schema<T>(defaultValue)`'s second argument feeds
   terragrunt's `mock_outputs`:

   ```ts
   override response = Schema<{ AllocationId?: string; NatGatewayId?: string }>({
     AllocationId: 'eipalloc-0123456789abcdef0',
     NatGatewayId: 'nat-0123456789abcdef0',
   });
   ```

   `TerraformService` reads these via `getSchemaDefaults()` — deliberately the *declared defaults* and
   never the live response, so regenerating after a commit cannot inline real, possibly secret, applied
   values — and writes them into the dependency block's `mock_outputs`.

   A response key with no declared default does not fail; it falls back to a synthetic `mock-<output>`
   string. That is the problem: `mock-VpcId` is not a syntactically valid VPC id, so a plan against a
   not-yet-applied dependency can fail a provider-side format check and turn a clean run into spurious
   `octo validate` noise. **Every response field should declare a syntactically plausible default** —
   a real-shaped ARN, id, or DNS name. A missing one is a P2/P3; a default whose *shape* is wrong
   (empty string, obviously invalid ARN) is worse than none, because it looks deliberate.

### 2c. Common AWS string constraint reference

| Field                          | AWS rule                                    |
|--------------------------------|---------------------------------------------|
| Resource names (most services) | 1–255 chars, service-specific character set |
| ARNs                           | non-empty string                            |
| Tag keys                       | 1–128 chars                                 |
| Tag values                     | 0–256 chars                                 |

> Always verify the specific AWS docs for the service being validated — limits vary.

---

## 3. Resource Class Checks (`{name}.resource.ts`)

### 3a. Constructor — cross-property validations

`@Validate` cannot express cross-field rules. For every conditional requirement:

- If field A equals X, is field B required? Verify there is an explicit check.
- If collection C is non-empty, is field D required? Verify there is an explicit check.
- Structural rules within arrays (e.g. key type counts, shared key constraints, projection constraints).

Check every `if` condition for operator-precedence traps, and confirm each throws `ResourceError` with
the subject resource as the second argument.

### 3b. Array cross-reference checks

- Forward: every name referenced in sub-schemas must exist in the parent definition list.
- Backward: the definition list must have no entries not referenced anywhere.
  - When comparing lengths, use `new Set(referencedNames).size` — not `.length` — to avoid false
    positives from legitimately shared names.

### 3c. Uniqueness checks

Any collection where AWS requires unique names/identifiers should have a `Set`-size comparison guard.

`DynamoDB`'s constructor is the reference for §3a–§3c: fourteen guards covering conditional
requirements, key-shape structure, cross-references between `AttributeDefinitions` and every key
schema, and index-name uniqueness across LSIs and GSIs.

### 3d. `diffProperties()` — what Terraform can change in place

This is the check that changed most in the Terraform migration. The question is no longer "does every
mutable property have an update action"; it is **"does Octo's mutability model match the provider's"**.

A property is one of two things:

| Provider behaviour                  | What `diffProperties()` must do                                    |
|-------------------------------------|---------------------------------------------------------------------|
| Argument is updatable in place      | Exclude it from `DiffUtility.isObjectDeepEquals`'s exclusion list check, so it falls through to an update diff |
| Argument is **ForceNew**            | Emit `new Diff(this, DiffAction.REPLACE, 'resourceId', this.getContext(), '<reason>')` |

The canonical shape, from `NatGateway`:

```ts
override async diffProperties(previous: NatGateway): Promise<Diff[]> {
  if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties)) {
    return [
      new Diff(
        this,
        DiffAction.REPLACE,
        'resourceId',
        this.getContext(),
        'connectivity_type is force-new on aws_nat_gateway; a change recreates it',
      ),
    ];
  }
  return [];
}
```

`DynamoDB` shows the mixed form: the exclusion list names the five arguments `aws_dynamodb_table`
can change in place, and anything outside that list falls through to a REPLACE.

**How to audit:**

1. Open the Terraform provider docs for every `aws_*` type the resource's `toHCL()` emits.
2. List every argument the provider marks *"Forces new resource"*.
3. Compare that list against what `diffProperties()` treats as immutable.
   - Provider says ForceNew, Octo emits an update ⇒ Octo's plan and Terraform's plan disagree. Terraform
     will replace the resource while Octo reports an in-place update, and `octo validate` reports the
     replacement as unexplained drift. **P1.**
   - Provider says updatable, Octo emits REPLACE ⇒ needless destroy/recreate of live infrastructure. **P1.**
4. Check the REPLACE reason string names the actual force-new argument and the actual TF type. It is
   read by humans in the validate report; a stale reason after a schema change is a **P3**.
5. Any additional custom immutability guard (e.g. `DynamoDB` throwing on an edit to an existing GSI)
   must be justified by a real provider or AWS constraint, not by convenience. If the provider supports
   the change, the guard is an **enhancement request**, not a bug.

### 3e. Custom `diff()` — consolidation and throw rules

Only some resources override `diff()`. When one does, verify:

- Diffs it splices out of `super.diff()`'s result are genuinely replaced by the consolidated diff it
  pushes — nothing is dropped on the floor.
- The consolidated diff's value type carries every field a consumer needs to act on.
- Any `ResourceError` thrown from `diff()` (e.g. `DynamoDB`'s "cannot add more than 1 GSI at a time")
  reflects a real AWS or provider limitation. Verify it against the service docs; AWS quotas change,
  and a guard that was correct two years ago may now be needlessly strict — that is an **enhancement
  request**.

---

## 4. `toHCL()` Audit — Terraform-Backed Resources

`toHCL()` is where the resource meets the provider, so it is where most bugs now live. Read it against
the Terraform provider documentation for every `aws_*` type it emits, open side by side.

Reference implementations: `NatGateway` (multiple TF resources under one octo resource, explicit
parents, refs, outputs, tags), `Alb` (ref arrays, spread parents), `DynamoDB` (conditional arguments,
nested blocks).

### 4a. Registration and provider

```ts
const octoResource = terraform.addOctoTerraformResource(this as ResourceClass, {
  explicitParents: [...],
  provider: { accountId: this.properties.awsAccountId, regionId: this.properties.awsRegionId },
});
```

- `addOctoTerraformResource` is called exactly once per octo resource.
- `provider` is passed whenever the resource is account- or region-scoped. Omitting it silently pins the
  resource to the module's default provider — wrong account or wrong region at apply time. **P0/P1.**
- The `accountId`/`regionId` come from `properties`, not from a hardcoded value.

### 4b. Parent wiring — `getRef` vs `explicitParents`

Terraform infers dependency order from attribute references. A parent Octo declares but never
references produces no edge, so Terraform is free to create the child first.

**The rule: every parent must be reachable either through a `getRef` in the emitted spec, or through
`explicitParents`. Never neither, never both.**

`NatGateway` is the model — three parents, split:

```ts
const natGatewayOctoResource = terraform.addOctoTerraformResource(this as NatGateway, {
  explicitParents: [this.parents[0], this.parents[1]], // vpc, igw: no attribute references them
  provider: { ... },
});
// ...
subnet_id: terraform.getRef(this.parents[2], 'SubnetId'),  // subnet: referenced, so not listed above
```

Audit each parent in the `declare parents: [...]` tuple:

- Referenced by a `getRef` in some emitted argument ⇒ must **not** be in `explicitParents` (redundant, and
  it hides which arguments actually carry the dependency).
- Not referenced by any argument ⇒ must be in `explicitParents`. A missing entry is a race at apply
  time and an ordering bug at destroy time. **P0.**
- Index arithmetic on `this.parents` (`.slice(2)`, `this.parents[1]`) matches the tuple's declared order.
  A parent inserted into the tuple without updating the indices silently rewires the resource. **P0.**

### 4c. Argument fidelity

For every argument in every `addTerraformResource(type, name, spec)` call:

- The argument name exists on that provider type and is spelled exactly as the provider spells it.
  Terraform rejects unknown arguments, so a typo is **P0** — but only at apply, which is why the module
  test's HCL snapshot matters.
- Every argument the provider marks **Required** is present, on every code path.
- The value's type matches the provider's (`string`, `bool`, `number`, list, set). Watch for numeric
  strings passed where the provider wants a number.
- Sentinel translation is applied where Octo's model and the provider disagree. `AwsSimpleSubnetModule`'s
  spec pins one of these: the all-ports sentinel `-1` must render as `0`.
- The TF resource `name` is derived from `this.resourceId` (optionally suffixed, e.g.
  `` `${this.resourceId}_eip` ``), so addresses stay stable and match `getRef`'s expectations.

### 4d. Block versus attribute

The single most common `toHCL()` trap, called out in `TerraformModuleScope`'s own docs:

- Provider schema says **block** (`key { ... }`, no `=`) ⇒ pass a plain JS object (or array of objects
  for a repeated block) in the spec.
- Provider schema says **map/object attribute** (`key = { ... }`) ⇒ wrap with `terraform.mapAttr(value)`.

Getting this backwards produces HCL the provider rejects. Check every nested value in the spec against
the provider docs — `DynamoDB` emits `attribute`, `global_secondary_index`, and
`local_secondary_index` as repeated blocks, and `on_demand_throughput` / `ttl` as single blocks.

Also verify the helpers are used where required: `terraform.jsonencode(...)` for IAM policy documents
and other JSON-typed arguments, `terraform.raw(...)` for a verbatim expression (never string-concatenate
an address into a quoted string), and `terraform.type(...)` inside variable declarations.

### 4e. Conditional arguments

Arguments emitted inside an `if` are where feature-enable/disable bugs live:

- An argument that enables a feature is emitted only when the feature is on, and **absent** — not `false`,
  not `""`, not `[]` — when off, unless the provider documents the explicit-off form.
- Every branch of a discriminated union is handled. `DynamoDB` branches on `billingMode.type` and emits
  `read_capacity`/`write_capacity` for `PROVISIONED` versus `on_demand_throughput`/`warm_throughput` for
  the pay-per-request path; check no branch falls through emitting the wrong pair.
- A non-null assertion (`!`) inside a branch is guarded by a constructor check from §3a. If the
  constructor does not guarantee it, the `!` is a crash waiting for a valid input. **P0.**
- Optional properties that are absent stay absent from the spec.

### 4f. Outputs

```ts
octoResource.output({
  AllocationId: terraform.raw(`${eipTFResource.address}.id`),
  NatGatewayId: terraform.raw(`${natGatewayTFResource.address}.id`),
});
```

- The key set matches the response schema exactly (§2b, check 1).
- Each value uses `.address` of the TF resource that actually owns that attribute — when one octo
  resource emits several TF resources, confirm each output points at the right one.
- The attribute name on the right of `.address` (`.id`, `.arn`, `.dns_name`) exists on that provider
  type's attribute reference.

### 4g. Tags

```ts
if (Object.keys(this.tags).length > 0) {
  tfResource.attribute('tags', this.tags);
}
```

- Applied to **every** taggable TF resource the method emits, not just the primary one. `NatGateway`
  tags both `aws_eip` and `aws_nat_gateway`; missing one leaves untagged infrastructure. **P1.**
- Not applied to a type the provider does not support tags on — that is a **P0** at apply.
- Guarded by the emptiness check, so an untagged resource does not render an empty `tags = {}`.

### 4h. Cross-check against §3d

Close the loop: the arguments `toHCL()` emits are exactly the surface `diffProperties()` reasons about.
Every property that reaches an emitted argument must be classified in §3d, and any property that
`diffProperties()` mentions but `toHCL()` never emits is dead weight — either an unimplemented feature
or a leftover. Report it as **P3** unless it is load-bearing elsewhere.

---

## 5. Action Audit — External (SDK-Backed) Resources

**Run this section only when the resource extends `AResource` directly.** For an
`ATerraformResource`, actions are not merely absent — registering one throws, and this whole section
is inapplicable.

An external resource is dispatched to `addOctoTerraformExternalResource()`, which generates a
`null_resource` + `data "external"` pair invoking `octo run-action` at apply time. That command
resolves the diff to an `IResourceAction` and runs it. The action interface is now minimal:

```ts
interface IResourceAction<T extends UnknownResource> {
  actionTimeoutInMs?: number;                                  // default 90000
  filter(diff: Diff): boolean;
  handle(diff: Diff): Promise<T['response']> | Promise<void>;
}
```

`mock()` and the resource-capture mechanism no longer exist — do not look for them, and flag them as
dead code if you find them. `handle()` returns the response rather than mutating the resource.

### 5a. `diffInverse()` — clone granularity

`ATerraformResource` implements `diffInverse()` once for every Terraform resource. An external
resource inherits `AResource`'s, and may override it — so granularity is back in play here.

After each action completes, Octo calls `diffInverse()` on the **actual** resource to apply only the
change that just succeeded. This is how Octo keeps local actual state in sync without re-querying AWS.
Getting it wrong means actual records changes as done when they have not run, causing missed diffs on
the next run.

Three helpers are available (all deep-clone via `JSON.parse(JSON.stringify(...))`):

| Helper                                | What it copies                                   |
|---------------------------------------|--------------------------------------------------|
| `cloneResourceInPlace(source, deRef)` | Everything — properties, response, tags, parents |
| `clonePropertiesInPlace(source)`      | Only `properties`                                |
| `cloneResponseInPlace(source)`        | Only `response`                                  |

**The core rule: clone granularity must match action granularity.**

| Situation                                                                     | Correct `diffInverse` approach                                                                                                             |
|-------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------|
| Exactly **one** update action covers **all** mutable properties               | `cloneResourceInPlace` or `clonePropertiesInPlace` — safe, because completing that one action means all properties are done                    |
| **Multiple** update actions, each covering a **different subset**              | Surgical copy: assign only the fields *this* action changed. `clonePropertiesInPlace` here is a **bug** — it commits properties belonging to sibling actions that may not have run |
| Custom array diff (add/delete a single item)                                  | Push/splice only the specific item, mirroring exactly what the action did in AWS                                                              |

**How to audit:**

1. From `diffProperties()`, list every mutable property.
2. Map each to the update action that handles it (from `diff.value.key` or a custom field filter).
3. Read `diffInverse()` — or note its absence, meaning the base class runs.
4. For every update-diff branch, ask: *does this branch copy any property owned by a different action?*
   If yes, it prematurely commits those properties to actual. **P1.**
5. Confirm `cloneResponseInPlace` is called wherever the action updates `response` fields. A missing
   call means a new response (e.g. a new ARN after a REPLACE) never reaches actual.

### 5b. Filter correctness

Every `filter()` must precisely target its diff:

| Filter field                    | When used               | What to verify                                                                                               |
|---------------------------------|-------------------------|---------------------------------------------------------------------------------------------------------------|
| `diff.action`                   | All                     | `DiffAction.ADD / DELETE / UPDATE / REPLACE / VALIDATE` matches intent                                        |
| `diff.node instanceof X`        | All                     | Correct resource class                                                                                        |
| `hasNodeName(diff.node, '...')` | All                     | Matches the second argument of the `@Resource` decorator                                                      |
| `diff.field === 'resourceId'`   | add / delete / validate | Standard for lifecycle actions                                                                                |
| `diff.field === 'properties'`   | property updates        | Used with `diff.value.key`                                                                                    |
| `diff.value.key === '...'`      | property updates        | Must exactly match the **current** schema property name (case-sensitive; renames break this silently)         |
| `diff.field === 'parent'`       | parent updates          | Used with `diff.value === '<collection-name>'` or `hasNodeName(diff.value, '<parent-name>')`                   |

Every action class is registered with `@Action(ResourceClass)` and constructed by a `@Factory`.

### 5c. Per-action-type checks

**Add action.** All required SDK input fields present and mapped from `properties`; conditional fields
guarded; absent optional properties passed as `undefined`, not `{}` or `[]`; a wait/poll after async
creation (`waitUntilXExists` or a custom loop); the returned object populates every field declared in
the response schema, with no missing or extra keys.

**Delete action.** Uses the correct AWS identifier — prefer `response.{Id|Arn}` over
`properties.{name}`, since names drift. Pre-deletion steps (detach, disable protection) present and
correctly ordered. A wait/poll if deletion is async.

**Property update actions.** The most bug-prone:

- *Filter:* `diff.value.key` matches the current schema property name exactly.
- *Unconditional SDK fields:* the most common P0. For each field in the SDK command, ask whether sending
  it could error if the resource was not configured that way at creation. Fields that enable or disable
  a feature must be sent conditionally. If a feature can only be disabled by referencing prior state
  (e.g. a TTL attribute name), verify the action fetches that state first.
- *Missing fields:* compare every mutable property from `diffProperties()` against what the SDK command
  actually sends. Any gap is a bug.
- *Multiple triggers:* if one change fires the action more than once, the second call must be idempotent.

**Parent update actions.** Filter handles every relevant `DiffAction` when the AWS API needs separate
calls per direction; `handle()` branches on `diff.action`; parent identifiers read from
`diff.value.response.{Id}`, not from `properties`; a REPLACE that must delete-then-add does the delete
first.

**Tags actions.** The ARN passed to the tagging utility comes from `response.{ArnField}`, not
`properties`. A resource with multiple ARNs (e.g. a NAT gateway with a separate EIP) needs one tags
action per ARN, each registered.

**Validate actions.** `ResourceDataRepository.diffValidate()` still emits one `DiffAction.VALIDATE`
diff per surviving actual resource, so an external resource can still carry a validate action. It must
use a `Describe*` command, never a mutating one; throw `TransactionError`, not `ResourceError`; and not
silently pass when `Describe*` returns nothing. Build the coverage checklist before auditing —
`property | immutable? | checked in validate?` — comparing every response identity field, every
immutable property in full (a length-only check on an array is a bug; compare elements), and every
mutable property with observable AWS state. Treat AWS fields omitted at their default value as the
default, not as a mismatch.

> Terraform-backed resources need none of this: `octo validate` runs `terraform plan` per module and
> reports drift as a `ValidateReport`. Do not file a "missing validate action" bug against an
> `ATerraformResource`.

### 5d. Registration completeness

Every action file on disk is imported and registered in `index.ts`; the resource class and schema are
exported; no orphan action files.

---

## 6. Reporting Bugs

### Severity classification

| Severity | Meaning                                                                       |
|----------|--------------------------------------------------------------------------------|
| **P0**   | `terraform apply` (or the SDK call) fails; the resource cannot be created/updated/deleted |
| **P1**   | Apply succeeds but the resource is silently misconfigured, or Octo's plan disagrees with Terraform's |
| **P2**   | Valid input rejected by an overly strict validation                            |
| **P3**   | Edge case gap; unlikely to hit in normal use                                   |

Severity is communicated via GitHub labels `P0`, `P1`, `P2`, `P3` — **not** in the issue title or body.

### Bug vs. enhancement

- If a property's allowed values are intentionally restricted by the current implementation (not by AWS
  or by the provider), that is an **enhancement request**. Use `--label "enhancement"` instead of
  `--label "bug"`.
- If the AWS API or the Terraform provider imposes a stricter constraint than the schema, that is a bug.

### False-positive patterns to avoid

**Provider default already matches.** An argument Octo never emits is not automatically a bug — the
provider may default it to exactly the value Octo wants. Check the provider's documented default before
filing a "missing argument" issue.

**`explicitParents` omission when a ref exists.** A parent absent from `explicitParents` is correct when
some emitted argument references it through `getRef`. Trace the spec before filing.

**Optional response fields used without a null guard.** Response fields are typed optional because they
are unpopulated before the resource is applied. Only report this when a field is first set by an update
action, a second update action reads it, and there is no guaranteed run order between the two — all
three conditions, framed as a run-order bug.

**Empty tags handling on a non-taggable type.** Some AWS types do not support tags at all (e.g. EFS
mount targets). Verify in the provider docs before flagging omitted tags.

### GitHub issue — one per bug

```bash
gh issue create \
  --repo quadnix/octo \
  --title "<ResourceName>: <short description>" \
  --label "bug" \
  --label "octo-aws-cdk" \
  --label "P<n>" \
  --body "$(cat <<'EOF'
## Resource
`packages/octo-aws-cdk/src/resources/<name>/`

## File
`<relative path>`, line <N>

## Current code
\`\`\`typescript
<paste offending snippet>
\`\`\`

## Problem
<one or two sentences: what fails and why>

## Expected fix
<one or two sentences: what the correct behaviour should be>
EOF
)"
```

For enhancement requests, replace `--label "bug"` with `--label "enhancement"` and change
`## Expected fix` to `## Expected change`.

### Checklist before filing

- [ ] §0 done — the resource's backing established from its base class, and the right sections run.
- [ ] `ls` on the resource directory — no file skipped.
- [ ] Every `@Validate` rule verified against **both** the AWS docs and the Terraform provider docs.
- [ ] Every response field: declared ⟺ emitted by `output()`, and carries a realistic default for `mock_outputs`.
- [ ] Every constructor `if` condition checked for operator-precedence traps.
- [ ] Provider's ForceNew argument list compared against `diffProperties()`'s immutability model.
- [ ] Every `toHCL()` argument name and type checked against the provider's argument reference.
- [ ] Every nested value checked for block-vs-attribute (`mapAttr`) correctness.
- [ ] Every parent traced to either a `getRef` or an `explicitParents` entry — exactly one of the two.
- [ ] Tags applied to every taggable TF resource the method emits.
- [ ] External resources only: `diffInverse()` granularity audited, every `diff.value.key` checked, every action registered.
- [ ] One issue per bug — no batching of unrelated bugs.
