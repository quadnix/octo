import { Diff, DiffUtility, type MatchingResource, Resource, ResourceError } from '@quadnix/octo';
import { OctoTerraform, type OctoTerraformFactory } from '../../factories/octo-terraform.factory.js';
import { NetworkAclUtility } from '../../utilities/network-acl/network-acl.utility.js';
import type { SubnetSchema } from '../subnet/index.schema.js';
import { ATFResource } from '../tf-resource.abstract.js';
import type { VpcSchema } from '../vpc/index.schema.js';
import { NetworkAclSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<NetworkAcl>('@octo', 'network-acl', NetworkAclSchema)
export class NetworkAcl extends ATFResource<NetworkAclSchema, NetworkAcl> {
  declare parents: [MatchingResource<VpcSchema>, MatchingResource<SubnetSchema>];
  declare properties: NetworkAclSchema['properties'];
  declare response: NetworkAclSchema['response'];

  constructor(
    resourceId: string,
    properties: NetworkAclSchema['properties'],
    parents: [MatchingResource<VpcSchema>, MatchingResource<SubnetSchema>],
  ) {
    NetworkAclUtility.assignRuleNumber(properties.entries);
    super(resourceId, properties, parents);
  }

  override async diffProperties(previous: NetworkAcl): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties, ['entries'])) {
      throw new ResourceError('Cannot update Network ACL immutable properties once it has been created!', this);
    }

    return super.diffProperties(previous);
  }

  updateNaclEntries(entries: NetworkAclSchema['properties']['entries']): void {
    this.properties.entries.push(...entries);
    NetworkAclUtility.assignRuleNumber(this.properties.entries);
  }

  override async toHCL(): Promise<void> {
    const octoTerraform = await this.container.get<OctoTerraform, typeof OctoTerraformFactory>(OctoTerraform, {
      metadata: { package: '@octo' },
    });

    const ingressEntries = this.properties.entries
      .filter((e) => !e.Egress)
      .map((e) => ({
        action: e.RuleAction,
        cidr_block: e.CidrBlock,
        from_port: e.PortRange.From,
        protocol: e.Protocol,
        rule_no: e.RuleNumber,
        to_port: e.PortRange.To,
      }));

    const egressEntries = this.properties.entries
      .filter((e) => e.Egress)
      .map((e) => ({
        action: e.RuleAction,
        cidr_block: e.CidrBlock,
        from_port: e.PortRange.From,
        protocol: e.Protocol,
        rule_no: e.RuleNumber,
        to_port: e.PortRange.To,
      }));

    const spec: Record<string, unknown> = {
      subnet_ids: [octoTerraform.getRef(this.parents[1], 'SubnetId')],
      vpc_id: octoTerraform.getRef(this.parents[0], 'VpcId'),
    };
    if (ingressEntries.length > 0) {
      spec['ingress'] = ingressEntries;
    }
    if (egressEntries.length > 0) {
      spec['egress'] = egressEntries;
    }

    const naclOctoResource = octoTerraform.addOctoTerraformResource(this as NetworkAcl);

    const naclTFResource = naclOctoResource.addTerraformResource('aws_network_acl', this.resourceId, spec);
    naclOctoResource.output({
      NetworkAclId: octoTerraform.raw(`${naclTFResource.address}.id`),
    });

    if (Object.keys(this.tags).length > 0) {
      naclTFResource.attribute('tags', this.tags);
    }
  }
}
