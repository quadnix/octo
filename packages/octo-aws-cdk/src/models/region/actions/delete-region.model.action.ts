import { Action, DiffAction, Factory, ModelType } from '@quadnix/octo';
import type { ActionInputs, ActionOutputs, Diff, IModelAction } from '@quadnix/octo';
import { InternetGateway } from '../../../resources/internet-gateway/internet-gateway.resource.js';
import { SecurityGroup } from '../../../resources/security-group/security-group.resource.js';
import { Vpc } from '../../../resources/vpc/vpc.resource.js';
import { AwsRegion } from '../aws.region.model.js';

@Action(ModelType.MODEL)
export class DeleteRegionModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'DeleteRegionModelAction';

  collectInput(diff: Diff): string[] {
    const { regionId } = diff.model as AwsRegion;

    return [
      `resource.vpc-${regionId}`,
      `resource.igw-${regionId}`,
      `resource.sec-grp-${regionId}-access`,
      `resource.sec-grp-${regionId}-internal-open`,
      `resource.sec-grp-${regionId}-web`,
    ];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.model instanceof AwsRegion &&
      diff.model.MODEL_NAME === 'region' &&
      diff.field === 'regionId'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    const { regionId } = diff.model as AwsRegion;

    const webSG = actionInputs[`resource.sec-grp-${regionId}-web`] as SecurityGroup;
    webSG.markDeleted();
    const internalOpenSG = actionInputs[`resource.sec-grp-${regionId}-internal-open`] as SecurityGroup;
    internalOpenSG.markDeleted();
    const accessSG = actionInputs[`resource.sec-grp-${regionId}-access`] as SecurityGroup;
    accessSG.markDeleted();

    const internetGateway = actionInputs[`resource.igw-${regionId}`] as InternetGateway;
    internetGateway.markDeleted();

    const vpc = actionInputs[`resource.vpc-${regionId}`] as Vpc;
    vpc.markDeleted();

    const output: ActionOutputs = {};
    output[vpc.resourceId] = vpc;
    output[internetGateway.resourceId] = internetGateway;
    output[accessSG.resourceId] = accessSG;
    output[internalOpenSG.resourceId] = internalOpenSG;
    output[webSG.resourceId] = webSG;

    return output;
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
