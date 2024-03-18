export interface IEcsTaskDefinitionProperties {
  awsRegionId: string;
  efsFileSystemId: string;
  environment: { name: string; value: string }[];
  image: {
    command: string[];
    ports: { containerPort: number; protocol: 'tcp' | 'udp' }[];
    uri: string;
  };
  serverKey: string;
  taskRoleArn: string;
}

export interface IEcsTaskDefinitionResponse {
  revision: number;
  taskDefinitionArn: string;
}
