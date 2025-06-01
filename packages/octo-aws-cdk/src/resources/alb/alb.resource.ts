import { AResource, type MatchingResource, Resource } from '@quadnix/octo';
import type { SecurityGroupSchema } from '../security-group/index.schema.js';
import type { SubnetSchema } from '../subnet/index.schema.js';
import { AlbSchema } from './index.schema.js';

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
