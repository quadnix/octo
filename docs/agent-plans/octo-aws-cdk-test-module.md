# Plan: Write or Validate an octo-aws-cdk Module Test

Goal: Write a new module test or validate an existing one against the given blueprint.

## Background

octo-aws-cdk is a wrapper around Terraform that translates developer intent into HCL.
A module captures one unit of intent. It is written against a single model with optional overlays and anchors.
Model actions on that model define the HCL blocks the module produces.

A module test loads the module with different inputs and asserts two things: the resource diffs produced by
each commit, and the HCL rendered by `OctoTerraform` after each commit.

## Reference implementation

`packages/octo-aws-cdk/src/modules/subnet/aws-simple-subnet/aws-simple-subnet.module.spec.ts`

## Test structure

```
// imports

async function setup(testModuleContainer: TestModuleContainer, octoTerraform?: OctoTerraform): Promise<{ ... }> { ... }

describe('<Module> UT', () => {
  // 1. Smoke
  // 2. Lifecycle (should CUD)
  // 3. Tags (should CUD tags)
  // 4. describe('input changes') { one it() per input }
  // 5. it('should handle moduleId change')
  // 6. describe('validation') { one it() per rule }
});
```

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

  hcl = new HclAssert(octoTerraform);
});

afterEach(async () => {
  await testModuleContainer.reset();
  await TestContainer.reset();
});
```

## Assertions: digest pattern

Every `commit()` must be followed by exactly one `DiffAssert.digest()` call on the resource diffs,
and one `hcl.digest()` call (to drain and reset the factory).

Write the calls without snapshot values, run once with `--updateSnapshot`, then review and lock:

```ts
expect(new DiffAssert(result.resourceDiffs).digest()).toMatchInlineSnapshot();
expect(hcl.digest()).toMatchSnapshot();
```

### DiffAssert.digest() format

Each line is a resource context prefixed by the action that happened to it:

```
[
  "+ @octo/ecs-cluster=ecs-cluster-region-qa",   // resource added
  "- @octo/vpc=vpc-region",                       // resource deleted
  "~ @octo/ecs-cluster=ecs-cluster-region-qa",   // resource updated (e.g. tag change)
]
```

An empty array `[]` means no resource diffs — this is the expected snapshot for no-op commits.

### HclAssert.digest() format

A previous HCL render is compared against the current one using `jest-diff` and the diff is returned.
The snapshot is the diff itself.

## Section 1 — Smoke / contract (`'should call correct actions'`)

Canonical snapshot of what the module produces. Asserts model actions, resource actions, resource diffs,
and HCL shape — all in one commit.

```ts
it('should call correct actions', async () => {
  const { app } = await setup(testModuleContainer);
  await testModuleContainer.runModule<Module>({ inputs: { ... }, moduleId: 'module', type: Module });
  const result = await testModuleContainer.commit(app, {
    enableResourceCapture: true,
    filterByModuleIds: ['module'],
  });

  expect(testModuleContainer.mapTransactionActions(result.modelTransaction)).toMatchInlineSnapshot();
  expect(testModuleContainer.mapTransactionActions(result.resourceTransaction)).toMatchInlineSnapshot();
  expect(new DiffAssert(result.resourceDiffs).digest()).toMatchInlineSnapshot();
  expect(octoTerraform.render()).toMatchInlineSnapshot();
});
```

`filterByModuleIds` isolates this module when other modules are present in the same test.

---

## Section 2 — Lifecycle (`'should CUD'`)

Create, then delete operation. Assert diffs and HCL after each step. End with `isResourceStateEqual`.

- Delete step: call `setup()` again with the same inputs but do **not** call `runModule` — the absent module
  signals deletion.
- `isResourceStateEqual` confirms state fully converged, and no resources are left behind.
- If the module has non-tag mutable properties, insert an update step between creation and delete.

```ts
it('should CUD', async () => {
  const { app: appCreate } = await setup(testModuleContainer);
  await testModuleContainer.runModule<Module>({ inputs: { ... }, moduleId: 'module', type: Module });
  const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
  expect(new DiffAssert(resultCreate.resourceDiffs).digest()).toMatchInlineSnapshot();
  expect(hcl.digest()).toMatchSnapshot();

  const { app: appDelete } = await setup(testModuleContainer);
  const resultDelete = await testModuleContainer.commit(appDelete, { enableResourceCapture: true });
  expect(new DiffAssert(resultDelete.resourceDiffs).digest()).toMatchInlineSnapshot();
  expect(hcl.digest()).toMatchSnapshot();

  const isResourceStateEqual = await testModuleContainer.isResourceStateEqual();
  expect(isResourceStateEqual).toBe(true);
});
```

## Section 3 — Tags (`'should CUD tags'`)

Three steps: create with tags, update tags, delete tags (run module with no tags registered).

```ts
it('should CUD tags', async () => {
  testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
  // ...setup + runModule...
  const resultCreate = await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
  expect(new DiffAssert(resultCreate.resourceDiffs).digest()).toMatchInlineSnapshot();
  expect(hcl.digest()).toMatchSnapshot();

  testModuleContainer.octo.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
  // ...setup + runModule...
  const resultUpdateTags = await testModuleContainer.commit(appUpdateTags, { enableResourceCapture: true });
  expect(new DiffAssert(resultUpdateTags.resourceDiffs).digest()).toMatchInlineSnapshot();
  expect(hcl.digest()).toMatchSnapshot();

  // delete: setup + runModule with no tags registered
  const resultDeleteTags = await testModuleContainer.commit(appDeleteTags, { enableResourceCapture: true });
  expect(new DiffAssert(resultDeleteTags.resourceDiffs).digest()).toMatchInlineSnapshot();
  expect(hcl.digest()).toMatchSnapshot();
});
```

- `registerTags` replaces the full tag set each step.

## Section 4 — Input changes (`describe('input changes')`)

**Exclusion:** Do not write tests for model reference inputs (e.g. `region`, `account`). These represent
external models, and their behavior is the responsibility of their own modules and tests.

One `it()` per remaining module input. Classify each input:

| Class           | Behavior                               | Expected DiffAssert snapshot                 |
|-----------------|----------------------------------------|----------------------------------------------|
| **Immutable**   | Cannot change after create; must throw | `rejects.toThrowErrorMatchingInlineSnapshot` |
| **Replaceable** | Change triggers delete-old + add-new   | Lines with both `+` and `-`                  |
| **Updatable**   | Change triggers update diff            | Lines with `~`                               |
| **No-op**       | Change has no effect on resources      | `[]`                                         |

Each test: create with the original input, commit, then commit again with the changed input.
For immutable inputs the error is thrown from `commit`, not `runModule`.

```ts
it('should handle <inputName> change', async () => {
  // ...create...
  await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
  hcl.digest(); // To record the baseline HCL.

  // ...setup + runModule with changed input...
  const resultUpdate = await testModuleContainer.commit(appUpdate, { enableResourceCapture: true });
  expect(new DiffAssert(resultUpdate.resourceDiffs).digest()).toMatchInlineSnapshot();
  expect(hcl.digest()).toMatchSnapshot();
});
```

## Section 5 — ModuleId change (`'should handle moduleId change'`)

Resources are keyed by model identity, not moduleId — changing it must always be a no-op.
Both DiffAssert and HCL digests must produce no-op snapshots.

```ts
it('should handle moduleId change', async () => {
  // ...create with moduleId: 'module-1'...
  await testModuleContainer.commit(appCreate, { enableResourceCapture: true });
  hcl.digest(); // To record the baseline HCL.

  // ...setup + runModule with moduleId: 'module-2'...
  const resultUpdate = await testModuleContainer.commit(appUpdate, { enableResourceCapture: true });
  expect(new DiffAssert(resultUpdate.resourceDiffs).digest()).toMatchInlineSnapshot();
  expect(hcl.digest()).toMatchSnapshot();
});
```

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

## Validation: How to discover what HCL a module produces

### Step 1 — Find the model actions

The module directory contains `model/` and `overlay/` sub-folders. Each holds one or more action files
(e.g. `add-<model>.model.action.ts`, `update-<model>.model.action.ts`). Open every action file and look
at its `actionOutputs` property — it lists the resource class(es) the action creates or touches.

### Step 2 — Trace each resource

For every resource class listed in `actionOutputs`, open its source file and read the `constructor` to
understand how the resource id is formed and what properties it stores. This tells you the block
address (`resource.<type>.<name>`) and what data flows in.

### Step 3 — Read `toHCL()`

Each resource class has a `toHCL()` method. Read it to know how many top-level properties and nested blocks
each resource emits. This lets you verify that the autopopulated `hcl.digest()` snapshots shows correctly.

## Constraints

When fixing or rewriting an existing test file, treat the following as read-only unless the change is the
direct subject of the fix:

- **Variable names** — preserve exactly as written (e.g. `resultUpdateFilesystemName`, not `resultUpdate`).
- **Input values** — preserve original input values.

Only change what the fix actually requires.

## Checklist

- [ ] `HclAssert` is constructed with only the factory: `new HclAssert(octoTerraform)`.
- [ ] Every `commit()` result has a matching `expect(new DiffAssert(...).digest()).toMatchInlineSnapshot()`.
- [ ] Every `commit()` has exactly one `expect(hcl.digest()).toMatchSnapshot()`.
- [ ] All inline snapshots are populated (run once with `--updateSnapshot`, then review and lock).
- [ ] Section 2 includes an update step if the module has non-tag mutable properties.
- [ ] Section 4 has one test per input, correctly classified.
- [ ] Section 6 has one test per validation rule in the module's schema or actions.
- [ ] No variable names or input values were changed beyond what the fix requires.
- [ ] If module resources call `getRef()`, pre-existing resources are registered via
  `octoTerraform.addOctoTerraformResource()` + `.output({...})` in `setup()`, and `setup()` accepts
  `octoTerraform` as a second parameter.
