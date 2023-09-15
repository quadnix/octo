import {
  DescribeRegistryCommand,
  ECRClient,
  PutReplicationConfigurationCommand,
  ReplicationDestination,
} from '@aws-sdk/client-ecr';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { Diff, DiffAction, IResourceAction } from '@quadnix/octo';
import { IEcrImageProperties, IEcrImageReplicationMetadata, IEcrImageResponse } from '../ecr-image.interface';
import { EcrImage } from '../ecr-image.resource';

export class UpdateReplicationInEcrImageAction implements IResourceAction {
  readonly ACTION_NAME: string = 'UpdateReplicationInEcrImageAction';

  constructor(private readonly ecrClient: ECRClient, private readonly stsClient: STSClient) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.model.MODEL_NAME === 'ecr-image' &&
      (diff.model as EcrImage).diffMarkers.update?.key === 'replicationsStringified'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const ecrImage = diff.model as EcrImage;
    const replicationAction = ecrImage.diffMarkers.update!.value;
    const properties = ecrImage.properties as unknown as IEcrImageProperties;
    const response = ecrImage.response as unknown as IEcrImageResponse;

    const region = this.ecrClient.config.region as string;
    let replicationRegions: IEcrImageReplicationMetadata['regions'] =
      (response?.replicationsStringified as string)?.length > 0
        ? JSON.parse(response.replicationsStringified).regions
        : [];
    const stsCallerIdentity = await this.stsClient.send(new GetCallerIdentityCommand({}));

    if (replicationAction.toUpperCase() === 'ADD') {
      if (replicationRegions.findIndex((r) => r.awsRegion === region) > -1) {
        return;
      }

      replicationRegions.push({
        awsRegion: region,
        repositoryUri: `${stsCallerIdentity.Account}.dkr.ecr.${region}.amazonaws.com/${properties.imageName}`,
      });
    } else if (replicationAction.toUpperCase() === 'DELETE') {
      if (replicationRegions.findIndex((r) => r.awsRegion === region) === -1) {
        return;
      }

      replicationRegions = replicationRegions.filter((r) => r.awsRegion === region);
    }

    // Get previous replication rules.
    const data = await this.ecrClient.send(new DescribeRegistryCommand({}));

    // Get rule index that matches this image name.
    if (!data.replicationConfiguration) {
      data.replicationConfiguration = { rules: [] };
    }
    const imageReplicationRuleIndex = data.replicationConfiguration.rules!.findIndex(
      (r) => r.repositoryFilters![0].filter === properties.imageName,
    );

    const destinations: ReplicationDestination[] = [];
    for (const replicationRegion of replicationRegions) {
      destinations.push({
        region: replicationRegion.awsRegion,
        registryId: stsCallerIdentity.Account as string,
      });
    }

    if (imageReplicationRuleIndex === -1 && destinations.length > 0) {
      data.replicationConfiguration.rules!.push({
        destinations,
        repositoryFilters: [
          {
            filter: properties.imageName,
            filterType: 'PREFIX_MATCH',
          },
        ],
      });
    } else if (imageReplicationRuleIndex > -1 && destinations.length > 0) {
      data.replicationConfiguration.rules![imageReplicationRuleIndex].destinations = destinations;
    } else if (imageReplicationRuleIndex > -1 && destinations.length === 0) {
      data.replicationConfiguration.rules!.splice(imageReplicationRuleIndex, 1);
    }

    // Update the full set of replication rules.
    await this.ecrClient.send(
      new PutReplicationConfigurationCommand({
        replicationConfiguration: data.replicationConfiguration,
      }),
    );

    // Set response.
    const replications: IEcrImageReplicationMetadata = {
      regions: replicationRegions,
      // eslint-disable-next-line max-len
      serviceRoleForECRReplication: `arn:aws:iam::${stsCallerIdentity.Account}:role/aws-service-role/replication.ecr.amazonaws.com/AWSServiceRoleForECRReplication`,
    };
    response.replicationsStringified = JSON.stringify(replications);
  }
}
