# Plan: Fix an octo-aws-cdk Resource Bug

**Goal:** Fix a single GitHub issue by number, then open a PR.

**Input:** Issue number (e.g., `19`)

Read `@docs/CODING-STANDARDS.md` before the first edit. It overrides anything here that drifts.

---

## 1. Initiate

### 1a. Fetch the issue

```bash
gh issue view <number> --repo quadnix/octo --json number,title,labels,body
```

Record the following fields from the issue body:

| Field                 | Where in issue    |
|-----------------------|-------------------|
| Resource directory    | `## Resource`     |
| Affected file(s)      | `## File`         |
| Current (broken) code | `## Current code` |
| Root cause            | `## Problem`      |
| What to change        | `## Expected fix` |

### 1b. Create a git worktree

```bash
git worktree add ../ai-worktrees/octo-worktree-fix-issue-<number> -b ai/fix-issue-<number>

WORKTREE=../ai-worktrees/octo-worktree-fix-issue-<number>
find . -maxdepth 4 -name node_modules -type d ! -path "*/node_modules/*/node_modules" | \
  while read src; do
    mkdir -p "$WORKTREE/$(dirname $src)"
    ln -s "$(pwd)/$src" "$WORKTREE/$src"
  done
```

Move execution context to that worktree directory for all subsequent steps.
All `node_modules` symlinks are required so NX and Jest can resolve packages from within the worktree
(the project has several: root, and one per package/app).
See the Initiate step in `@AGENTS.md` for the general rule.

---

## 2. Read Before Touching

Always read every file in the resource directory before making any edit.

```
packages/octo-aws-cdk/src/resources/<name>/index.schema.ts
packages/octo-aws-cdk/src/resources/<name>/<name>.resource.ts
packages/octo-aws-cdk/src/resources/<name>/index.ts
```

Note the class's base: `ATerraformResource` (Terraform-backed — every current octo-aws-cdk resource)
or `AResource` (external, SDK-driven). It decides whether category **C** or **F** applies below.
An external resource also has an `actions/` directory — `ls` it and read every file.

Cross-reference the snippet in `## Current code` against the file you just read.
If line numbers have shifted since the issue was filed, trust the file content — not the issue.

---

## 3. Identify the Fix Category

Issues from the resource validation audit fall into these categories.
Identify which one applies before editing.

| Category                                       | Affected file        | Typical issue title pattern                             |
|------------------------------------------------|----------------------|---------------------------------------------------------|
| **A** Constructor guard missing or wrong       | `{name}.resource.ts` | "always required", "missing guard"                      |
| **B** Schema validation missing or wrong       | `index.schema.ts`    | "no format validation", "can be empty", "no constraint" |
| **C** `toHCL()` renders the wrong HCL          | `{name}.resource.ts` | "wrong argument", "missing block", "not tagged", "wrong provider" |
| **D** Error message expression wrong           | any file             | "masking", "misleading", "`\|\|` instead of `??`"       |
| **E** Mutability model wrong                   | `{name}.resource.ts` | "should be force-new", "needless replace", "immutable"  |
| **F** External resource action wrong           | `actions/*.ts`       | "does not check", "unconditional field", "diffInverse"  |

---

## 4. Apply the Fix

### 4A. Constructor guard (`{name}.resource.ts`)

Pattern: a bare `if` check fires unconditionally when it should only fire under a condition.

Rules:

- Wrap the existing condition with the missing guard as described in `## Expected fix`.
- Do NOT change the error message wording unless the issue explicitly says to.
- Keep each `if` block in the same relative position — do not reorder unrelated guards.
- Throw `ResourceError` with `this` as the second argument, matching the surrounding guards.
- The import for `ResourceError` must already exist; do not add it if it is present.

Example — issue #18 (StreamSpecification always required):

```typescript
// Before
if (!properties.StreamSpecification) { ... }

// After
if (properties.GlobalSecondaryIndexes.length > 0 && !properties.StreamSpecification) { ... }
```

### 4B. Schema validation (`index.schema.ts`)

Pattern: a `@Validate` decorator is missing a constraint, or the constraint uses the wrong option.

Rules:

- `@Validate` entries use a `destruct` function returning an array of subjects, plus an `options`
  object. The framework runs each option check against every element of the returned subjects array.
- To validate **array minimum length** (e.g. non-empty array), do NOT spread the array into subjects.
  Return the array itself as a single element:
  ```typescript
  destruct: (value: ...): (string[])[] => [value.theArray],
  options: { minLength: 1 },
  ```
  `validateMinLength` supports arrays natively and checks `.length`.
- To validate a **string format**, add a `regex` option:
  ```typescript
  options: { regex: /^your-pattern$/ }
  ```
- Keep entries in the `@Validate` array in the same relative order as the surrounding entries
  (alphabetical by the comment describing each entry is the project convention).
- Only add a new entry to the `@Validate` array; do not restructure existing entries.
- When the fix adds a **response** field, also give it a syntactically plausible default in
  `Schema<{...}>({ ... })`. Response defaults become terragrunt `mock_outputs`; a field with no default
  falls back to a synthetic `mock-<output>` string, which a provider-side format check can reject
  during `octo validate`.

### 4C. `toHCL()` (`{name}.resource.ts`)

Pattern: the emitted HCL does not match what the Terraform AWS provider expects.

Open the provider documentation for the `aws_*` type being fixed and work against it directly.

Rules:

**Argument names and types** are the provider's, verbatim. Do not infer them from the AWS SDK's
PascalCase field names — the provider uses snake_case and sometimes renames outright.

**Block versus attribute.** Pass a plain JS object (or an array of objects for a repeated block) when
the provider schema declares a **block** (`key { }`, no `=`). Wrap with `terraform.mapAttr(value)` when
it declares a **map/object attribute** (`key = { }`). This distinction is the most common source of
HCL the provider rejects.

**Conditional arguments** go inside an `if`, and stay fully absent when off:

```typescript
if (this.properties.StreamSpecification) {
  spec['stream_enabled'] = true;
  spec['stream_view_type'] = this.properties.StreamSpecification.StreamViewType;
}
```

Never emit `false`/`""`/`[]` as an "off" value unless the provider documents that form.

**References** use `terraform.getRef(parent, 'ResponseKey')` for another octo resource's output, and
`terraform.raw(`${tfResource.address}.attr`)` for an attribute of a TF resource emitted in this same
method. Never string-concatenate an address into a quoted value.

**Parent dependencies.** If the fix adds a parent that no argument references, add it to
`explicitParents`. If the fix adds a `getRef` to a parent already listed in `explicitParents`, remove
it from that list — a parent is wired one way or the other, never both.

**Outputs** must keep matching the response schema key set exactly. Changing `output({...})` without
changing the response schema (or vice versa) is itself a bug.

**Tags** are applied to every taggable TF resource the method emits, each guarded:

```typescript
if (Object.keys(this.tags).length > 0) {
  tfResource.attribute('tags', this.tags);
}
```

### 4D. Error message expression fix

Pattern: `||` used where `??` is required (boolean or numeric fields coerced in template literals).

Rules:

- Replace only the exact `||` occurrences identified in the issue.
- Do not touch any other part of the file.
- `||` treats `false` and `0` as falsy; `??` treats only `null`/`undefined` as nullish. Use `??`
  whenever the value can legitimately be `false` or `0`.

### 4E. Mutability model (`diffProperties()` / `diff()`)

Pattern: Octo's idea of what can change in place disagrees with the provider's.

The two correct outcomes:

```typescript
// Force-new argument changed → replace the resource.
return [
  new Diff(
    this,
    DiffAction.REPLACE,
    'resourceId',
    this.getContext(),
    'connectivity_type is force-new on aws_nat_gateway; a change recreates it',
  ),
];

// Updatable arguments → name them in the exclusion list so they fall through to an update diff.
DiffUtility.isObjectDeepEquals(previous.properties, this.properties, [
  'AttributeDefinitions',
  'billingMode',
  /* ... */
]);
```

Rules:

- The provider's *"Forces new resource"* markers are the authority. Move a property between the
  exclusion list and the REPLACE path to match them — do not guess from the AWS API.
- The REPLACE reason string names the real force-new argument and the real TF type. It is rendered to
  humans in the validate report; keep it accurate and lowercase, matching the existing style.
- When the fix removes a custom immutability guard, confirm the provider actually supports the change
  in place. If it does not, the guard stays and the issue is an enhancement, not a bug — say so on the
  issue rather than forcing the change.
- Changing this changes what module tests snapshot. Expect `digestDiffs` snapshots to move from `*` to
  `^` (or back) and update them deliberately — see `octo-aws-cdk-test-module.md`.

### 4F. External resource action (`actions/*.ts`)

Only applies when the resource extends `AResource` directly. Terraform-backed resources cannot have
actions — registering one throws.

Rules:

- The interface is `filter(diff)`, `handle(diff)`, and optional `actionTimeoutInMs`. There is no
  `mock()` and no resource-capture hook; if the issue references either, it predates the Terraform
  migration — re-read the file and re-scope the fix.
- `handle()` returns the response object; it does not mutate the resource.
- Throw `TransactionError` from a validate action, never `ResourceError`.
- Match the surrounding error message format:
  ```
  `<ResourceName> <field> mismatch. Expected: ${expected}, Actual: ${actual}`
  ```
- Treat AWS fields omitted at their service default as that default, using `??`:
  ```typescript
  const actualTableClass = actualTable.TableClassSummary?.TableClass ?? 'STANDARD';
  ```
- Compare arrays element by element, never by length alone:
  ```typescript
  for (const expectedItem of expected) {
    const actualItem = actual.find((a) => a.IndexName === expectedItem.IndexName);
    if (!actualItem) { throw new TransactionError(`... index ${expectedItem.IndexName} not found`); }
    // compare KeySchema, Projection, status, etc.
  }
  ```
- If `handle()` gains a branch that writes only part of the response, check `diffInverse()` still copies
  only what this action changed.

---

## 5. Quality Gates

Run these after applying the fix, before opening the PR.

### 5a. Types

```bash
npx tsc --noEmit -p packages/octo-aws-cdk
```

Run it on every package you changed, not only the one you edited.

### 5b. Lint

```bash
npx nx run @quadnix/octo-aws-cdk:lint
```

Zero errors, zero warnings, zero spelling errors. **Never add a word to `dictionary.dic` to get past
the spell checker** (`docs/CODING-STANDARDS.md`) — rename the identifier to full English instead.

### 5c. Unit tests

```bash
npx nx run @quadnix/octo-aws-cdk:test
```

`octo-aws-cdk` imports `octo` from `dist`. If the fix touched `packages/octo`, rebuild first:

```bash
npx nx run @quadnix/octo:build
```

All tests must pass. If a test was asserting the buggy behaviour, update it to the correct behaviour.
Do not delete tests to make the suite pass.

A fix in categories **C** or **E** will move module-spec snapshots — the HCL snapshot for C, the
`digestDiffs` inline snapshots for E. Review every moved snapshot line by line and confirm it is the
change you intended before committing. Report the real test numbers; never claim a run you did not do.

---

## 6. Submit

### 6a. Commit

```bash
git add -A
git commit -m "$(cat <<'EOF'
patch(fix): octo-aws-cdk | <short description matching the issue title, lowercase, ends with period>.
EOF
)"
```

PR title must match the regex in `.github/jobs/validate-pr-title.job.sh`:

```
^(chore|major|minor|patch)\((docs|feat|fix|refactor|release|revert|test)\):\ .+\.$
```

Bug fixes use `patch(fix): octo-aws-cdk | ...`.
The `octo-aws-cdk | ` prefix tags the commit with the package it applies to, making the git log easy to
scan when multiple packages are changed across branches.

### 6b. Push and open PR

```bash
git push -u origin ai/fix-issue-<number>

gh pr create \
  --title "patch(fix): octo-aws-cdk | <same description as commit>." \
  --body "$(cat <<'EOF'
## Summary
Fixes #<number>.

<One sentence: what was wrong and what was changed.>

## Test plan
- [ ] `npx tsc --noEmit` passes on every changed package
- [ ] `npx nx run @quadnix/octo-aws-cdk:lint` passes with zero warnings
- [ ] `npx nx run @quadnix/octo-aws-cdk:test` passes — <N> tests
- [ ] Moved snapshots reviewed <or: no snapshots moved>
EOF
)"
```

`Fixes #<number>` in the PR body causes GitHub to auto-close the issue on merge.

### 6c. Fold back corrections

If the user corrects the code or the approach, update `@docs/CODING-STANDARDS.md` or this plan in the
same session so the correction sticks.
