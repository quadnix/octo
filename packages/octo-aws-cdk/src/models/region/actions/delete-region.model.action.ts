import {
  Action,
  type ActionInputs,
  type ActionOutputs,
  Diff,
  DiffAction,
  Factory,
  type IModelAction,
  ModelType,
} from '@quadnix/octo';
import { InternetGateway } from '../../../resources/internet-gateway/internet-gateway.resource.js';
import { SecurityGroup } from '../../../resources/security-group/security-group.resource.js';
import { Vpc } from '../../../resources/vpc/vpc.resource.js';
import { AwsRegion } from '../aws.region.model.js';

@Action(ModelType.MODEL)
export class DeleteRegionModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'DeleteRegionModelAction';

  collectInput(diff: Diff): string[] {
    const { regionId } = diff.model as AwsRegion;

    return [`resource.vpc-${regionId}`, `resource.igw-${regionId}`, `resource.sec-grp-${regionId}-access`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.model instanceof AwsRegion &&
      diff.model.MODEL_NAME === 'region' &&
      diff.field === 'regionId'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): Promise<ActionOutputs> {
    const { regionId } = diff.model as AwsRegion;

    const accessSG = actionInputs[`resource.sec-grp-${regionId}-access`] as SecurityGroup;
    accessSG.remove();
    actionOutputs[accessSG.resourceId] = accessSG;

    const internetGateway = actionInputs[`resource.igw-${regionId}`] as InternetGateway;
    internetGateway.remove();
    actionOutputs[internetGateway.resourceId] = internetGateway;

    const vpc = actionInputs[`resource.vpc-${regionId}`] as Vpc;
    vpc.remove();
    actionOutputs[vpc.resourceId] = vpc;

    return actionOutputs;
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<DeleteRegionModelAction>(DeleteRegionModelAction)
export class DeleteRegionModelActionFactory {
  static async create(): Promise<DeleteRegionModelAction> {
    return new DeleteRegionModelAction();
  }
}
