import { AAnchor, Anchor, BaseAnchorSchema, type Environment, Schema } from '@quadnix/octo';

class AwsEnvironmentEnvironmentVariablesAnchorSchema extends BaseAnchorSchema {
  override properties = Schema<Record<string, string>>();
}

@Anchor('@octo')
export class AwsEnvironmentEnvironmentVariablesAnchor extends AAnchor<
  AwsEnvironmentEnvironmentVariablesAnchorSchema,
  Environment
> {
  declare properties: AwsEnvironmentEnvironmentVariablesAnchorSchema['properties'];

  constructor(
    anchorId: string,
    properties: AwsEnvironmentEnvironmentVariablesAnchorSchema['properties'],
    parent: Environment,
  ) {
    super(anchorId, properties, parent);
  }
}
