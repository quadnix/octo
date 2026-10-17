import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { ANodeAction, Action, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { CloudFrontClientFactory } from '../../../factories/aws-client.factory.js';
import { CloudFrontInvalidation } from '../cloudfront-invalidation.resource.js';
import type { CloudFrontInvalidationSchema } from '../index.schema.js';

/**
 * Drops what the distribution's edge locations are holding, the first time.
 *
 * Terraform runs this mid-apply, through the `local-exec` provisioner octo generates for an external
 * resource, once the distribution it depends on exists and every object behind it has been written.
 *
 * @internal
 */
@Action(CloudFrontInvalidation)
export class AddCloudFrontInvalidationResourceAction
  extends ANodeAction
  implements IResourceAction<CloudFrontInvalidation>
{
  /**
   * @internal
   */
  constructor() {
    super();
  }

  /**
   * @internal
   */
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof CloudFrontInvalidation &&
      hasNodeName(diff.node, 'cloudfront-invalidation') &&
      diff.field === 'resourceId'
    );
  }

  /**
   * @internal
   * @throws If CloudFront rejects the invalidation, or accepts it without reporting an id.
   */
  async handle(diff: Diff<CloudFrontInvalidation>): Promise<CloudFrontInvalidationSchema['response']> {
    // Get properties.
    const cloudFrontInvalidation = diff.node;
    const properties = cloudFrontInvalidation.properties;
    const { response: distributionResponse } = cloudFrontInvalidation.parents[0].getSchemaInstanceInResourceAction();

    // Get instances.
    const cloudFrontClient = await this.container.get<CloudFrontClient, typeof CloudFrontClientFactory>(
      CloudFrontClient,
      { args: [properties.awsAccountId], metadata: { package: '@octo' } },
    );

    // Drop what the edges are holding. This does not wait for the invalidation to finish: AWS takes
    // minutes to propagate one, the API answers as soon as it is accepted, and nothing downstream
    // reads the result, so holding an apply open for it would buy nothing.
    this.log(diff, `Invalidating ${properties.paths.join(', ')} on "${distributionResponse.DistributionId}"`);
    const { Invalidation } = await cloudFrontClient.send(
      new CreateInvalidationCommand({
        DistributionId: distributionResponse.DistributionId,
        InvalidationBatch: {
          // Unique per call, and the only thing stopping AWS from quietly returning an older
          // invalidation instead of running this one.
          CallerReference: `${cloudFrontInvalidation.resourceId}-${properties.contentVersion}`,
          Paths: { Items: [...properties.paths], Quantity: properties.paths.length },
        },
      }),
    );

    if (!Invalidation?.Id) {
      throw new Error(`CloudFront accepted no invalidation for "${distributionResponse.DistributionId}"!`);
    }

    return { InvalidationId: Invalidation.Id };
  }
}

/**
 * @internal
 */
@Factory<AddCloudFrontInvalidationResourceAction>(AddCloudFrontInvalidationResourceAction)
export class AddCloudFrontInvalidationResourceActionFactory {
  private static instance: AddCloudFrontInvalidationResourceAction;

  /**
   * @internal
   */
  static async create(): Promise<AddCloudFrontInvalidationResourceAction> {
    if (!this.instance) {
      this.instance = new AddCloudFrontInvalidationResourceAction();
    }
    return this.instance;
  }
}
