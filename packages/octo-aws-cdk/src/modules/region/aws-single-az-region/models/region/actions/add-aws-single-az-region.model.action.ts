import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
  MatchingResource,
  hasNodeName,
} from '@quadnix/octo';
import { InternetGateway } from '../../../../../../resources/internet-gateway/index.js';
import { Vpc } from '../../../../../../resources/vpc/index.js';
import type { AwsSingleAzRegionModule } from '../../../aws-single-az-region.module.js';
import { AwsSingleAzRegion } from '../aws-single-az-region.model.js';

/**
 * @internal
 */
@Action(AwsSingleAzRegion)
export class AddAwsSingleAzRegionModelAction implements IModelAction<AwsSingleAzRegionModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsSingleAzRegion &&
      hasNodeName(diff.node, 'region') &&
      diff.field === 'regionId'
    );
  }

  async handle(
    diff: Diff<AwsSingleAzRegion>,
    actionInputs: EnhancedModuleSchema<AwsSingleAzRegionModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const awsRegion = diff.node;
    const regionId = awsRegion.regionId;

    const vpcCidrBlock = actionInputs.inputs.vpcCidrBlock;
    const awsAccountId = actionInputs.inputs.account.accountId;

    // Create VPC.
    const vpc = new Vpc(`vpc-${regionId}`, {
      awsAccountId,
      awsAvailabilityZones: [...awsRegion.awsRegionAZs],
      awsRegionId: awsRegion.awsRegionId,
      CidrBlock: vpcCidrBlock,
      InstanceTenancy: 'default',
    });

    // Create Internet Gateway.
    const internetGateway = new InternetGateway(
      `igw-${regionId}`,
      { awsAccountId, awsRegionId: awsRegion.awsRegionId, internetGatewayName: 'default' },
      [new MatchingResource(vpc)],
    );

    actionOutputs[vpc.resourceId] = vpc;
    actionOutputs[internetGateway.resourceId] = internetGateway;
    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsSingleAzRegionModelAction>(AddAwsSingleAzRegionModelAction)
export class AddAwsSingleAzRegionModelActionFactory {
  private static instance: AddAwsSingleAzRegionModelAction;

  static async create(): Promise<AddAwsSingleAzRegionModelAction> {
    if (!this.instance) {
      this.instance = new AddAwsSingleAzRegionModelAction();
    }
    return this.instance;
  }
}
