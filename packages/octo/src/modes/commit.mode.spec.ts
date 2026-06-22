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

    const { modelTransaction } = await commit(app, { outputs: testModes.outputs });

    expect(Array.isArray(modelTransaction)).toBe(true);

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

  it('should error when a module has no provided outputs', async () => {
    const { app } = await testModes.createResourceGraph();

    await expect(commit(app, { outputs: testModes.outputs })).rejects.toThrow(/No terraform outputs provided/);
  });
});
