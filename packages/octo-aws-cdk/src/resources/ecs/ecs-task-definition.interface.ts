import type { IResource, ModifyInterface } from '@quadnix/octo';

export interface IEcsTaskDefinitionProperties
  extends ModifyInterface<
    IResource['properties'],
    {
      awsRegionId: string;
      deploymentTag: string;
      environmentVariables: { name: string; value: string }[];
      image: {
        command: string[];
        ports: { containerPort: number; protocol: 'tcp' | 'udp' }[];
        uri: string;
      };
      serverKey: string;
    }
  > {}

export interface IEcsTaskDefinitionResponse
  extends ModifyInterface<
    IResource['response'],
    {
      revision: number;
      taskDefinitionArn: string;
    }
  > {}
