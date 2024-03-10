import { Deployment, Model, UnknownModel } from '@quadnix/octo';
import { AwsServer } from '../server/aws.server.model.js';
import { S3StorageService } from '../service/s3-storage/s3-storage.service.model.js';
import { IAwsDeployment } from './aws.deployment.interface.js';

@Model()
export class AwsDeployment extends Deployment {
  readonly s3StorageService: S3StorageService;

  constructor(deploymentTag: string, s3StorageService: S3StorageService) {
    super(deploymentTag);

    this.s3StorageService = s3StorageService;
  }

  get deploymentFolderRemotePath(): string {
    const parents = this.getParents();
    const parent = (parents['server'] || parents['support'])[0].to as AwsServer;
    return `private/deployments/${parent.serverKey}/${this.deploymentTag}`;
  }

  override synth(): IAwsDeployment {
    return {
      deploymentFolderRemotePath: this.deploymentFolderRemotePath,
      deploymentTag: this.deploymentTag,
      s3StorageService: { context: this.s3StorageService.getContext() },
    };
  }

  static override async unSynth(
    awsDeployment: IAwsDeployment,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<AwsDeployment> {
    const s3StorageService = (await deReferenceContext(awsDeployment.s3StorageService.context)) as S3StorageService;
    return new AwsDeployment(awsDeployment.deploymentTag, s3StorageService);
  }
}
