import { existsSync } from 'node:fs';
import { join } from 'path';
import { RefusingTfResource, TestModes } from '../utilities/test-helpers/test-modes.js';
import { commitResources } from '../utilities/test-helpers/test-resources.js';
import { applyModelTransaction } from './apply-transaction.js';
import { generate } from './generate.mode.js';
import { validate } from './validate.mode.js';

describe('applyModelTransaction()', () => {
  let testModes: TestModes;

  beforeEach(async () => {
    testModes = await TestModes.create();
  });

  afterEach(async () => {
    await testModes.teardown();
  });

  it('builds the resource graph once, returning the model transaction and resource diffs', async () => {
    const { app } = await testModes.createResourceGraph();

    const { modelTransaction, resourceDiffs } = await applyModelTransaction(app);

    expect(Array.isArray(modelTransaction)).toBe(true);
    expect(
      resourceDiffs
        .flat()
        .filter((d) => d.action === 'add' && d.field === 'resourceId')
        .map((d) => d.node.getContext()),
    ).toEqual([expect.stringContaining('vpc-1'), expect.stringContaining('igw-1'), expect.stringContaining('sg-1')]);
  });

  it('a single build feeds both generate and validate', async () => {
    const { app } = await testModes.createResourceGraph();
    testModes.writePlan('region-module', [
      { actions: ['create'], address: 'aws_vpc.vpc-1' },
      { actions: ['create'], address: 'null_resource.igw-1' },
    ]);
    testModes.writePlan('sg-module', [{ actions: ['create'], address: 'aws_security_group.sg-1' }]);

    // Build once, then hand the same transaction to two modes — the way a single-process driver
    // (runModules) does — so the graph is derived a single time rather than once per mode.
    const transaction = await applyModelTransaction(app);

    await generate({ outputDir: testModes.outputDir, transaction });
    expect(existsSync(join(testModes.outputDir, 'region-module'))).toBe(true);
    expect(existsSync(join(testModes.outputDir, 'sg-module'))).toBe(true);

    const result = await validate({ persistedMappings: new Map(), plans: testModes.plans, transaction });
    expect(result.errors).toEqual([]);
    expect(result.pass).toBe(true);
  });

  it('throws on a refusing diff before any terraform is generated', async () => {
    RefusingTfResource.toHCLInvocations.length = 0;

    // Commit a graph whose resource refuses property updates, then re-stage it with a changed
    // property so the next diff throws while the transaction is being built.
    const { app } = await testModes.createRefusingResourceGraph({ save: true });
    await commitResources({ skipAddActualResource: true });
    testModes.resourceDataRepository.addNewResource(new RefusingTfResource('refuse-1', { CidrBlock: '10.9.0.0/16' }));

    await expect(applyModelTransaction(app)).rejects.toThrow(/Cannot update RefusingTfResource/);

    // The diff gated the build: terraform generation (toHCL) never ran, so no bad graph reaches a mode.
    expect(RefusingTfResource.toHCLInvocations).toHaveLength(0);
  });
});
