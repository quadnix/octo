# Plan: Validate an octo-aws-cdk Resource

**Goal:** Find and report bugs — do not fix anything. File a GitHub issue per bug at the end.

---

## 1. Discover All Files

### 1a. Locate the resource directory

```
packages/octo-aws-cdk/src/resources/{name}/
```

### 1b. Read every file in the directory — do not skip any

| File                           | What to check                                          |
|--------------------------------|--------------------------------------------------------|
| `index.schema.ts`              | `@Validate` rules, property types, response types      |
| `{name}.resource.ts`           | Constructor validations, `diffProperties()`            |
| `index.ts`                     | All actions registered, exports complete               |
| `actions/*.resource.action.ts` | Every action file — list them first with `ls actions/` |

List `actions/` explicitly before reading so no file is missed.

---

## 2. Schema Checks (`index.schema.ts`)

### 2a. For every property field in `Schema<{...}>`, verify

- **String**: `minLength`? `maxLength` where AWS has a limit? `regex` where AWS restricts characters?
- **Number**: min/max value enforced?
- **Enum/union**: all allowed values covered and no extra values permitted?
- **Optional field that becomes required under a condition**: `@Validate` cannot express this — flag for §3.
- **Array**: length bounds? Each element validated via `isSchema`?
- **Nested schema class** (`isSchema`): recursively apply the same checks to that sub-schema class.

### 2b. Response fields

- All fields populated by the add action are declared in the response schema.
- No field used in any action (e.g., an ARN used in update/delete) is missing from the response schema.

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
- Structural rules within arrays (e.g., key type counts, shared key constraints, projection constraints).

### 3b. Array cross-reference checks

- Forward: every name referenced in sub-schemas must exist in the parent definition list.
- Backward: definition list must have no entries not referenced anywhere.
  - When checking lengths, use `new Set(referencedNames).size` — not `.length` — to avoid false positives from
    legitimately shared names.

### 3c. Uniqueness checks

- Any collection where AWS requires unique names/identifiers should have a `Set`-size comparison guard.

### 3d. `diffInverse()` — clone granularity

After each action completes, Octo calls `diffInverse()` on the **actual** resource to apply only the
change that just succeeded. This is how Octo keeps the local actual state in sync with reality without
re-querying AWS. Getting this wrong means actual can record changes as done when they haven't run yet,
causing missed diffs on the next run.

Three helpers are available (all deep-clone via `JSON.parse(JSON.stringify(...))`):

| Helper                                | What it copies                                   |
|---------------------------------------|--------------------------------------------------|
| `cloneResourceInPlace(source, deRef)` | Everything — properties, response, tags, parents |
| `clonePropertiesInPlace(source)`      | Only `properties`                                |
| `cloneResponseInPlace(source)`        | Only `response`                                  |

**The core rule: clone granularity must match the action granularity.**

| Situation                                                                               | Correct `diffInverse` approach                                                                                                                                                                        |
|-----------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Exactly **one** update action covers **all** mutable properties                         | `cloneResourceInPlace` or `clonePropertiesInPlace` — safe because completing that one action means all properties are done                                                                            |
| **Multiple** update actions, each covering a **different subset** of mutable properties | Surgical copy: assign only the fields that *this* action changed. Using `clonePropertiesInPlace` here is a **bug** — it would write properties belonging to sibling actions that may not have run yet |
| Custom array diff (add/delete a single item)                                            | Push/splice only the specific item to mirror exactly what the action did in AWS                                                                                                                       |

**How to audit:**

1. From `diffProperties()`'s exclusion list, list every mutable property.
2. Map each mutable property to the update action that handles it (from `diff.value.key` or custom field filter).
3. Check `diffInverse()` in the resource class (or the lack of an override, meaning the base class runs).
4. For every update-diff branch in `diffInverse()`, ask: *does this branch copy any property that belongs to a different
   action?*
   - If yes — it will prematurely commit those properties to actual. That is a **P1 bug**.
5. Confirm `cloneResponseInPlace` is called wherever the action updates `response` fields. A missing call
   means the new response (e.g., a new ARN after a REPLACE) is never written to actual.

**Known-good examples (for reference):**

- `DynamoDB.diffInverse` — calls `cloneResourceInPlace` for its single consolidated update diff.
  Safe because only one update action exists.
- `IamRole.diffInverse` — pushes/splices the single policy that changed.
  Safe because each diff represents exactly one policy operation.
- `AlbListener.diffInverse` — surgically copies `DefaultActions` or splices `rules` depending on
  which diff branch fires. Safe because two separate update actions each own a distinct property.
- `S3Storage.diffInverse` — copies the entire `permissions` array in one shot for the single
  `update-permissions` action. Safe because one action handles all permission changes.

### 3e. `diffProperties()` — mutable vs. immutable

The exclusion list passed to `DiffUtility.isObjectDeepEquals(prev, curr, [...excluded])` declares which properties are *
*mutable**.

Check:

1. Every excluded (mutable) field has a corresponding update action that handles it (see §4). This same list is the
   input to the `diffInverse()` audit in §3d.
2. Every non-excluded (immutable) field is actually immutable in the AWS API — and vice versa.
3. Any additional custom immutability guards (e.g., blocking updates to existing sub-items) are correct and intentional.

---

## 4. Action Checks (every file in `actions/`)

### 4a. Filter correctness — applies to all action types

Every `filter()` method must precisely target its diff. Check:

| Filter field                    | When used               | What to verify                                                                                               |
|---------------------------------|-------------------------|--------------------------------------------------------------------------------------------------------------|
| `diff.action`                   | All                     | `DiffAction.ADD / DELETE / UPDATE / VALIDATE` matches intent                                                 |
| `diff.node instanceof X`        | All                     | Correct resource class                                                                                       |
| `hasNodeName(diff.node, '...')` | All                     | Matches the second argument of `@Resource` decorator in resource file                                        |
| `diff.field === 'resourceId'`   | add / delete / validate | Standard for lifecycle actions                                                                               |
| `diff.field === 'properties'`   | property updates        | Used with `diff.value.key`                                                                                   |
| `diff.value.key === '...'`      | property updates        | Must exactly match the **current** property name in the schema (case-sensitive; renames break this silently) |
| `diff.field === 'parent'`       | parent updates          | Used with `diff.value === '<collection-name>'` or `hasNodeName(diff.value, '<parent-name>')`                 |
| `diff.action` in parent actions | parent updates          | May cover `ADD`, `DELETE`, and `UPDATE` — check all three are handled if needed                              |

### 4b. Add action (`add-{name}.resource.action.ts`)

- All **required** SDK input fields are present and mapped from `properties`.
- Conditional fields are properly guarded (e.g., field X only sent when mode is Y).
- Optional `properties` fields that are absent are passed as `undefined` — not as empty objects or empty arrays.
- A wait/poll is present after async creation (e.g., `waitUntilXExists`, custom polling loop).
- The return value populates every field declared in the response schema — no missing or extra keys.
- `mock()` builds a plausible response using only `properties` and `capture`; does not make real SDK calls.

### 4c. Delete action (`delete-{name}.resource.action.ts`)

- Uses the correct AWS identifier. Prefer `response.{Id/Arn}` over `properties.{name}` — names can drift.
- If the resource requires pre-deletion steps (e.g., detach, disable protection), they are present and ordered
  correctly.
- A wait/poll is present if deletion is async.

### 4d. Property update actions (`update-{name}*.resource.action.ts` where `diff.field === 'properties'`)

These are the most bug-prone. For each:

**Filter bugs:**

- `diff.value.key` string must exactly match the property name in the current schema. Any rename invalidates the filter
  silently.

**Handle bugs — unconditional SDK fields:**
The most common P0 bug. If a field is included in every SDK call regardless of prior AWS state, it may fail when the
state assumption is wrong.

- For each field in the SDK command: could sending this field cause an error if the resource was not configured that way
  at creation?
- Fields that enable/disable a feature (e.g., enabling/disabling streams, encryption, logging) must be sent
  conditionally, not unconditionally.
- If a feature can only be disabled by referencing the prior state (e.g., TTL attribute name), verify that the action
  fetches that prior state before disabling.

**Handle bugs — missing fields:**

- Compare every mutable property in `diffProperties()`'s exclusion list against what the SDK command actually sends. Any
  gap is a bug.

**Handle bugs — multiple triggers:**

- If the same property change triggers this action multiple times (e.g., both `billingMode` and `provisionedThroughput`
  are mutable and both change), is the second call idempotent?

### 4e. Parent update actions (`update-{name}*.resource.action.ts` where `diff.field === 'parent'`)

- Filter handles all relevant `DiffAction` values (`ADD`, `DELETE`, `UPDATE`) when the AWS API requires separate calls
  for each direction.
- The handle method uses `diff.action` to branch correctly between add/remove/replace logic.
- Parent resource identifiers are read from `diff.value.response.{Id}` (not from `properties`).
- Order of operations: if a REPLACE must delete-then-add, the delete comes first.

### 4f. Tags action (`update-{name}-tags.resource.action.ts`)

- The ARN passed to the tagging utility comes from `response.{ArnField}` — not from `properties`.
- If the resource has multiple ARNs (e.g., nat-gateway with separate EIP), there is a separate tags action for each, and
  each is registered in `index.ts`.

### 4g. Validate action (`validate-{name}.resource.action.ts`)

- Uses a `Describe*` command — never a mutating command.
- Throws `TransactionError` — not `ResourceError` — on mismatch.
- Does not silently pass when the `Describe*` call returns nothing (check for null/undefined guards).

**What must be validated — build a checklist before auditing:**

1. **Response identity fields** (`response.{Id}`, `response.{Arn}`): compare every field in the response schema against the AWS describe output.

2. **Every immutable property** (those *not* in `diffProperties()`'s exclusion list): compare each one fully — not just a derived metric like array length. A "length check only" on an array is a bug; the actual element values must be compared too.

3. **Every mutable property that has observable AWS state** (those *in* `diffProperties()`'s exclusion list): check that the current AWS state matches `properties.*`. Common examples:
   - Collection size (e.g., number of GSIs) — a count mismatch means out-of-band changes.
   - Status of each element (e.g., GSI `IndexStatus === 'ACTIVE'`) — an error/deleting state would cause the next update to fail.
   - Key shape of each element (e.g., GSI `IndexName`, `KeySchema`, `Projection`) — structural drift would corrupt future diffs.

4. **AWS response quirks**: handle fields AWS omits when they equal the default (e.g., `TableClassSummary` is absent for `STANDARD`; `BillingModeSummary` is absent for `PROVISIONED`). Treat absent as the documented default — not as a mismatch.

**Audit procedure:**

For every property in the schema:
- List it in a table: `property | immutable? | checked in validate?`
- Flag any property that is unchecked or checked only partially (e.g., length instead of deep comparison).
- For array properties: verify each element's fields are compared, not just the array length.

### 4h. `index.ts` — registration completeness

- Every action factory listed above is imported and registered.
- The resource class and schema are exported.
- No action file exists on disk that is not imported in `index.ts`.

---

## 5. Reporting Bugs

### Severity classification

| Severity | Meaning                                                        |
|----------|----------------------------------------------------------------|
| **P0**   | AWS SDK call fails; resource cannot be created/updated/deleted |
| **P1**   | SDK call succeeds but resource is silently misconfigured       |
| **P2**   | Valid input rejected by an overly strict validation            |
| **P3**   | Edge case gap; unlikely to hit in normal use                   |

Severity is communicated via GitHub labels `P0`, `P1`, `P2`, `P3` — **not** in the issue title or body.

### Bug vs. enhancement

- If a property's allowed values are intentionally restricted by the current implementation (not an AWS limitation),
  that is an **enhancement request**, not a bug. Use `--label "enhancement"` instead of `--label "bug"`.
- If the AWS API itself imposes a stricter constraint than the schema, that is a bug.

### False-positive patterns to avoid

**Empty `handle()` in a tags action (not a bug when the AWS resource does not support tagging):**
Some AWS resource types do not support tagging at all (e.g., EFS mount targets). For those resources,
a tags action with an empty `handle()` is intentional — it exists purely to consume tag-update diffs
without error. Before flagging an empty tag handler, verify in the AWS API docs that the resource type
actually supports tagging.

**Optional response fields used without null guard (not a bug):**
Response fields are typed optional because they are unpopulated before the add action runs.
Octo guarantees the add action always completes before any subsequent action (delete, update, validate) executes,
so those fields will always be set. Do not flag this pattern unless:

- A response field is first set by an *update* action (not add), AND
- A second update action reads that field, AND
- There is no guaranteed run-order between the two update actions.
  Only report if all three conditions hold; frame it as a resource action run-order bug.

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

For enhancement requests, replace `--label "bug"` with `--label "enhancement"` and change `## Expected fix` to
`## Expected change`.

### Checklist before filing

- [ ] `ls actions/` run — no action file skipped.
- [ ] Validate action: built the property checklist (§4g) — every property listed, immutability noted, coverage confirmed.
- [ ] Validate action: array properties verified element-by-element, not just by length.
- [ ] Every `@Validate` rule verified against the AWS API docs for this service.
- [ ] Every constructor `if` condition checked for operator-precedence traps.
- [ ] Every `diff.value.key` string in every filter checked against current schema property names.
- [ ] Every SDK command in every action checked for unconditional fields that depend on prior state.
- [ ] `index.ts` checked — every action on disk is registered.
- [ ] One issue per bug — no batching of unrelated bugs.
- [ ] Empty tags `handle()`: verify the AWS resource type actually supports tagging before filing.
- [ ] Optional response fields used without null guard: verify the false-positive rule above before filing.
