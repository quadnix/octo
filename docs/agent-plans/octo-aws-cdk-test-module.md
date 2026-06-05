# Plan: Write or Validate an octo-aws-cdk Module Test

Goal: Write a new module test or validate an existing one against the given blueprint.

## Background

octo-aws-cdk is a wrapper around Terraform that translates developer intent into HCL.
A module captures one unit of intent. It is written against a single model with optional overlays and anchors.
Model actions on that model define the HCL blocks the module produces.

A module test loads the module with different inputs and asserts two things: the resource diffs produced by
each commit, and the HCL rendered by `OctoTerraform` after each commit.

## Reference implementation

`packages/octo-aws-cdk/src/modules/region/aws-single-az-region/aws-single-az-region.module.spec.ts`

---

## How to discover what HCL a module produces

Before writing any test assertions, do this three-step read to learn exactly which HCL blocks the module
creates and what their fields look like. This is the fastest path to a correct `BASE_HCL_SHAPE`.

### Step 1 — Find the model actions

The module directory contains `model/` and `overlay/` sub-folders. Each holds one or more action files
(e.g. `add-<model>.model.action.ts`, `update-<model>.model.action.ts`). Open every action file and look
at its `actionOutputs` property — it lists the resource class(es) the action creates or touches.

### Step 2 — Trace each resource

For every resource class listed in `actionOutputs`, open its source file and read the `constructor` to
understand how the resource id is formed and what properties it stores. This tells you both the block
address key (`resource.<type>.<name>`) and what data flows in.

### Step 3 — Read `toHCL()`

Each resource class has a `toHCL()` method that returns the exact HCL object the module will emit.
Read it to enumerate every top-level key you need to assert in `BASE_HCL_SHAPE`. Use the literal values
(or a representative example value) as expected values in the shape.

After these three steps you have everything needed to write `BASE_HCL_SHAPE` and the diff assertions —
no guessing required.

---

## File structure

```
// imports

const BASE_HCL_SHAPE: HclShape = { ... };

async function setup(testModuleContainer: TestModuleContainer): Promise<{ ... }> { ... }

describe('<Module> UT', () => {
  // 1. Smoke
  // 2. Lifecycle (should CUD)
  // 3. Tags (should CUD tags)
  // 4. describe('input changes') { one it() per input }
  // 5. it('should handle moduleId change')
  // 6. describe('validation') { one it() per rule }
});
```

---

## Boilerplate: beforeEach / afterEach

```ts
let hcl: HclAssert;
let octoTerraform: OctoTerraform;
let testModuleContainer: TestModuleContainer;

beforeEach(async () => {
  const container = await TestContainer.create(
    { mocks: [{ metadata: { package: '@octo' }, type: OctoTerraform, value: new OctoTerraform() }] },
    { factoryTimeoutInMs: 500 },
  );
  testModuleContainer = new TestModuleContainer();
  await testModuleContainer.initialize();

  octoTerraform = await container.get(OctoTerraform, { metadata: { package: '@octo' } });
  octoTerraform.addTerraformConfig();
  octoTerraform.addTerraformProvider('<accountId>', '<region>');

  hcl = new HclAssert(octoTerraform, BASE_HCL_SHAPE);
});

afterEach(async () => {
  await testModuleContainer.reset();
  await TestContainer.reset();
});
```

`BASE_HCL_SHAPE` covers post-create state. Keys are block addresses (`resource.<type>.<name>`, `output.<name>`,
`data.<type>.<name>`). Values map top-level property name → expected value. `HclAssert` strips the outer `"..."`
from HCL string values, so always write without surrounding quotes: `'10.0.0.0/8'` not `'"10.0.0.0/8"'`.

---

## Section 1 — Smoke / contract (`'should call correct actions'`)

Canonical snapshot of what the module produces. Run once, assert model actions, resource actions, and HCL.

```ts
it('should call correct actions', async () => {
  const { app } = await setup(testModuleContainer);
  await testModuleContainer.runModule<Module>({ inputs: { ... }, moduleId: 'region', type: Module });
  const result = await testModuleContainer.commit(app, {
    enableResourceCapture: true,
    filterByModuleIds: ['region'],
  });

  expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot(`...`);
  expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot(`...`);
  hcl.assert();
});
```

`filterByModuleIds` isolates this module when other modules are present in the same test.

---

## Section 2 — Lifecycle (`'should CUD'`)

Assert `hasAdded` diffs after creation and `hasDeleted` diffs after delete. Call `hcl.assert()` after create
and `hcl.assertShape({})` after delete. End with `isResourceStateEqual`.

- Delete step: call `setup()` again with the same inputs but do **not** call `runModule` — the absent module signals
  deletion.
- `isResourceStateEqual` confirms state fully converged.
- If the module has non-tag mutable properties, insert an update step between creation and delete.

---

## Section 3 — Tags (`'should CUD tags'`)

Three steps: add tags (create with tags), update tags, delete tags (run module with no tags registered).
Assert `hasTagUpdate` diffs on every tagged resource in the update and delete steps.

```ts
// update step — shows the key call shapes
testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
// ...setup + runModule...
new DiffAssert(resultUpdateTags.resourceDiffs)
  .hasTagUpdate('<resourceType>=<resourceId>', { add: { tag2: 'value2' }, delete: [], update: { tag1: 'value1_1' } });
hcl.assert();
```

- `registerTags` replaces the full tag set each step; accumulate expected deltas manually.
- `delete` in `hasTagUpdate` is an array of key names, not a map.
- Every resource that receives tags must appear in every `hasTagUpdate` call.

---

## Section 4 — Input changes (`describe('input changes')`)

**Exclusion:** Do not write tests for model reference inputs (e.g. `account`). These represent external models
and their behavior is the responsibility of their own modules and tests.

One `it()` per remaining module input. Classify each input:

| Class           | Behavior                               | Assertion                                           |
|-----------------|----------------------------------------|-----------------------------------------------------|
| **Immutable**   | Cannot change after create; must throw | `rejects.toThrowErrorMatchingInlineSnapshot(...)`   |
| **Replaceable** | Change triggers delete-old + add-new   | `DiffAssert.hasDeleted(...).hasAdded(...)`          |
| **Updatable**   | Change triggers update diff            | `DiffAssert.hasUpdated(...)` or `hasTagUpdate(...)` |

Each test: create with the original input, then commit again with the changed input.
For immutable inputs the error is thrown from `commit`, not `runModule`.

---

## Section 5 — ModuleId change (`'should handle moduleId change'`)

Resources are keyed by model identity, not moduleId — changing it must always be a no-op.

```ts
it('should handle moduleId change', async () => {
  // ...create with moduleId: 'region-1' and hcl.assert()...

  const { app: appUpdate } = await setup(testModuleContainer);
  await testModuleContainer.runModule<Module>({ ..., moduleId: 'region-2', type: Module });
  const resultUpdate = await testModuleContainer.commit(appUpdate, { enableResourceCapture: true });
  new DiffAssert(resultUpdate.resourceDiffs).hasNoChanges();
  hcl.assert();
});
```

---

## Section 6 — Validation (`describe('validation')`)

One `it()` per validation rule the module enforces. Errors must be thrown from `runModule`, not `commit`.

```ts
describe('validation', () => {
  it('should validate <rule description>', async () => {
    await setup(testModuleContainer);
    await expect(async () => {
      await testModuleContainer.runModule<Module>({ inputs: { ...<violating>... }, ... });
      // if the rule spans two modules, add a second runModule call here
    }).rejects.toThrowErrorMatchingInlineSnapshot(`"<error message>"`);
  });
});
```

---

## HclAssert cheat sheet

| Call                     | When to use                                                         |
|--------------------------|---------------------------------------------------------------------|
| `hcl.assert()`           | HCL matches `BASE_HCL_SHAPE`. Resets factory.                       |
| `hcl.assertShape(shape)` | HCL differs from baseline (e.g. after name change). Resets factory. |
| `hcl.assertShape({})`    | HCL must be empty (post-delete). Resets factory.                    |

Must be called after **every** `commit()` — the factory accumulates blocks across commits, so a missing
call causes false positives in the next assertion.

---

## Constraints

When fixing or rewriting an existing test file, treat the following as read-only unless the change is the direct subject
of the fix:

- **Variable names** — preserve exactly as written (e.g. `resultUpdateFilesystemName`, not `resultUpdate`).
- **Input values** — preserve original input values.

Only change what the fix actually requires.

---

## Checklist

- [ ] `BASE_HCL_SHAPE` covers every resource, output, and data block the module creates.
- [ ] Section 1 inline snapshots are populated (run once with `--updateSnapshot`, then lock them).
- [ ] Section 2 includes an update step if the module has non-tag mutable properties.
- [ ] Section 4 has one test per input, correctly classified.
- [ ] Section 6 has one test per validation rule in the module's schema or actions.
- [ ] Every `commit()` is followed by exactly one `hcl.assert()` or `hcl.assertShape()`.
- [ ] No variable names or input values were changed beyond what the fix requires.
