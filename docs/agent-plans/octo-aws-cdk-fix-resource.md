# Plan: Fix an octo-aws-cdk Resource Bug

**Goal:** Fix a single GitHub issue by number, then open a PR.

**Input:** Issue number (e.g., `19`)

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
```

Move execution context to that worktree directory for all subsequent steps.

---

## 2. Read Before Touching

Always read every file in the resource directory before making any edit.

```
packages/octo-aws-cdk/src/resources/<name>/index.schema.ts
packages/octo-aws-cdk/src/resources/<name>/<name>.resource.ts
packages/octo-aws-cdk/src/resources/<name>/index.ts
packages/octo-aws-cdk/src/resources/<name>/actions/   ← list with `ls` first, then read each file
```

Cross-reference the snippet in `## Current code` against the file you just read.
If line numbers have shifted since the issue was filed, trust the file content — not the issue.

---

## 3. Identify the Fix Category

Issues from the resource validation audit fall into four categories.
Identify which one applies before editing.

| Category                                 | Affected file                                | Typical issue title pattern                             |
|------------------------------------------|----------------------------------------------|---------------------------------------------------------|
| **A** Constructor guard missing or wrong | `{name}.resource.ts`                         | "always required", "missing guard"                      |
| **B** Schema validation missing or wrong | `index.schema.ts`                            | "no format validation", "can be empty", "no constraint" |
| **C** Validate action incomplete         | `actions/validate-{name}.resource.action.ts` | "does not check", "only checks length"                  |
| **D** Error message expression wrong     | any action file                              | "masking", "misleading", "`\|\|` instead of `??`"       |

---

## 4. Apply the Fix

### 4A. Constructor guard (`{name}.resource.ts`)

Pattern: a bare `if` check fires unconditionally when it should only fire under a condition.

Rules:

- Wrap the existing condition with the missing guard as described in `## Expected fix`.
- Do NOT change the error message wording unless the issue explicitly says to.
- Keep each `if` block in the same relative position — do not reorder unrelated guards.
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

- `@Validate` entries use a `destruct` function that returns an array of subjects, plus an `options` object.
  The framework runs each option check against every element of the returned subjects array.
- To validate **array minimum length** (e.g., non-empty array), do NOT spread the array into subjects.
  Instead, return the array itself as a single element:
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

### 4C. Validate action (`actions/validate-{name}.resource.action.ts`)

Pattern: add one or more `if` blocks that compare live AWS state against `properties.*` or `response.*`.

Rules:

**Error type:** always throw `TransactionError`, never `ResourceError`.
`TransactionError` is already imported in validate action files; do not re-import it.

**Error message format:** match the pattern used by existing checks in the same file:

```
`<ResourceName> <field> mismatch. Expected: ${expected}, Actual: ${actual}`
```

**Check ordering:** place new checks after identity fields (ARN, ID) and before or after
existing property checks, maintaining a logical reading order. Use the surrounding comments
as placement guides.

**Absent-means-default AWS fields:** some AWS fields are omitted from the response when they
equal the service default. Treat absence as the default using `??`:

```typescript
const actualTableClass = actualTable.TableClassSummary?.TableClass ?? 'STANDARD';
```

Never throw an error when the field is absent and the default matches `properties.*`.

**Array property checks:** compare each element's individual fields — not just the array length.
A length-only check is explicitly a bug per the validate-resource audit plan.

```typescript
// Wrong — only length
if (actual.length !== expected.length) { ... }

// Correct — element-level comparison
for (const expectedItem of expected) {
  const actualItem = actual.find((a) => a.IndexName === expectedItem.IndexName);
  if (!actualItem) { throw new TransactionError(`... index ${expectedItem.IndexName} not found`); }
  if (actualItem.IndexStatus !== 'ACTIVE') { throw new TransactionError(`... index not ACTIVE`); }
  // compare KeySchema, Projection, etc.
}
```

**Replacing a length-only check:** if the issue asks you to replace an existing length-only
check (e.g., issue #20 for KeySchema), remove the old `if (actualLength !== expected.length)`
block and replace it with a per-element comparison.

### 4D. Error message expression fix

Pattern: `||` used where `??` is required (boolean fields coerced to string in template literals).

Rules:

- Replace only the exact `||` occurrences identified in the issue.
- Do not touch any other part of the file.
- `||` treats `false` as falsy; `??` treats only `null`/`undefined` as nullish.
  Use `??` whenever the value can legitimately be `false` or `0`.

---

## 5. Quality Gates

Run these checks after applying every fix, before opening the PR.

### 5a. Lint

```bash
npx nx run @quadnix/octo-aws-cdk:lint
```

Zero errors, zero warnings. Fix all issues before proceeding.
If you introduced a new word that the spell checker does not recognise, add it to `dictionary.dic`
(one word per line, alphabetically sorted).

### 5b. Unit tests

```bash
npx nx run @quadnix/octo-aws-cdk:test
```

All tests must pass. If a test was previously testing the buggy behaviour, update it to reflect
the correct behaviour. Do not delete tests to make the suite pass.

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
The `octo-aws-cdk | ` prefix tags the commit with the package it applies to, making the git log
easy to scan when multiple packages are changed across branches.

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
- [ ] `npx nx run @quadnix/octo-aws-cdk:lint` passes with zero warnings
- [ ] `npx nx run @quadnix/octo-aws-cdk:test` passes
EOF
)"
```

`Fixes #<number>` in the PR body causes GitHub to auto-close the issue on merge.
