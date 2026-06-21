import {
  AResource,
  ATerraformResource,
  Diff,
  DiffAction,
  DiffUtility,
  type MatchingResource,
  Resource,
  type TerraformModuleScope,
  hasNodeName,
} from '@quadnix/octo';
import type { InternetGatewaySchema } from '../internet-gateway/index.schema.js';
import type { SecurityGroupSchema } from '../security-group/index.schema.js';
import type { SubnetSchema } from '../subnet/index.schema.js';
import { AlbSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<Alb>('@octo', 'alb', AlbSchema)
export class Alb extends ATerraformResource<AlbSchema, Alb> {
  declare parents: [
    MatchingResource<InternetGatewaySchema>,
    MatchingResource<SecurityGroupSchema>,
    ...MatchingResource<SubnetSchema>[],
  ];
  declare properties: AlbSchema['properties'];
  declare response: AlbSchema['response'];

  constructor(
    resourceId: string,
    properties: AlbSchema['properties'],
    parents: [
      MatchingResource<InternetGatewaySchema>,
      MatchingResource<SecurityGroupSchema>,
      ...MatchingResource<SubnetSchema>[],
    ],
  ) {
    super(resourceId, properties, parents);
  }

  override async diff(previous: Alb): Promise<Diff[]> {
    const diffs = await super.diff(previous);

    let shouldConsolidateSubnetDiffs = false;
    let shouldConsolidateSecurityGroupDiffs = false;
    for (let i = diffs.length - 1; i >= 0; i--) {
      if (diffs[i].field === 'parent' && hasNodeName(diffs[i].value as AResource<any, any>, 'subnet')) {
        // Consolidate all Subnet parent updates into a single UPDATE diff.
        shouldConsolidateSubnetDiffs = true;
        diffs.splice(i, 1);
      } else if (diffs[i].field === 'parent' && hasNodeName(diffs[i].value as AResource<any, any>, 'security-group')) {
        // Consolidate all Security-Group parent updates into a single UPDATE diff.
        shouldConsolidateSecurityGroupDiffs = true;
        diffs.splice(i, 1);
      }
    }

    if (shouldConsolidateSubnetDiffs) {
      diffs.push(new Diff(this, DiffAction.UPDATE, 'parent', 'subnets'));
    }
    if (shouldConsolidateSecurityGroupDiffs) {
      diffs.push(new Diff(this, DiffAction.UPDATE, 'parent', 'security-groups'));
    }

    return diffs;
  }

  override async diffProperties(previous: Alb): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties)) {
      return [
        new Diff(
          this,
          DiffAction.REPLACE,
          'resourceId',
          this.getContext(),
          'name is force-new on aws_lb; a change recreates the load balancer',
        ),
      ];
    }

    return [];
  }

  override async toHCL(terraform: TerraformModuleScope): Promise<void> {
    const subnetParents = (this.parents as MatchingResource<SubnetSchema>[]).slice(2);
    const subnetIds = subnetParents.map((p) => terraform.getRef(p, 'SubnetId'));

    const albOctoResource = terraform.addOctoTerraformResource(this as Alb, {
      explicitParents: [this.parents[0]],
      provider: { accountId: this.properties.awsAccountId, regionId: this.properties.awsRegionId },
    });

    const albTFResource = albOctoResource.addTerraformResource('aws_lb', this.resourceId, {
      internal: this.properties.Scheme !== 'internet-facing',
      ip_address_type: this.properties.IpAddressType,
      load_balancer_type: this.properties.Type,
      name: this.properties.Name,
      security_groups: [terraform.getRef(this.parents[1], 'GroupId')],
      subnets: subnetIds,
    });
    albOctoResource.output({
      DNSName: terraform.raw(`${albTFResource.address}.dns_name`),
      LoadBalancerArn: terraform.raw(`${albTFResource.address}.arn`),
    });

    if (Object.keys(this.tags).length > 0) {
      albTFResource.attribute('tags', this.tags);
    }
  }
}
