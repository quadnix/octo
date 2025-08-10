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
import { Alb } from '../../../../../../resources/alb/index.js';
import { AlbListener } from '../../../../../../resources/alb-listener/index.js';
import { AlbTargetGroup } from '../../../../../../resources/alb-target-group/index.js';
import type { AlbTargetGroupSchema } from '../../../../../../resources/alb-target-group/index.schema.js';
import { EcsService } from '../../../../../../resources/ecs-service/index.js';
import { EcsServiceSchema } from '../../../../../../resources/ecs-service/index.schema.js';
import { VpcSchema } from '../../../../../../resources/vpc/index.schema.js';
import type { AwsEcsAlbServiceModule } from '../../../aws-ecs-alb-service.module.js';
import { AwsEcsAlbServiceOverlay } from '../aws-ecs-alb-service.overlay.js';

/**
 * @internal
 */
@Action(AwsEcsAlbServiceOverlay)
export class AddAwsEcsAlbServiceOverlayAction implements IModelAction<AwsEcsAlbServiceModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsEcsAlbServiceOverlay &&
      hasNodeName(diff.node, 'aws-ecs-alb-service-overlay') &&
      diff.field === 'overlayId'
    );
  }

  async handle(
    diff: Diff<AwsEcsAlbServiceOverlay>,
    actionInputs: EnhancedModuleSchema<AwsEcsAlbServiceModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const albEcsExecutionOverlay = diff.node;

    const { awsAccountId, awsRegionId } = actionInputs.metadata;

    const [matchingVpcResource] = await albEcsExecutionOverlay.getResourcesMatchingSchema(VpcSchema, [
      { key: 'awsAccountId', value: awsAccountId },
      { key: 'awsRegionId', value: awsRegionId },
    ]);

    const albTargetGroups: AlbTargetGroup[] = [];
    for (const target of actionInputs.inputs.targets!) {
      const albTargetGroup = new AlbTargetGroup(
        `alb-target-group-${target.execution.executionId}`,
        {
          awsAccountId,
          awsRegionId,
          healthCheck: target.healthCheck || undefined,
          IpAddressType: 'ipv4',
          Name: target.Name,
          Port: target.containerPort,
          Protocol: 'HTTP',
          ProtocolVersion: 'HTTP1',
          TargetType: 'ip',
        },
        [matchingVpcResource],
      );
      actionOutputs[albTargetGroup.resourceId] = albTargetGroup;
      albTargetGroups.push(albTargetGroup);
    }

    const albListeners: AlbListener[] = [];
    for (const listener of actionInputs.inputs.listeners) {
      const alb = actionInputs.resources[
        `alb-${actionInputs.inputs.region.regionId}-${actionInputs.inputs.albName}`
      ] as Alb;

      const albListener = new AlbListener(
        `alb-listener-${actionInputs.inputs.albName}`,
        {
          awsAccountId,
          awsRegionId,
          DefaultActions: listener.DefaultActions,
          Port: listener.Port,
          Protocol: 'HTTP',
          rules: listener.rules,
        },
        [
          new MatchingResource(alb),
          ...(albTargetGroups.map((t) => new MatchingResource(t)) as MatchingResource<AlbTargetGroupSchema>[]),
        ],
      );
      actionOutputs[albListener.resourceId] = albListener;
      albListeners.push(albListener);
    }

    for (const target of actionInputs.inputs.targets!) {
      const [matchingEcsService] = await target.execution.getResourcesMatchingSchema(
        EcsServiceSchema,
        [
          { key: 'awsAccountId', value: awsAccountId },
          { key: 'awsRegionId', value: awsRegionId },
        ],
        [],
        {
          searchBoundaryMembers: false,
        },
      );
      if (!matchingEcsService) {
        throw new Error(`No ecs service found for execution "${target.execution.executionId}"!`);
      }

      (matchingEcsService.getActual() as EcsService).addAlbTargetGroup(
        new MatchingResource(albTargetGroups.find((t) => t.properties.Name === target.Name)!),
        albListeners.map((l) => new MatchingResource(l)),
        target.containerName,
      );
      actionOutputs[matchingEcsService.getActual().resourceId] = matchingEcsService.getActual();
    }

    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsEcsAlbServiceOverlayAction>(AddAwsEcsAlbServiceOverlayAction)
export class AddAwsEcsAlbServiceOverlayActionFactory {
  private static instance: AddAwsEcsAlbServiceOverlayAction;

  static async create(): Promise<AddAwsEcsAlbServiceOverlayAction> {
    if (!this.instance) {
      this.instance = new AddAwsEcsAlbServiceOverlayAction();
    }
    return this.instance;
  }
}
