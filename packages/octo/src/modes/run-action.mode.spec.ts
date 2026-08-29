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

  it('should hand the action the tags the resource carries', async () => {
    const { app, igw } = await testModes.createResourceGraph();
    igw.tags['Owner'] = 'platform-team';

    await runAction(app, { inputs: { 'vpc-1.VpcId': 'vpc-0real' }, resourceId: 'igw-1' });

    const handledNode = testModes.igwActionHandledDiffs[0].node as UnknownResource;
    expect(handledNode.tags).toEqual({ Owner: 'platform-team' });
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

  // Terraform's `data "external"` protocol takes a JSON object of strings and nothing else, so a
  // response carrying anything else fails the apply rather than this command.
  describe('the flat-string response contract', () => {
    it('should coerce non-string response values to strings', async () => {
      testModes.igwResponse = { count: 3, enabled: true, igwId: 'igw-0real', port: 80 };
      const { app } = await testModes.createResourceGraph();

      const result = await runAction(app, {
        inputs: { 'vpc-1.VpcId': 'vpc-0real' },
        resourceId: 'igw-1',
      });

      expect(result.response).toEqual({ count: '3', enabled: 'true', igwId: 'igw-0real', port: '80' });
    });

    // The noop path is not covered here: its response comes from committed octo state, which
    // `commit` has already flattened to strings, so no fixture can put a non-string into it.

    it('should reject a null response value rather than emitting "null"', async () => {
      testModes.igwResponse = { igwId: 'igw-0real', vpcId: null };
      const { app } = await testModes.createResourceGraph();

      await expect(runAction(app, { inputs: { 'vpc-1.VpcId': 'vpc-0real' }, resourceId: 'igw-1' })).rejects.toThrow(
        'Resource "igw-1" returned null response values: vpcId!',
      );
    });
  });

  // Terraform replaces a null_resource by destroying and recreating it, so it calls back twice for
  // one change. The record is how the second call learns the first one already did the work.
  describe('the applied state record', () => {
    it('should record what the action made of the resource', async () => {
      const { app } = await testModes.createResourceGraph();

      await runAction(app, { inputs: { 'vpc-1.VpcId': 'vpc-0real' }, resourceId: 'igw-1' });

      await expect(testModes.stateManagementService.getExternalResourceState('igw-1')).resolves.toEqual({
        inputs: { 'vpc-1.VpcId': 'vpc-0real' },
        properties: { Type: 'internet-gateway' },
        response: { igwId: 'igw-0real' },
      });
    });

    it('should record the response where a later plan reads it', async () => {
      const { app } = await testModes.createResourceGraph();

      await runAction(app, { inputs: { 'vpc-1.VpcId': 'vpc-0real' }, resourceId: 'igw-1' });

      await expect(testModes.stateManagementService.getResourceResponse('igw-1')).resolves.toEqual({
        igwId: 'igw-0real',
      });
    });

    it('should run no action on the second call for the same change', async () => {
      const { app } = await testModes.createResourceGraph({ save: true });
      await commitResources({ skipAddActualResource: true });
      await recreateDesiredGraph({ igwType: 'internet-gateway-v2' });

      const first = await runAction(app, { inputs: { 'vpc-1.VpcId': 'vpc-0real' }, resourceId: 'igw-1' });
      const handledOnFirstCall = testModes.igwActionHandledDiffs.length;

      const second = await runAction(app, { inputs: { 'vpc-1.VpcId': 'vpc-0real' }, resourceId: 'igw-1' });

      expect(first.action).toBe('update');
      expect(handledOnFirstCall).toBeGreaterThan(0);
      expect(second.action).toBe('noop');
      expect(testModes.igwActionHandledDiffs).toHaveLength(handledOnFirstCall);
    });

    it('should run the action again when the desired state moves on', async () => {
      const { app } = await testModes.createResourceGraph({ save: true });
      await commitResources({ skipAddActualResource: true });
      await recreateDesiredGraph({ igwType: 'internet-gateway-v2' });
      await runAction(app, { inputs: { 'vpc-1.VpcId': 'vpc-0real' }, resourceId: 'igw-1' });

      const desiredIgw = testModes.resourceDataRepository
        .getNewResourcesByProperties()
        .find((r) => r.resourceId === 'igw-1')!;
      desiredIgw.properties['Type'] = 'internet-gateway-v3';

      const result = await runAction(app, { inputs: { 'vpc-1.VpcId': 'vpc-0real' }, resourceId: 'igw-1' });

      expect(result.action).toBe('update');
      await expect(testModes.stateManagementService.getExternalResourceState('igw-1')).resolves.toEqual({
        inputs: { 'vpc-1.VpcId': 'vpc-0real' },
        properties: { Type: 'internet-gateway-v3' },
        response: { igwId: 'igw-0real' },
      });
    });

    it('should clear the record when the action deletes the resource', async () => {
      const { app } = await testModes.createResourceGraph({ save: true });
      await commitResources({ skipAddActualResource: true });
      await recreateDesiredGraph({ withoutChildren: true });

      await runAction(app, { inputs: { 'vpc-1.VpcId': 'vpc-0real' }, resourceId: 'igw-1' });

      await expect(testModes.stateManagementService.getResourceResponse('igw-1')).resolves.toBeUndefined();
    });
  });

  it('should throw, not silently do nothing, when no action matches the diff', async () => {
    const { app } = await testModes.createResourceGraph({ save: true });
    await commitResources({ skipAddActualResource: true });
    // An author who handles only add/delete, leaving a property change unhandled.
    testModes.igwActionFilter = (diff): boolean => diff.field === 'resourceId';
    await recreateDesiredGraph({ igwType: 'changed-type' });

    await expect(runAction(app, { resourceId: 'igw-1' })).rejects.toThrow('No matching action given for diff!');
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
});
