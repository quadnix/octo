import { ActionInputs, ActionOutputs, Diff, Module } from '@quadnix/octo';
import { AwsRegion } from '../models/region/aws.region.model.js';
import { Efs } from '../resources/efs/efs.resource.js';
import { SharedEfs } from '../resources/efs/efs.shared-resource.js';
import { SecurityGroup } from '../resources/security-group/security-group.resource.js';
import { Subnet } from '../resources/subnet/subnet.resource.js';

@Module({
  postModelActionHandles: [
    {
      ACTION_NAME: 'AddRegionModelAction',
      callback: async (args: [Diff, ActionInputs], output: ActionOutputs): Promise<ActionOutputs> => {
        const awsRegion = args[0].model as AwsRegion;
        const regionId = awsRegion.regionId;

        const privateSubnet1 = output[`subnet-${regionId}-private-1`] as Subnet;
        const internalOpenSG = output[`sec-grp-${regionId}-internal-open`] as SecurityGroup;

        // Create EFS.
        const efs = new Efs(
          `efs-${regionId}-filesystem`,
          { awsRegionId: awsRegion.awsRegionId, regionId: awsRegion.regionId },
          [privateSubnet1, internalOpenSG],
        );
        const sharedEfs = new SharedEfs('shared-efs-filesystem', {}, [efs]);

        output[efs.resourceId] = efs;
        output[sharedEfs.resourceId] = sharedEfs;
        return output;
      },
    },
  ],
  preModelActionHandles: [
    {
      ACTION_NAME: 'DeleteRegionModelAction',
      callback: async (args: [Diff, ActionInputs], output: ActionOutputs): Promise<ActionOutputs> => {
        const awsRegion = args[0].model as AwsRegion;
        const regionId = awsRegion.regionId;

        const sharedEfs = args[1]['resource.shared-efs-filesystem'] as SharedEfs;
        const efs = args[1][`resource.efs-${regionId}-filesystem`] as Efs;
        const internalOpenSG = args[1][`resource.sec-grp-${regionId}-internal-open`] as SecurityGroup;
        const privateSubnet1 = args[1][`resource.subnet-${regionId}-private-1`] as Subnet;

        // Delete EFS.
        efs.removeRelationship(privateSubnet1);
        efs.removeRelationship(internalOpenSG);
        efs.removeRelationship(sharedEfs);
        efs.markDeleted();

        output[efs.resourceId] = efs;
        return output;
      },
      collectInput: (diff: Diff): string[] => {
        const { regionId } = diff.model as AwsRegion;
        return [`resource.efs-${regionId}-filesystem`, 'resource.shared-efs-filesystem'];
      },
    },
  ],
})
export class AwsRegionSharedEfsModule {}
