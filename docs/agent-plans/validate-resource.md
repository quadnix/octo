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

### 3d. `diffProperties()` — mutable vs. immutable

The exclusion list passed to `DiffUtility.isObjectDeepEquals(prev, curr, [...excluded])` declares which properties are *
*mutable**.

Check:

1. Every excluded (mutable) field has a corresponding update action that handles it (see §4).
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
- Order of operations: if a replace must delete-then-add, the delete comes first.

### 4f. Tags action (`update-{name}-tags.resource.action.ts`)

- The ARN passed to the tagging utility comes from `response.{ArnField}` — not from `properties`.
- If the resource has multiple ARNs (e.g., nat-gateway with separate EIP), there is a separate tags action for each, and
  each is registered in `index.ts`.

### 4g. Validate action (`validate-{name}.resource.action.ts`)

- Uses a `Describe*` command — never a mutating command.
- Compares each **immutable** property (those not in `diffProperties()`'s exclusion list) against the AWS response.
- Checks `response.{id/arn}` fields for identity drift.
- Handles AWS response quirks (e.g., a field that AWS omits when it equals the default).
- Throws `TransactionError` — not `ResourceError` — on mismatch.
- Does not silently pass when the `Describe*` call returns nothing (check for null/undefined guards).

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

For enhancement requests, replace `--label "bug"` with `--label "enhancement"` and change `## Expected fix` to `## Expected change`.

### Checklist before filing

- [ ] `ls actions/` run — no action file skipped.
- [ ] Every `@Validate` rule verified against the AWS API docs for this service.
- [ ] Every constructor `if` condition checked for operator-precedence traps.
- [ ] Every `diff.value.key` string in every filter checked against current schema property names.
- [ ] Every SDK command in every action checked for unconditional fields that depend on prior state.
- [ ] `index.ts` checked — every action on disk is registered.
- [ ] One issue per bug — no batching of unrelated bugs.
- [ ] Optional response fields used without null guard: verify the false-positive rule above before filing.
