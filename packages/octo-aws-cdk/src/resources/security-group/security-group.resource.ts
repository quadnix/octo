import { Diff, DiffUtility, type MatchingResource, Resource, ResourceError } from '@quadnix/octo';
import { OctoTerraform, type OctoTerraformFactory } from '../../factories/octo-terraform.factory.js';
import { ATFResource } from '../tf-resource.abstract.js';
import type { VpcSchema } from '../vpc/index.schema.js';
import { SecurityGroupSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<SecurityGroup>('@octo', 'security-group', SecurityGroupSchema)
export class SecurityGroup extends ATFResource<SecurityGroupSchema, SecurityGroup> {
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
      throw new ResourceError('Cannot update Security Group immutable properties once it has been created!', this);
    }

    return super.diffProperties(previous);
  }

  override async toHCL(): Promise<void> {
    const octoTerraform = await this.container.get<OctoTerraform, typeof OctoTerraformFactory>(OctoTerraform, {
      metadata: { package: '@octo' },
    });

    const sgOctoResource = octoTerraform.addOctoTerraformResource(this as SecurityGroup);

    const sgTFResource = sgOctoResource.addTerraformResource('aws_security_group', this.resourceId, {
      vpc_id: octoTerraform.getRef(this.parents[0], 'VpcId'),
    });
    sgOctoResource.output({
      Arn: octoTerraform.raw(`${sgTFResource.address}.arn`),
      GroupId: octoTerraform.raw(`${sgTFResource.address}.id`),
    });

    const ingressRules = this.properties.rules.filter((r) => !r.Egress);
    const egressRules = this.properties.rules.filter((r) => r.Egress);

    for (let i = 0; i < ingressRules.length; i++) {
      const r = ingressRules[i];
      const spec: Record<string, unknown> = {
        cidr_ipv4: r.CidrBlock,
        description: `${r.IpProtocol} ${r.FromPort}-${r.ToPort} ${r.CidrBlock}`,
        ip_protocol: r.IpProtocol,
        security_group_id: octoTerraform.raw(`${sgTFResource.address}.id`),
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
        security_group_id: octoTerraform.raw(`${sgTFResource.address}.id`),
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
