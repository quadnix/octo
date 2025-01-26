import { AAnchor, Anchor, BaseAnchorSchema, type Deployment, Schema } from '@quadnix/octo';

class AwsDeploymentImageTaskDefinitionAnchorSchema extends BaseAnchorSchema {
  override properties = Schema<{
    cpu: 256 | 512 | 1024 | 2048 | 4096 | 8192 | 16384;
    image: {
      command: string;
      ports: { containerPort: number; protocol: 'tcp' | 'udp' }[];
      uri: string;
    };
    memory: number;
  }>();
}

@Anchor('@octo')
export class AwsDeploymentImageTaskDefinitionAnchor extends AAnchor<
  AwsDeploymentImageTaskDefinitionAnchorSchema,
  Deployment
> {
  declare properties: AwsDeploymentImageTaskDefinitionAnchorSchema['properties'];

  constructor(
    anchorId: string,
    properties: AwsDeploymentImageTaskDefinitionAnchorSchema['properties'],
    parent: Deployment,
  ) {
    super(anchorId, properties, parent);
  }
}
