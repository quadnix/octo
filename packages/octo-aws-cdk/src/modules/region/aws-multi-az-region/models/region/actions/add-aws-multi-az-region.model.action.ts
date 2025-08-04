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
import type { AwsMultiAzRegionModule } from '../../../aws-multi-az-region.module.js';
import { AwsMultiAzRegion } from '../aws-multi-az-region.model.js';

/**
 * @internal
 */
@Action(AwsMultiAzRegion)
export class AddAwsMultiAzRegionModelAction implements IModelAction<AwsMultiAzRegionModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsMultiAzRegion &&
      hasNodeName(diff.node, 'region') &&
      diff.field === 'regionId'
    );
  }

  async handle(
    diff: Diff<AwsMultiAzRegion>,
    actionInputs: EnhancedModuleSchema<AwsMultiAzRegionModule>,
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
@Factory<AddAwsMultiAzRegionModelAction>(AddAwsMultiAzRegionModelAction)
export class AddAwsMultiAzRegionModelActionFactory {
  private static instance: AddAwsMultiAzRegionModelAction;

  static async create(): Promise<AddAwsMultiAzRegionModelAction> {
    if (!this.instance) {
      this.instance = new AddAwsMultiAzRegionModelAction();
    }
    return this.instance;
  }
}
