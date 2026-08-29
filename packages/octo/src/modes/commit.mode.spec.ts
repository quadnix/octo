import type { UnknownResource } from '../app.type.js';
import { TestModes, TfVpcResource } from '../utilities/test-helpers/test-modes.js';
import { commitResources } from '../utilities/test-helpers/test-resources.js';
import { applyModelTransaction } from './apply-transaction.js';
import { commit } from './commit.mode.js';

describe('commit()', () => {
  let testModes: TestModes;

  beforeEach(async () => {
    testModes = await TestModes.create();
  });

  afterEach(async () => {
    await testModes.teardown();
  });

  it('should populate responses from tfstate outputs and sync the actual graph', async () => {
    const { app } = await testModes.createResourceGraph();

    testModes.writeTfState('region-module', { 'igw-1': { igwId: 'igw-0real' }, 'vpc-1-VpcId': 'vpc-0real' });
    testModes.writeTfState('sg-module', { 'sg-1-SgId': 'sg-0real' });

    const transaction = await applyModelTransaction(app);
    const { modelTransaction, warnings } = await commit({ outputs: testModes.outputs, transaction });

    expect(Array.isArray(modelTransaction)).toBe(true);
    // Every supplied folder is in intent — no not-tracked warns, even with nothing committed yet.
    expect(warnings).toEqual([]);

    // Responses came from tfstate; the external resource's whole-response output expanded per key.
    const newVpc = testModes.resourceDataRepository
      .getNewResourcesByProperties()
      .find((r) => r.resourceId === 'vpc-1')!;
    const newIgw = testModes.resourceDataRepository
      .getNewResourcesByProperties()
      .find((r) => r.resourceId === 'igw-1')!;
    expect(newVpc.response['VpcId']).toBe('vpc-0real');
    expect(newIgw.response['igwId']).toBe('igw-0real');

    // actual ← new, so the actual graph carries the same responses.
    const actualVpc = testModes.resourceDataRepository
      .getActualResourcesByProperties()
      .find((r) => r.resourceId === 'vpc-1')!;
    expect(actualVpc.response['VpcId']).toBe('vpc-0real');
  });

  it('should coerce non-string output values to strings', async () => {
    const { app } = await testModes.createResourceGraph();

    testModes.writeTfState('region-module', { 'igw-1': { igwId: 'igw-0real' }, 'vpc-1-VpcId': 12345 });
    testModes.writeTfState('sg-module', { 'sg-1-SgId': 'sg-0real' });

    const transaction = await applyModelTransaction(app);
    await commit({ outputs: testModes.outputs, transaction });

    const newVpc = testModes.resourceDataRepository
      .getNewResourcesByProperties()
      .find((r) => r.resourceId === 'vpc-1')!;
    expect(newVpc.response['VpcId']).toBe('12345');
  });

  it('should error on missing outputs without mutating responses', async () => {
    const { app } = await testModes.createResourceGraph();

    testModes.writeTfState('region-module', { 'vpc-1-VpcId': 'vpc-0real' });
    testModes.writeTfState('sg-module', {});

    const transaction = await applyModelTransaction(app);
    await expect(commit({ outputs: testModes.outputs, transaction })).rejects.toThrow(
      /missing terraform outputs.*region-module\/igw-1.*Octo state is unchanged/,
    );

    const newVpc = testModes.resourceDataRepository
      .getNewResourcesByProperties()
      .find((r) => r.resourceId === 'vpc-1')!;
    expect(newVpc.response['VpcId']).toBeUndefined();
  });

  it('should error on a null output value without mutating responses', async () => {
    const { app } = await testModes.createResourceGraph();

    testModes.writeTfState('region-module', { 'igw-1': { igwId: 'igw-0real' }, 'vpc-1-VpcId': null });
    testModes.writeTfState('sg-module', { 'sg-1-SgId': 'sg-0real' });

    const transaction = await applyModelTransaction(app);
    await expect(commit({ outputs: testModes.outputs, transaction })).rejects.toThrow(
      /null terraform outputs.*region-module\/vpc-1-VpcId.*Octo state is unchanged/,
    );

    const newVpc = testModes.resourceDataRepository
      .getNewResourcesByProperties()
      .find((r) => r.resourceId === 'vpc-1')!;
    expect(newVpc.response['VpcId']).toBeUndefined();
  });

  it('should error on a null value inside an external whole-response output', async () => {
    const { app } = await testModes.createResourceGraph();

    testModes.writeTfState('region-module', { 'igw-1': { igwId: null }, 'vpc-1-VpcId': 'vpc-0real' });
    testModes.writeTfState('sg-module', { 'sg-1-SgId': 'sg-0real' });

    const transaction = await applyModelTransaction(app);
    await expect(commit({ outputs: testModes.outputs, transaction })).rejects.toThrow(
      /null terraform outputs.*region-module\/igw-1\.igwId/,
    );
  });

  it('should error when a module has no provided outputs', async () => {
    const { app } = await testModes.createResourceGraph();

    const transaction = await applyModelTransaction(app);
    await expect(commit({ outputs: testModes.outputs, transaction })).rejects.toThrow(/No terraform outputs provided/);
  });

  it('should warn on outputs for a folder octo does not track without rejecting', async () => {
    const { app } = await testModes.createResourceGraph();

    testModes.writeTfState('region-module', { 'igw-1': { igwId: 'igw-0real' }, 'vpc-1-VpcId': 'vpc-0real' });
    testModes.writeTfState('sg-module', { 'sg-1-SgId': 'sg-0real' });
    // A folder octo never wrote (not in intent, not in the committed folder record).
    testModes.writeTfState('user-module', { anything: 'x' });

    const transaction = await applyModelTransaction(app);
    const { warnings } = await commit({ outputs: testModes.outputs, transaction });

    expect(warnings).toEqual([
      { message: expect.stringContaining('folder "user-module", which octo does not track'), moduleId: 'user-module' },
    ]);
    // The tracked modules still committed.
    const actualVpc = testModes.resourceDataRepository
      .getActualResourcesByProperties()
      .find((r) => r.resourceId === 'vpc-1')!;
    expect(actualVpc.response['VpcId']).toBe('vpc-0real');
  });

  it('should not demand or warn about outputs for a committed-then-deleted folder', async () => {
    const { app } = await testModes.createResourceGraph();

    testModes.writeTfState('region-module', { 'igw-1': { igwId: 'igw-0real' }, 'vpc-1-VpcId': 'vpc-0real' });
    testModes.writeTfState('sg-module', { 'sg-1-SgId': 'sg-0real' });
    // legacy-module is in the committed folder record but not in intent: an emptied folder. Its
    // (empty) outputs are tracked — no not-tracked warn — and never demanded.
    testModes.writeTfState('legacy-module', {});

    const transaction = await applyModelTransaction(app);
    const { warnings } = await commit({
      outputs: testModes.outputs,
      previousFolders: [{ hasExternalResources: false, moduleId: 'legacy-module', providers: [] }],
      transaction,
    });

    expect(warnings).toEqual([]);
  });

  // Terraform cannot delete an external resource: octo deletes by removing the resource block from
  // the configuration, and terraform will not run a `when = destroy` provisioner for a resource
  // that is no longer in the configuration. Commit is what tells the resource to go, so that the
  // real thing does not outlive both state files.
  describe('deleting an external resource', () => {
    // The committed graph, re-created without the external igw, so a fresh boot computes its delete.
    async function recreateDesiredGraphWithoutIgw(): Promise<void> {
      testModes.resourceDataRepository.addNewResource(new TfVpcResource('vpc-1', { CidrBlock: '10.0.0.0/16' }));
    }

    it('should run the delete action of an external resource removed from intent', async () => {
      const { app } = await testModes.createResourceGraph({ save: true });
      await commitResources({ skipAddActualResource: true });
      await recreateDesiredGraphWithoutIgw();

      testModes.writeTfState('region-module', { 'vpc-1-VpcId': 'vpc-0real' });
      testModes.writeTfState('sg-module', {});

      const transaction = await applyModelTransaction(app);
      await commit({ outputs: testModes.outputs, transaction });

      const deletedDiffs = testModes.igwActionHandledDiffs.filter((d) => d.action === 'delete');
      expect(deletedDiffs).toHaveLength(1);
      expect((deletedDiffs[0].node as UnknownResource).resourceId).toBe('igw-1');
    });

    // A delete that throws must not be recorded as done: octo state still carries the resource, so
    // the next run diffs it again and retries rather than forgetting it.
    it('should abort the commit and leave the resource in state when the delete fails', async () => {
      const { app } = await testModes.createResourceGraph({ save: true });
      await commitResources({ skipAddActualResource: true });
      await recreateDesiredGraphWithoutIgw();

      testModes.writeTfState('region-module', { 'vpc-1-VpcId': 'vpc-0real' });
      testModes.writeTfState('sg-module', {});
      testModes.igwActionHandler = async (): Promise<never> => {
        throw new Error('the SDK refused to delete it');
      };

      const transaction = await applyModelTransaction(app);
      await expect(commit({ outputs: testModes.outputs, transaction })).rejects.toThrow(
        'the SDK refused to delete it',
      );

      expect(
        testModes.resourceDataRepository.getActualResourcesByProperties().find((r) => r.resourceId === 'igw-1'),
      ).toBeDefined();
    });

    // An external delete runs over the whole diff set, after terraform, outside terraform's own
    // ordering. An apply that stopped short can leave live infrastructure pointing at the resource
    // being deleted, so an unconfirmed apply defers the delete rather than guessing.
    it('should defer the delete when a module did not apply, and keep the resource in state', async () => {
      const { app } = await testModes.createResourceGraph({ save: true });
      await commitResources({ skipAddActualResource: true });
      await recreateDesiredGraphWithoutIgw();
      // A second folder that renders a resource and reports no outputs at all: it never applied.
      await testModes.addResource('sg-module', new TfVpcResource('vpc-2', { CidrBlock: '10.1.0.0/16' }));

      testModes.writeTfState('region-module', { 'vpc-1-VpcId': 'vpc-0real' });

      const transaction = await applyModelTransaction(app);
      const { warnings } = await commit({ outputs: testModes.outputs, partial: true, transaction });

      expect(testModes.igwActionHandledDiffs.filter((d) => d.action === 'delete')).toHaveLength(0);
      expect(warnings).toEqual(
        expect.arrayContaining([
          { message: expect.stringContaining('1 external resource(s) were not deleted') as unknown as string },
        ]),
      );
      expect(
        testModes.resourceDataRepository.getActualResourcesByProperties().find((r) => r.resourceId === 'igw-1'),
      ).toBeDefined();
    });

    // The gate is the evidence, not the flag: a partial commit that confirmed every module knows
    // nothing is left pointing at the resource, so the delete runs.
    it('should run the delete on a partial commit that confirmed every module', async () => {
      const { app } = await testModes.createResourceGraph({ save: true });
      await commitResources({ skipAddActualResource: true });
      await recreateDesiredGraphWithoutIgw();

      testModes.writeTfState('region-module', { 'vpc-1-VpcId': 'vpc-0real' });
      testModes.writeTfState('sg-module', {});

      const transaction = await applyModelTransaction(app);
      await commit({ outputs: testModes.outputs, partial: true, transaction });

      expect(testModes.igwActionHandledDiffs.filter((d) => d.action === 'delete')).toHaveLength(1);
    });
  });
});
