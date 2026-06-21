import {
  ATerraformResource,
  Diff,
  DiffAction,
  DiffUtility,
  type MatchingResource,
  Resource,
  type TerraformModuleScope,
} from '@quadnix/octo';
import type { VpcSchema } from '../vpc/index.schema.js';
import { SecurityGroupSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<SecurityGroup>('@octo', 'security-group', SecurityGroupSchema)
export class SecurityGroup extends ATerraformResource<SecurityGroupSchema, SecurityGroup> {
  declare parents: [MatchingResource<VpcSchema>];
  declare properties: SecurityGroupSchema['properties'];
  declare response: SecurityGroupSchema['response'];

  constructor(
    resourceId: string,
    properties: SecurityGroupSchema['properties'],
    parents: [MatchingResource<VpcSchema>],
  ) {
    super(resourceId, properties, parents);
  }

  override async diffProperties(previous: SecurityGroup): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties, ['rules'])) {
      return [
        new Diff(
          this,
          DiffAction.REPLACE,
          'resourceId',
          this.getContext(),
          'security group properties are identity; a change recreates it',
        ),
      ];
    }

    return super.diffProperties(previous);
  }

  override async toHCL(terraform: TerraformModuleScope): Promise<void> {
    const sgOctoResource = terraform.addOctoTerraformResource(this as SecurityGroup, {
      provider: { accountId: this.properties.awsAccountId, regionId: this.properties.awsRegionId },
    });

    const sgTFResource = sgOctoResource.addTerraformResource('aws_security_group', this.resourceId, {
      vpc_id: terraform.getRef(this.parents[0], 'VpcId'),
    });
    sgOctoResource.output({
      Arn: terraform.raw(`${sgTFResource.address}.arn`),
      GroupId: terraform.raw(`${sgTFResource.address}.id`),
    });

    const ingressRules = this.properties.rules.filter((r) => !r.Egress);
    const egressRules = this.properties.rules.filter((r) => r.Egress);

    for (let i = 0; i < ingressRules.length; i++) {
      const r = ingressRules[i];
      const spec: Record<string, unknown> = {
        cidr_ipv4: r.CidrBlock,
        description: `${r.IpProtocol} ${r.FromPort}-${r.ToPort} ${r.CidrBlock}`,
        ip_protocol: r.IpProtocol,
        security_group_id: terraform.raw(`${sgTFResource.address}.id`),
      };
      if (r.IpProtocol !== '-1') {
        spec['from_port'] = r.FromPort;
        spec['to_port'] = r.ToPort;
      }
      sgOctoResource.addTerraformResource(
        'aws_vpc_security_group_ingress_rule',
        `${this.resourceId}_ingress_${i}`,
        spec,
      );
    }

    for (let i = 0; i < egressRules.length; i++) {
      const r = egressRules[i];
      const spec: Record<string, unknown> = {
        cidr_ipv4: r.CidrBlock,
        description: `${r.IpProtocol} ${r.FromPort}-${r.ToPort} ${r.CidrBlock}`,
        ip_protocol: r.IpProtocol,
        security_group_id: terraform.raw(`${sgTFResource.address}.id`),
      };
      if (r.IpProtocol !== '-1') {
        spec['from_port'] = r.FromPort;
        spec['to_port'] = r.ToPort;
      }
      sgOctoResource.addTerraformResource('aws_vpc_security_group_egress_rule', `${this.resourceId}_egress_${i}`, spec);
    }

    if (Object.keys(this.tags).length > 0) {
      sgTFResource.attribute('tags', this.tags);
    }
  }
}
