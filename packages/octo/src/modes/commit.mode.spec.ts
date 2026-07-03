import { TestModes } from '../utilities/test-helpers/test-modes.js';
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

    const { modelTransaction, warnings } = await commit(app, { outputs: testModes.outputs });

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

    await commit(app, {
      outputs: testModes.outputs,
    });

    const newVpc = testModes.resourceDataRepository
      .getNewResourcesByProperties()
      .find((r) => r.resourceId === 'vpc-1')!;
    expect(newVpc.response['VpcId']).toBe('12345');
  });

  it('should error on missing outputs without mutating responses', async () => {
    const { app } = await testModes.createResourceGraph();

    testModes.writeTfState('region-module', { 'vpc-1-VpcId': 'vpc-0real' });
    testModes.writeTfState('sg-module', {});

    await expect(commit(app, { outputs: testModes.outputs })).rejects.toThrow(
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

    await expect(commit(app, { outputs: testModes.outputs })).rejects.toThrow(
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

    await expect(commit(app, { outputs: testModes.outputs })).rejects.toThrow(
      /null terraform outputs.*region-module\/igw-1\.igwId/,
    );
  });

  it('should error when a module has no provided outputs', async () => {
    const { app } = await testModes.createResourceGraph();

    await expect(commit(app, { outputs: testModes.outputs })).rejects.toThrow(/No terraform outputs provided/);
  });

  it('should warn on outputs for a folder octo does not track without rejecting', async () => {
    const { app } = await testModes.createResourceGraph();

    testModes.writeTfState('region-module', { 'igw-1': { igwId: 'igw-0real' }, 'vpc-1-VpcId': 'vpc-0real' });
    testModes.writeTfState('sg-module', { 'sg-1-SgId': 'sg-0real' });
    // A folder octo never wrote (not in intent, not in the committed folder record).
    testModes.writeTfState('user-module', { anything: 'x' });

    const { warnings } = await commit(app, { outputs: testModes.outputs });

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

    const { warnings } = await commit(app, {
      outputs: testModes.outputs,
      previousFolders: [{ hasExternalResources: false, moduleId: 'legacy-module', providers: [] }],
    });

    expect(warnings).toEqual([]);
  });
});
