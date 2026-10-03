import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
  OverlayActionExceptionTransactionError,
  hasNodeName,
} from '@quadnix/octo';
import { AlbSchema } from '../../../../../../resources/alb/index.schema.js';
import type { CloudFrontDistribution } from '../../../../../../resources/cloudfront-distribution/index.js';
import type { AwsCloudFrontServiceModule } from '../../../aws-cloudfront-service.module.js';
import { AwsCloudFrontAlbOriginOverlay } from '../aws-cloudfront-alb-origin.overlay.js';

/**
 * @internal
 */
@Action(AwsCloudFrontAlbOriginOverlay)
export class AddAwsCloudFrontAlbOriginOverlayAction implements IModelAction<AwsCloudFrontServiceModule> {
  /**
   * @internal
   */
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsCloudFrontAlbOriginOverlay &&
      hasNodeName(diff.node, 'aws-cloudfront-alb-origin-overlay') &&
      diff.field === 'overlayId'
    );
  }

  /**
   * @internal
   */
  async handle(
    diff: Diff<AwsCloudFrontAlbOriginOverlay>,
    actionInputs: EnhancedModuleSchema<AwsCloudFrontServiceModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const { originId } = diff.node.properties;
    const { distributionName } = actionInputs.inputs;
    const [, matchingAlbAnchor] = diff.node.anchors;
    const { albName } = matchingAlbAnchor.getSchemaInstance().properties;

    const cloudFrontDistribution = actionInputs.resources[`cloudfront-${distributionName}`] as CloudFrontDistribution;

    // Find the ALB this overlay serves, through the ALB anchor it joins.
    const [matchingAlb] = await matchingAlbAnchor
      .getActual()
      .getParent()
      .getResourcesMatchingSchema(AlbSchema, [{ key: 'Name', value: albName }], [], { searchBoundaryMembers: false });
    if (!matchingAlb) {
      throw new OverlayActionExceptionTransactionError(`No ALB found for "${albName}"!`, diff, this.constructor.name);
    }

    // Read the ALB's DNS name into the distribution.
    cloudFrontDistribution.addAlbOrigin(originId, matchingAlb);
    actionOutputs[cloudFrontDistribution.resourceId] = cloudFrontDistribution;

    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsCloudFrontAlbOriginOverlayAction>(AddAwsCloudFrontAlbOriginOverlayAction)
export class AddAwsCloudFrontAlbOriginOverlayActionFactory {
  private static instance: AddAwsCloudFrontAlbOriginOverlayAction;

  /**
   * @internal
   */
  static async create(): Promise<AddAwsCloudFrontAlbOriginOverlayAction> {
    if (!this.instance) {
      this.instance = new AddAwsCloudFrontAlbOriginOverlayAction();
    }
    return this.instance;
  }
}
