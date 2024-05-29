export interface IEcsTaskDefinitionProperties {
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

export interface IEcsTaskDefinitionResponse {
  revision: number;
  taskDefinitionArn: string;
}
