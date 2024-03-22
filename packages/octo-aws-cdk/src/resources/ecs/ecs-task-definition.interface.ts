export interface IEcsTaskDefinitionProperties {
  awsRegionId: string;
  environment: { name: string; value: string }[];
  image: {
    command: string[];
    ports: { containerPort: number; protocol: 'tcp' | 'udp' }[];
  };
  serverKey: string;
}

export interface IEcsTaskDefinitionResponse {
  revision: number;
  taskDefinitionArn: string;
}
