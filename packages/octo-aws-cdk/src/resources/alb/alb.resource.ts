import { AResource, type MatchingResource, Resource } from '@quadnix/octo';
import type { SecurityGroupSchema } from '../security-group/security-group.schema.js';
import type { SubnetSchema } from '../subnet/subnet.schema.js';
import { AlbSchema } from './alb.schema.js';

@Resource<Alb>('@octo', 'alb', AlbSchema)
export class Alb extends AResource<AlbSchema, Alb> {
  declare parents: [MatchingResource<SecurityGroupSchema>, ...MatchingResource<SubnetSchema>[]];
  declare properties: AlbSchema['properties'];
  declare response: AlbSchema['response'];

  constructor(
    resourceId: string,
    properties: AlbSchema['properties'],
    parents: [MatchingResource<SecurityGroupSchema>, ...MatchingResource<SubnetSchema>[]],
  ) {
    super(resourceId, properties, parents);
  }
}
