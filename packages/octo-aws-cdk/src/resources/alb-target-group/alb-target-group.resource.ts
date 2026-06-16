import {
  AResource,
  ATerraformResource,
  Diff,
  DiffAction,
  DiffUtility,
  type MatchingResource,
  Resource,
  ResourceError,
  type TerraformModuleScope,
} from '@quadnix/octo';
import type { VpcSchema } from '../vpc/index.schema.js';
import { AlbTargetGroupSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<AlbTargetGroup>('@octo', 'alb-target-group', AlbTargetGroupSchema)
export class AlbTargetGroup extends ATerraformResource<AlbTargetGroupSchema, AlbTargetGroup> {
  declare parents: [MatchingResource<VpcSchema>];
  declare properties: AlbTargetGroupSchema['properties'];
  declare response: AlbTargetGroupSchema['response'];

  constructor(
    resourceId: string,
    properties: AlbTargetGroupSchema['properties'],
    parents: [MatchingResource<VpcSchema>],
  ) {
    super(resourceId, properties, parents);
  }

  override async diffInverse(
    diff: Diff<AlbTargetGroup>,
    deReferenceResource: (resourceId: string) => Promise<AResource<VpcSchema, any>>,
  ): Promise<void> {
    if (diff.field === 'properties' && diff.action === DiffAction.UPDATE) {
      this.clonePropertiesInPlace(diff.node);
    } else {
      await super.diffInverse(diff, deReferenceResource);
    }
  }

  override async diffProperties(previous: AlbTargetGroup): Promise<Diff[]> {
    const diffs: Diff[] = [];

    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties, ['healthCheck'])) {
      throw new ResourceError('Cannot update ALB Target Group immutable properties once it has been created!', this);
    }

    if (!DiffUtility.isObjectDeepEquals(previous.properties.healthCheck, this.properties.healthCheck)) {
      diffs.push(new Diff(this, DiffAction.UPDATE, 'properties', ''));
    }

    return diffs;
  }

  override async toHCL(terraform: TerraformModuleScope): Promise<void> {
    const spec: Record<string, unknown> = {
      ip_address_type: this.properties.IpAddressType,
      name: this.properties.Name,
      port: this.properties.Port,
      protocol: this.properties.Protocol,
      protocol_version: this.properties.ProtocolVersion,
      target_type: this.properties.TargetType,
      vpc_id: terraform.getRef(this.parents[0], 'VpcId'),
    };

    if (this.properties.healthCheck) {
      spec['health_check'] = {
        enabled: true,
        healthy_threshold: this.properties.healthCheck.HealthyThresholdCount,
        interval: this.properties.healthCheck.HealthCheckIntervalSeconds,
        matcher: String(this.properties.healthCheck.Matcher.HttpCode),
        path: this.properties.healthCheck.HealthCheckPath,
        port: String(this.properties.healthCheck.HealthCheckPort),
        protocol: this.properties.healthCheck.HealthCheckProtocol,
        timeout: this.properties.healthCheck.HealthCheckTimeoutSeconds,
        unhealthy_threshold: this.properties.healthCheck.UnhealthyThresholdCount,
      };
    }

    const albTargetGroupOctoResource = terraform.addOctoTerraformResource(this as AlbTargetGroup, {
      provider: { accountId: this.properties.awsAccountId, regionId: this.properties.awsRegionId },
    });

    const albTargetGroupTFResource = albTargetGroupOctoResource.addTerraformResource(
      'aws_lb_target_group',
      this.resourceId,
      spec,
    );
    albTargetGroupOctoResource.output({
      TargetGroupArn: terraform.raw(`${albTargetGroupTFResource.address}.arn`),
    });

    if (Object.keys(this.tags).length > 0) {
      albTargetGroupTFResource.attribute('tags', this.tags);
    }
  }
}
