import { writeFile } from 'node:fs/promises';
import { join } from 'path';
import type { UnknownResource } from '../app.type.js';
import { ExternalIgwResource, TestModes, TfSgResource, TfVpcResource } from '../utilities/test-helpers/test-modes.js';
import { commitResources } from '../utilities/test-helpers/test-resources.js';
import { runAction } from './run-action.mode.js';

describe('runAction()', () => {
  let testModes: TestModes;

  beforeEach(async () => {
    testModes = await TestModes.create();
  });

  afterEach(async () => {
    await testModes.teardown();
  });

  // Re-creates the committed desired graph in memory, optionally mutating igw, so a fresh boot
  // computes the intended add/update/delete/noop for igw-1.
  async function recreateDesiredGraph({
    igwType,
    withoutChildren,
  }: {
    igwType?: string;
    withoutChildren?: boolean;
  }): Promise<void> {
    const vpc2 = new TfVpcResource('vpc-1', { CidrBlock: '10.0.0.0/16' });
    testModes.resourceDataRepository.addNewResource(vpc2);
    if (!withoutChildren) {
      const igw2 = new ExternalIgwResource('igw-1', { Type: igwType ?? 'internet-gateway' }, [vpc2]);
      const secGroup2 = new TfSgResource('sg-1', {}, [igw2]);
      testModes.resourceDataRepository.addNewResource(igw2);
      testModes.resourceDataRepository.addNewResource(secGroup2);
    }
  }

  it('should run an add action with injected parent inputs', async () => {
    const { app } = await testModes.createResourceGraph();

    const result = await runAction(app, {
      inputs: { 'vpc-1.VpcId': 'vpc-0real' },
      resourceId: 'igw-1',
    });

    expect(result.action).toBe('add');
    expect(result.resourceId).toBe('igw-1');
    expect(result.response).toEqual({ igwId: 'igw-0real' });

    // The action observed the injected parent response.
    expect(testModes.igwActionHandledDiffs.length).toBeGreaterThan(0);
    const handledNode = testModes.igwActionHandledDiffs[0].node as UnknownResource;
    const parentVpc = handledNode.parents[0] as UnknownResource;
    expect(parentVpc.response['VpcId']).toBe('vpc-0real');
  });

  it('should inject a whole-response parent input passed as one JSON object', async () => {
    const { app } = await testModes.createResourceGraph();

    const result = await runAction(app, {
      inputs: { 'vpc-1': '{"VpcId":"vpc-0whole"}' },
      resourceId: 'igw-1',
    });

    expect(result.action).toBe('add');
    const handledNode = testModes.igwActionHandledDiffs[0].node as UnknownResource;
    const parentVpc = handledNode.parents[0] as UnknownResource;
    expect(parentVpc.response['VpcId']).toBe('vpc-0whole');
  });

  it('should run an update action when resource properties change', async () => {
    const { app } = await testModes.createResourceGraph({ save: true });
    await commitResources({ skipAddActualResource: true });
    await recreateDesiredGraph({ igwType: 'internet-gateway-v2' });

    const result = await runAction(app, {
      inputs: { 'vpc-1.VpcId': 'vpc-0real' },
      resourceId: 'igw-1',
    });

    expect(result.action).toBe('update');
    expect(result.response).toEqual({ igwId: 'igw-0real' });
    expect(testModes.igwActionHandledDiffs.length).toBeGreaterThan(0);
    const handledNode = testModes.igwActionHandledDiffs[0].node as UnknownResource;
    expect((handledNode.parents[0] as UnknownResource).response['VpcId']).toBe('vpc-0real');
  });

  it('should return noop with the current response when nothing changed', async () => {
    const { app } = await testModes.createResourceGraph({ save: true });
    await commitResources({ skipAddActualResource: true });
    await recreateDesiredGraph({});

    const result = await runAction(app, {
      inputs: { 'vpc-1.VpcId': 'vpc-0real' },
      resourceId: 'igw-1',
    });

    expect(result.action).toBe('noop');
    expect(testModes.igwActionHandledDiffs).toHaveLength(0);
  });

  it('should run a delete action when the resource is removed from the desired state', async () => {
    const { app } = await testModes.createResourceGraph({ save: true });
    await commitResources({ skipAddActualResource: true });
    await recreateDesiredGraph({ withoutChildren: true });

    const result = await runAction(app, {
      inputs: { 'vpc-1.VpcId': 'vpc-0real' },
      resourceId: 'igw-1',
    });

    expect(result.action).toBe('delete');
    expect(result.response).toEqual({});
    expect(testModes.igwActionHandledDiffs.length).toBeGreaterThan(0);
  });

  it('should throw when targeting a changed terraform resource', async () => {
    const { app } = await testModes.createResourceGraph();

    await expect(runAction(app, { resourceId: 'vpc-1' })).rejects.toThrow(
      'Resource "vpc-1" is a terraform resource and cannot be run via run-action!',
    );
  });

  it('should throw when targeting an unchanged terraform resource (noop path)', async () => {
    const { app } = await testModes.createResourceGraph({ save: true });
    await commitResources({ skipAddActualResource: true });
    await recreateDesiredGraph({});

    // vpc-1 is unchanged, so it produces no diff — the guard must still reject it.
    await expect(runAction(app, { resourceId: 'vpc-1' })).rejects.toThrow(
      'Resource "vpc-1" is a terraform resource and cannot be run via run-action!',
    );
  });

  it('should support sensitive inputs from a file', async () => {
    const { app } = await testModes.createResourceGraph();

    const inputsFilePath = join(testModes.outputDir, 'inputs.json');
    await writeFile(inputsFilePath, JSON.stringify({ 'vpc-1.VpcId': 'vpc-0sensitive' }), 'utf-8');

    const result = await runAction(app, {
      inputsFilePath,
      resourceId: 'igw-1',
    });

    expect(result.action).toBe('add');
    const handledNode = testModes.igwActionHandledDiffs[0].node as UnknownResource;
    expect((handledNode.parents[0] as UnknownResource).response['VpcId']).toBe('vpc-0sensitive');
  });
});
