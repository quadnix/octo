import {
  AModule,
  type Account,
  type App,
  type MatchingAnchor,
  Module,
  ModuleError,
  type Subnet,
  SubnetType,
} from '@quadnix/octo';
import { AwsEcsAlbAnchor } from '../../../anchors/aws-ecs/aws-ecs-alb.anchor.js';
import { AwsEcsServiceAnchorSchema } from '../../../anchors/aws-ecs/aws-ecs-service.anchor.schema.js';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { AwsEcsAlbServiceModuleSchema } from './index.schema.js';
import { AwsEcsAlbService } from './models/service/index.js';
import { AwsEcsAlbServiceOverlay } from './overlays/aws-ecs-alb-service/index.js';

/**
 * `AwsEcsAlbServiceModule` is an ECS-based AWS ALB service module that provides an implementation for
 * the `Service` model. This module creates Application Load Balancers (ALB)
 * with comprehensive listener configurations, target groups, and routing rules.
 * It manages load balancing for containerized applications running on ECS with support for complex routing scenarios.
 *
 * @example
 * TypeScript
 * ```ts
 * import { AwsEcsAlbServiceModule } from '@quadnix/octo-aws-cdk/modules/service/aws-ecs-alb-service';
 *
 * octo.loadModule(AwsEcsAlbServiceModule, 'my-alb-module', {
 *   albName: 'my-load-balancer',
 *   listeners: [{
 *     DefaultActions: [{
 *       action: {
 *         targetGroups: [{ targetGroupName: 'my-target-group' }]
 *       },
 *       actionType: 'forward',
 *     }],
 *     Port: 443,
 *     rules: []
 *   }],
 *   region: myRegion,
 *   subnets: [
 *     { subnetCidrBlock: '10.0.1.0/24', subnetName: 'public-subnet-1' },
 *   ],
 *   targets: [{
 *     containerName: 'web',
 *     containerPort: 3000,
 *     execution: myExecution,
 *     healthCheck: { ... },
 *     Name: 'my-target-group',
 *   }]
 * });
 * ```
 *
 * @group Modules/Service/AwsEcsAlbService
 *
 * @reference Resources {@link AlbListenerSchema}
 * @reference Resources {@link AlbSchema}
 * @reference Resources {@link AlbTargetGroupSchema}
 * @reference Resources {@link EcsServiceSchema}
 * @reference Resources {@link SecurityGroupSchema}
 *
 * @see {@link AwsEcsAlbServiceModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see {@link Service} to learn more about the `Service` model.
 */
@Module<AwsEcsAlbServiceModule>('@octo', AwsEcsAlbServiceModuleSchema)
export class AwsEcsAlbServiceModule extends AModule<AwsEcsAlbServiceModuleSchema, AwsEcsAlbService> {
  async onInit(inputs: AwsEcsAlbServiceModuleSchema): Promise<[AwsEcsAlbService, AwsEcsAlbServiceOverlay]> {
    const region = inputs.region;
    const { app, subnets } = await this.registerMetadata(inputs);

    // Validate subnet.
    const associatedPublicSubnets: Subnet[] = [];
    for (const { subnetName } of inputs.subnets || []) {
      const regionSubnet = subnets.find((s) => s.subnetName === subnetName);
      if (!regionSubnet) {
        throw new ModuleError(
          `Subnet "${subnetName}" not found in region "${region.regionId}"!`,
          this.constructor.name,
        );
      }
      if (regionSubnet.subnetType !== SubnetType.PUBLIC) {
        throw new ModuleError(`Subnet "${subnetName}" is not public!`, this.constructor.name);
      }
      associatedPublicSubnets.push(regionSubnet);
    }
    if (associatedPublicSubnets.length < 2) {
      throw new ModuleError('At least two public subnets are required!', this.constructor.name);
    }

    // Create a new ALB.
    const service = new AwsEcsAlbService(inputs.albName, associatedPublicSubnets);
    app.addService(service);

    // Add anchors.
    const ecsAlbAnchor = new AwsEcsAlbAnchor('AwsEcsAlbAnchor', { albName: inputs.albName }, service);
    service.addAnchor(ecsAlbAnchor);

    // Get matching ecs service anchors for each target.
    const matchingEcsServiceAnchors: MatchingAnchor<AwsEcsServiceAnchorSchema>[] = [];
    for (const target of inputs.targets || []) {
      const [matchingEcsServiceAnchor] = await target.execution.getAnchorsMatchingSchema(
        AwsEcsServiceAnchorSchema,
        [],
        {
          searchBoundaryMembers: false,
        },
      );
      matchingEcsServiceAnchors.push(matchingEcsServiceAnchor);
    }

    // Add overlay for alb and ecs execution.
    const ecsAlbServiceOverlay = new AwsEcsAlbServiceOverlay(`aws-ecs-alb-service-overlay-${inputs.albName}`, {}, [
      ecsAlbAnchor,
      ...matchingEcsServiceAnchors,
    ]);

    return [service, ecsAlbServiceOverlay];
  }

  override async registerMetadata(inputs: AwsEcsAlbServiceModuleSchema): Promise<{
    app: App;
    awsAccountId: string;
    awsAvailabilityZones: string[];
    awsRegionId: string;
    subnets: Subnet[];
  }> {
    const region = inputs.region;
    const account = region.getParents()['account'][0].to as Account;
    const app = account.getParents()['app'][0].to as App;
    const subnets = (region.getChildren('subnet')['subnet'] || []).map((d) => d.to as Subnet);

    // Get AWS Region ID.
    const [matchingAnchor] = await region.getAnchorsMatchingSchema(AwsRegionAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    const { awsRegionAZs, awsRegionId } = matchingAnchor.getSchemaInstance().properties;

    return {
      app,
      awsAccountId: account.accountId,
      awsAvailabilityZones: awsRegionAZs,
      awsRegionId,
      subnets,
    };
  }
}
