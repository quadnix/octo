# Plan: Write or Validate an octo-aws-cdk Module Test

Goal: write a new module test, or validate an existing one against this blueprint.

## Background

octo-aws-cdk translates developer intent into HCL; Terraform makes every infrastructure change.
A module captures one unit of intent. It is written against a single model with optional overlays and
anchors. Model actions on that model produce octo resources, and each resource's `toHCL()` produces the
Terraform blocks.

A module spec therefore asserts two things after every run: **which octo resources changed**, and
**what HCL that rendered**. It runs entirely in memory — no Terraform binary, no cloud.

## Reference implementation

`packages/octo-aws-cdk/src/modules/subnet/aws-simple-subnet/aws-simple-subnet.module.spec.ts`

Read it before writing. Everything below is drawn from it.

## The API

One call drives the whole lifecycle:

```ts
testModuleContainer.runModules<M>(modules, { filterByModuleIds, outputDir, terraformTarget })
```

It is an **async generator** that yields once. Always `.next()` it, and read `.value!`:

| Yielded field         | What it is                                                              |
|-----------------------|--------------------------------------------------------------------------|
| `hclDiff`             | Rendered HCL diffed against the previous run in this test. Snapshot this. |
| `hclRender`           | The full rendered HCL. Snapshot this in the smoke test only.              |
| `modelTransaction`    | Model actions that ran. Feed to `mapTransactionActions()`.                |
| `resourceDiffs`       | Resource-level changes. Feed to `digestDiffs()`.                          |
| `resourceTransaction` | Resource actions that ran. Always `TerraformNoopResourceAction` for terraform-backed resources — assert only when the module has an external resource. |
| `responses`           | Resource responses by context.                                            |
| `validateReport`      | Only populated when `terraformTarget` is not `'skip'`.                    |
| `warnings`            | Non-fatal problems raised during the run.                                 |

`terraformTarget` decides what the test costs, and **every unit test passes `'skip'`**:

- `'skip'` — composes and commits in memory. No terraform, no cloud. This is a unit test.
- `'plan'` — generates module folders and runs `terraform plan`. Not for `*.module.spec.ts`.
- `'apply'` — generates, plans, applies, commits. **Creates real infrastructure.** `octo-templates`
  e2e specs only.

## Test structure

```
// imports

async function setup(testModuleContainer: TestModuleContainer): Promise<void> { ... }

describe('<Module> UT', () => {
  // 1. Smoke        — it('should call correct actions')
  // 2. Lifecycle    — it('should CUD')
  // 3. Relationships— it('should associate and disassociate ...')   [only if the module has them]
  // 4. Tags         — it('should CUD tags')
  // 5. describe('input changes') { one it() per input }
  // 6. it('should handle moduleId change')
  // 7. describe('validation') { one it() per rule }
});
```

## Boilerplate: beforeEach / afterEach

```ts
let testModuleContainer: TestModuleContainer;

beforeEach(async () => {
  const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

  testModuleContainer = new TestModuleContainer(container);
  await testModuleContainer.initialize();

  testModuleContainer.registerTerraformConfig({
    providers: { aws: { minVersion: '5.49', source: 'hashicorp/aws' } },
  });
  testModuleContainer.registerTerraformProvider('aws', '123', 'us-east-1');
});

afterEach(async () => {
  await testModuleContainer.reset();
  await TestContainer.reset();
});
```

`TestModuleContainer`'s constructor takes the container. Both `registerTerraformConfig` and
`registerTerraformProvider` are required before any run that renders terraform — which is all of them.

## Boilerplate: setup()

`setup()` builds everything the module expects to already exist, and is called **before every
`runModules()`**, including the second and third steps of a multi-step test. Three helpers:

```ts
async function setup(testModuleContainer: TestModuleContainer): Promise<void> {
  // 1. Models the module's inputs reference.
  const { region: [region] } = await testModuleContainer.createTestModels('testModule', {
    account: ['aws,123'],
    app: ['test-app'],
    region: ['region'],
  });

  // 2. Anchors the module reads off those models.
  region.addAnchor(
    testModuleContainer.createTestAnchor<AwsRegionAnchorSchema>(
      'AwsRegionAnchor',
      { awsRegionAZs: ['us-east-1a'], awsRegionId: 'us-east-1', regionId: 'aws-us-east-1a', vpcCidrBlock: '10.0.0.0/16' },
      region,
    ),
  );

  // 3. Resources produced by other modules, that this module's resources will getRef() against.
  await testModuleContainer.createTestResources<[VpcSchema]>(
    'testModule',
    [
      {
        properties: { awsAccountId: '123', awsRegionId: 'us-east-1', CidrBlock: '10.0.0.0/16', InstanceTenancy: 'default' },
        resourceContext: '@octo/vpc=vpc-region',
        response: { VpcId: 'VpcId' },
        terraform: true,
      },
    ],
    { save: true },
  );
}
```

- `terraform: true` on a seeded resource is what lets a resource under test resolve `getRef()` against
  it. Omit it and the reference cannot be wired.
- Module inputs reference these models through `stub('${{testModule.model.region}}')`.

## Assertions

### `digestDiffs(resourceDiffs)` — what changed

Each line is a resource context prefixed by what happened to it:

```
[
  "+ @octo/subnet=subnet-region-private-subnet",     // added
  "- @octo/route-table=rt-region-private-subnet",     // deleted
  "^ @octo/vpc=vpc-region",                           // REPLACE (force-new argument changed)
  "* @octo/network-acl=nacl-region-private-subnet",   // updated in place
]
```

`VALIDATE` diffs are filtered out. `[]` means no resource change — the expected snapshot for a no-op.

Always `toMatchInlineSnapshot()`; these are short and belong in the file where they are read.

### `hclDiff` / `hclRender` — what rendered

- Smoke test: `expect(hclRender).toMatchInlineSnapshot()` — the full canonical render, inline.
- Every other step: `expect(x.hclDiff).toMatchSnapshot()` — the change against the previous run,
  external. `hclDiff` is only meaningful relative to the preceding `runModules()` in the same test, so
  never skip a step's assertion and expect the next one to still read correctly.

### `isResourceStateEqual()` — state converged

```ts
expect(await testModuleContainer.isResourceStateEqual()).toBe(true);
```

Assert it after **every** `runModules()`, including the ones whose diffs you do not snapshot. It is what
catches a resource left behind after a delete.

### Writing snapshots

Write the assertion calls empty, run once with `--updateSnapshot`, then read every generated snapshot
before committing it. An unreviewed snapshot is not a test.

---

## Section 1 — Smoke (`'should call correct actions'`)

The canonical record of what the module produces: model actions, resource diffs, and the full HCL, in
one run.

```ts
it('should call correct actions', async () => {
  await setup(testModuleContainer);
  const runModulesGenerator = testModuleContainer.runModules<AwsSimpleSubnetModule>(
    {
      inputs: {
        region: stub('${{testModule.model.region}}'),
        subnetAvailabilityZone: 'us-east-1a',
        subnetCidrBlock: '10.0.1.0/24',
        subnetName: 'private-subnet',
      },
      moduleId: 'subnet',
      type: AwsSimpleSubnetModule,
    },
    { filterByModuleIds: ['subnet'], terraformTarget: 'skip' },
  );

  const { hclRender, modelTransaction, resourceDiffs } = (await runModulesGenerator.next()).value!;
  expect(hclRender).toMatchInlineSnapshot();
  expect(testModuleContainer.mapTransactionActions(modelTransaction)).toMatchInlineSnapshot();
  expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot();
  expect(await testModuleContainer.isResourceStateEqual()).toBe(true);
});
```

`filterByModuleIds` isolates this module when the run loads more than one.

This is the one place the whole HCL is pinned, so read it carefully when it is generated: provider
aliases, block types, argument names, and `var.*` wiring to other modules are all visible here and
nowhere else.

---

## Section 2 — Lifecycle (`'should CUD'`)

Create, then update through each mutable input, then delete. Each step calls `setup()` again, then
`runModules()`.

- **Delete** is signalled by `hidden: true` on the module — it stays registered but does not run, so
  its resources fall out of the desired state.
- The first step usually needs no diff assertion; assert `isResourceStateEqual()` and move on.
- End on a delete, and assert the resource state converged.

```ts
it('should CUD', async () => {
  await setup(testModuleContainer);
  await testModuleContainer
    .runModules<AwsSimpleSubnetModule>(
      { inputs: { /* ... */ }, moduleId: 'subnet', type: AwsSimpleSubnetModule },
      { terraformTarget: 'skip' },
    )
    .next();
  expect(await testModuleContainer.isResourceStateEqual()).toBe(true);

  await setup(testModuleContainer);
  const addSubnetOptions = (
    await testModuleContainer
      .runModules<AwsSimpleSubnetModule>(
        { inputs: { /* ...changed... */ }, moduleId: 'subnet', type: AwsSimpleSubnetModule },
        { terraformTarget: 'skip' },
      )
      .next()
  ).value!;
  expect(addSubnetOptions.hclDiff).toMatchSnapshot();
  expect(testModuleContainer.digestDiffs(addSubnetOptions.resourceDiffs)).toMatchInlineSnapshot();
  expect(await testModuleContainer.isResourceStateEqual()).toBe(true);

  await setup(testModuleContainer);
  const deleteResult = (
    await testModuleContainer
      .runModules<AwsSimpleSubnetModule>(
        { hidden: true, inputs: { /* same as previous step */ }, moduleId: 'subnet', type: AwsSimpleSubnetModule },
        { terraformTarget: 'skip' },
      )
      .next()
  ).value!;
  expect(deleteResult.hclDiff).toMatchSnapshot();
  expect(testModuleContainer.digestDiffs(deleteResult.resourceDiffs)).toMatchInlineSnapshot();
  expect(await testModuleContainer.isResourceStateEqual()).toBe(true);
});
```

Name each step's result after what it does (`addSubnetOptions`, `addLocalFilesystem`, `deleteResult`),
not `result1`/`result2`.

## Section 3 — Relationships

Only when the module's resources associate with siblings (a subnet with another subnet, a NAT gateway
between two). One `it()` per relationship, covering both directions:
`'should associate and disassociate <X> with <Y>'`. Load both modules in one `runModules()` call by
passing an array, then re-run with the association removed.

## Section 4 — Tags (`'should CUD tags'`)

Three steps: create with tags, change the tag set, remove the tag set. `registerTags` replaces the full
set each time, and is called **before** `setup()`.

```ts
it('should CUD tags', async () => {
  testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1' } }]);
  await setup(testModuleContainer);
  await testModuleContainer.runModules<M>({ /* ... */ }, { terraformTarget: 'skip' }).next();
  expect(await testModuleContainer.isResourceStateEqual()).toBe(true);

  testModuleContainer.registerTags([{ scope: {}, tags: { tag1: 'value1_1', tag2: 'value2' } }]);
  await setup(testModuleContainer);
  const updateTags = (await testModuleContainer.runModules<M>({ /* ... */ }, { terraformTarget: 'skip' }).next()).value!;
  expect(updateTags.hclDiff).toMatchSnapshot();
  expect(testModuleContainer.digestDiffs(updateTags.resourceDiffs)).toMatchInlineSnapshot();
  expect(await testModuleContainer.isResourceStateEqual()).toBe(true);

  // Third step: no registerTags call — the previously registered set is gone.
  await setup(testModuleContainer);
  const deleteTags = (await testModuleContainer.runModules<M>({ /* ... */ }, { terraformTarget: 'skip' }).next()).value!;
  expect(deleteTags.hclDiff).toMatchSnapshot();
  expect(testModuleContainer.digestDiffs(deleteTags.resourceDiffs)).toMatchInlineSnapshot();
  expect(await testModuleContainer.isResourceStateEqual()).toBe(true);
});
```

Every taggable resource the module produces must appear in the update and delete digests. A resource
missing from that list is untagged infrastructure — a real bug, not a snapshot to accept.

## Section 5 — Input changes (`describe('input changes')`)

**Exclusion:** do not write tests for model reference inputs (e.g. `region`, `account`). Those are other
modules' responsibility.

One `it()` per remaining input. Create with the original value, assert state converged, then re-run with
the changed value. Classify the expected result:

| Class           | Behaviour                                        | Expected digest                              |
|-----------------|--------------------------------------------------|----------------------------------------------|
| **Immutable**   | Cannot change; the module or resource throws     | `rejects.toThrowErrorMatchingInlineSnapshot` |
| **Replaceable** | Force-new argument; resource is recreated        | `^` lines                                    |
| **Updatable**   | Provider changes it in place                     | `*` lines                                    |
| **No-op**       | No effect on resources                           | `[]`                                         |

The replaceable case is the one worth a comment, because it encodes provider behaviour:

```ts
await setup(testModuleContainer);
// availability_zone is force-new on aws_subnet → octo emits a REPLACE on the subnet.
const { resourceDiffs } = (
  await testModuleContainer
    .runModules<AwsSimpleSubnetModule>(
      { inputs: { /* ...changed... */ }, moduleId: 'subnet', type: AwsSimpleSubnetModule },
      { terraformTarget: 'skip' },
    )
    .next()
).value!;
expect(testModuleContainer.digestDiffs(resourceDiffs)).toMatchInlineSnapshot();
```

If a `^` appears where you expected `*` (or the reverse), do not update the snapshot — check the
resource's `diffProperties()` against the provider's ForceNew list first. That mismatch is exactly the
bug `octo-aws-cdk-validate-resource.md` §3d hunts.

## Section 6 — ModuleId change (`'should handle moduleId change'`)

Resources are keyed by model identity, not by moduleId, so changing it must be a no-op. Create under
`moduleId: '<name>-1'`, then re-run under `'<name>-2'`.

```ts
expect(updateModuleId.hclDiff).toMatchSnapshot();
expect(testModuleContainer.digestDiffs(updateModuleId.resourceDiffs)).toMatchInlineSnapshot(`[]`);
expect(await testModuleContainer.isResourceStateEqual()).toBe(true);
```

The digest must be exactly `[]`. Anything else means module identity leaked into a resource id.

## Section 7 — Validation (`describe('validation')`)

One `it()` per rule the module enforces. The rejection comes from `.next()`, since that is what drives
the generator:

```ts
describe('validation', () => {
  it('should validate invalid subnet availability zone', async () => {
    await setup(testModuleContainer);
    await expect(
      testModuleContainer
        .runModules<AwsSimpleSubnetModule>(
          { inputs: { /* ...violating... */ }, moduleId: 'subnet', type: AwsSimpleSubnetModule },
          { terraformTarget: 'skip' },
        )
        .next(),
    ).rejects.toThrowErrorMatchingInlineSnapshot(`"Invalid subnet availability zone!"`);
  });
});
```

This section is also where a rendering rule that is not a whole-module concern is pinned, by asserting
on `hclRender` directly rather than by snapshot:

```ts
const { hclRender: hcl } = (await testModuleContainer.runModules<M>(/* ... */).next()).value!;
expect(hcl).toContain('from_port = 0');
expect(hcl).not.toContain('from_port = -1');
```

---

## How to discover what HCL a module produces

### Step 1 — Find the model actions

The module directory has `model/` and `overlay/` sub-folders holding action files
(`add-<model>.model.action.ts`, `update-<model>.model.action.ts`). Open each and read `actionOutputs` —
it lists the resource classes the action creates or touches.

### Step 2 — Trace each resource

For every class in `actionOutputs`, open its source and read the constructor: how the resource id is
formed, what properties it stores, and what its `declare parents` tuple is.

### Step 3 — Read `toHCL()`

Each resource class has a `toHCL()`. It tells you the exact TF blocks the resource emits, which
arguments are conditional, which parents are wired by `getRef` versus `explicitParents`, and what goes
into `output()`. That is enough to check a generated `hclRender` snapshot line by line instead of
accepting it.

---

## Constraints

When fixing or rewriting an existing test file, treat the following as read-only unless the change is
the direct subject of the fix:

- **Variable names** — preserve exactly as written (e.g. `resultUpdateFilesystemName`, not `resultUpdate`).
- **Input values** — preserve original input values.

Only change what the fix actually requires. Snapshot churn from an unnecessary rename is noise in the
one place a reviewer most needs signal.

## Running

`octo-aws-cdk` imports `octo` from `dist`. Rebuild it whenever `packages/octo` changed:

```bash
npx nx run @quadnix/octo:build
npx nx run @quadnix/octo-aws-cdk:test
```

## Checklist

- [ ] `beforeEach` constructs `new TestModuleContainer(container)` and calls both
      `registerTerraformConfig()` and `registerTerraformProvider()`.
- [ ] Every `runModules()` passes `terraformTarget: 'skip'`.
- [ ] `setup()` is called before every `runModules()`, not just the first.
- [ ] Seeded resources that get referenced carry `terraform: true`.
- [ ] Every `runModules()` is followed by `expect(await testModuleContainer.isResourceStateEqual()).toBe(true)`.
- [ ] Every step after the first asserts `hclDiff`; the smoke test asserts `hclRender` inline.
- [ ] Every `resourceDiffs` assertion goes through `digestDiffs()` with an inline snapshot.
- [ ] Section 2 ends with a `hidden: true` delete step.
- [ ] Section 4's update and delete digests list every taggable resource the module produces.
- [ ] Section 5 has one test per non-reference input, correctly classified — and a `^` was verified
      against the provider's ForceNew list, not merely accepted.
- [ ] Section 6's digest is exactly `[]`.
- [ ] Section 7 has one test per validation rule the module enforces.
- [ ] All inline snapshots populated via `--updateSnapshot`, then read before committing.
- [ ] No variable names or input values changed beyond what the fix required.
