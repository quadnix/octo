import { ATerraformResource, Diff, DiffAction, DiffUtility, Resource, type TerraformModuleScope } from '@quadnix/octo';
import { CloudWatchLogGroupSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<CloudWatchLogGroup>('@octo', 'cloudwatch-log-group', CloudWatchLogGroupSchema, {
  destroyLosesData: true,
  uniqueProperties: [{ path: 'logGroupName', within: ['awsAccountId', 'awsRegionId'] }],
})
export class CloudWatchLogGroup extends ATerraformResource<CloudWatchLogGroupSchema, CloudWatchLogGroup> {
  declare parents: [];
  declare properties: CloudWatchLogGroupSchema['properties'];
  declare response: CloudWatchLogGroupSchema['response'];

  /**
   * @internal
   */
  constructor(resourceId: string, properties: CloudWatchLogGroupSchema['properties']) {
    super(resourceId, properties, []);
  }

  /**
   * A log group belongs to one account and one region, and its name is its identity. Its retention
   * changes in place.
   *
   * @internal
   */
  override async diffProperties(previous: CloudWatchLogGroup): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties, ['retentionInDays'])) {
      return [
        new Diff(
          this,
          DiffAction.REPLACE,
          'resourceId',
          this.getContext(),
          'the account, region and name are force-new on aws_cloudwatch_log_group; a change recreates it',
        ),
      ];
    }

    if (previous.properties.retentionInDays !== this.properties.retentionInDays) {
      return [new Diff(this, DiffAction.UPDATE, 'properties', this.properties)];
    }

    return [];
  }

  /**
   * @internal
   */
  override async toHCL(terraform: TerraformModuleScope): Promise<void> {
    const logGroupOctoResource = terraform.addOctoTerraformResource(this as CloudWatchLogGroup, {
      provider: { accountId: this.properties.awsAccountId, regionId: this.properties.awsRegionId },
    });

    const logGroupTFResource = logGroupOctoResource.addTerraformResource('aws_cloudwatch_log_group', this.resourceId, {
      name: this.properties.logGroupName,
      retention_in_days: this.properties.retentionInDays,
    });

    logGroupOctoResource.output({
      Arn: terraform.raw(`${logGroupTFResource.address}.arn`),
      LogGroupName: terraform.raw(`${logGroupTFResource.address}.name`),
    });

    if (Object.keys(this.tags).length > 0) {
      logGroupTFResource.attribute('tags', this.tags);
    }
  }
}
