import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
  MatchingResource,
} from '@quadnix/octo';
import { Alb } from '../../../../../../resources/alb/index.js';
import { AlbListener } from '../../../../../../resources/alb-listener/index.js';
import { AlbTargetGroup } from '../../../../../../resources/alb-target-group/index.js';
import type { AlbTargetGroupSchema } from '../../../../../../resources/alb-target-group/index.schema.js';
import { EcsService } from '../../../../../../resources/ecs-service/index.js';
import { EcsServiceSchema } from '../../../../../../resources/ecs-service/index.schema.js';
import { VpcSchema } from '../../../../../../resources/vpc/index.schema.js';
import { CommonUtility } from '../../../../../../utilities/common/common.utility.js';
import type { AwsAlbServiceModule } from '../../../aws-alb.service.module.js';
import { AwsAlbEcsExecutionOverlay } from '../aws-alb-ecs-execution.overlay.js';

@Action(AwsAlbEcsExecutionOverlay)
export class AddTargetGroupOverlayAction implements IModelAction<AwsAlbServiceModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsAlbEcsExecutionOverlay &&
      (diff.node.constructor as typeof AwsAlbEcsExecutionOverlay).NODE_NAME === 'alb-ecs-execution-overlay' &&
      diff.field === 'overlayId'
    );
  }

  async handle(
    diff: Diff,
    actionInputs: EnhancedModuleSchema<AwsAlbServiceModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const albEcsExecutionOverlay = diff.node as AwsAlbEcsExecutionOverlay;

    const { awsAccountId, awsRegionId } = actionInputs.metadata as Awaited<
      ReturnType<AwsAlbServiceModule['registerMetadata']>
    >;

    const [matchingVpcResource] = await albEcsExecutionOverlay.getResourcesMatchingSchema(VpcSchema, [
      { key: 'awsAccountId', value: awsAccountId },
      { key: 'awsRegionId', value: awsRegionId },
    ]);

    const albTargetGroups: AlbTargetGroup[] = [];
    for (const target of actionInputs.inputs.targets!) {
      const albTargetGroupName = [
        target.containerName,
        target.containerPort,
        CommonUtility.hash(target.execution.executionId).substring(0, 5),
      ].join('-');

      const albTargetGroup = new AlbTargetGroup(
        `alb-target-group-${target.execution.executionId}`,
        {
          awsAccountId,
          awsRegionId,
          healthCheck: target.healthCheck || undefined,
          IpAddressType: 'ipv4',
          Name: albTargetGroupName,
          Port: target.containerPort,
          Protocol: 'HTTP',
          ProtocolVersion: 'HTTP1',
          TargetType: 'ip',
        },
        [matchingVpcResource],
      );
      actionOutputs[albTargetGroup.resourceId] = albTargetGroup;
      albTargetGroups.push(albTargetGroup);

      const [matchingEcsService] = (await target.execution.getResourcesMatchingSchema(
        EcsServiceSchema,
        [
          { key: 'awsAccountId', value: awsAccountId },
          { key: 'awsRegionId', value: awsRegionId },
        ],
        [],
        {
          searchBoundaryMembers: false,
        },
      )) as MatchingResource<EcsServiceSchema>[];
      if (!matchingEcsService) {
        throw new Error(`No ecs service found for execution "${target.execution.executionId}"!`);
      }

      (matchingEcsService.getActual() as EcsService).addAlbTargetGroup(
        new MatchingResource(albTargetGroup),
        target.containerName,
      );
      actionOutputs[matchingEcsService.getActual().resourceId] = matchingEcsService.getActual();
    }

    for (const listener of actionInputs.inputs.listeners) {
      const alb = actionInputs.resources[
        `alb-${actionInputs.inputs.region.regionId}-${actionInputs.inputs.albName}`
      ] as Alb;

      const forwardConfigActionTargetGroupNames = Array.from(
        new Set([
          ...listener.DefaultActions.filter((a) => a.actionType === 'forward')
            .map((a) => a.action.TargetGroups.map((t) => t.targetGroupName))
            .flat(),
          ...listener.rules
            .map((r) => r.actions)
            .flat()
            .filter((a) => a.actionType === 'forward')
            .map((a) => a.action.TargetGroups.map((t) => t.targetGroupName))
            .flat(),
        ]),
      );
      const forwardConfigActionTargetGroups = albTargetGroups.filter((t) =>
        forwardConfigActionTargetGroupNames.includes(t.properties.Name),
      );

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
          ...(forwardConfigActionTargetGroups.map(
            (t) => new MatchingResource(t),
          ) as MatchingResource<AlbTargetGroupSchema>[]),
        ],
      );
      actionOutputs[albListener.resourceId] = albListener;
    }

    return actionOutputs;
  }
}

@Factory<AddTargetGroupOverlayAction>(AddTargetGroupOverlayAction)
export class AddTargetGroupOverlayActionFactory {
  private static instance: AddTargetGroupOverlayAction;

  static async create(): Promise<AddTargetGroupOverlayAction> {
    if (!this.instance) {
      this.instance = new AddTargetGroupOverlayAction();
    }
    return this.instance;
  }
}
