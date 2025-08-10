import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  type AModule,
  type Account,
  type App,
  type Constructable,
  Factory,
  type ModuleSchemaInputs,
  stub,
} from '@quadnix/octo';
import { AwsIniAccountModule } from '@quadnix/octo-aws-cdk/modules/account/aws-ini-account';
import { SimpleAppModule } from '@quadnix/octo-aws-cdk/modules/app/simple-app';
import { AwsS3StaticWebsiteServiceModule } from '@quadnix/octo-aws-cdk/modules/service/aws-s3-static-website-service';

const __dirname = dirname(fileURLToPath(import.meta.url));
const websiteSourcePath = join(__dirname, 'website');

type ModuleDefinition<T extends AModule<unknown, any>> = {
  module: Constructable<T>;
  moduleId: string;
  moduleInputs: ModuleSchemaInputs<T>;
};

export class ModuleDefinitions {
  private readonly moduleDefinitions: ModuleDefinition<AModule<unknown, any>>[] = [];

  constructor() {
    this.init();
  }

  add<T extends AModule<unknown, any>>(
    module: Constructable<T>,
    moduleId: string,
    moduleInputs: ModuleSchemaInputs<T>,
  ): void {
    this.moduleDefinitions.push({ module, moduleId, moduleInputs });
  }

  get<T extends AModule<unknown, any>>(moduleId: string): ModuleDefinition<T> | undefined {
    return this.moduleDefinitions.find((m) => m.moduleId === moduleId) as ModuleDefinition<T>;
  }

  getAll(): ModuleDefinitions['moduleDefinitions'] {
    return this.moduleDefinitions;
  }

  private init(): void {
    this.add(SimpleAppModule, 'app-module', { name: 'aws-s3-website' });
    this.add(AwsIniAccountModule, 'account-module', {
      accountId: '099051346528', // Fix me: AWS account ID.
      app: stub<App>('${{app-module.model.app}}'),
    });
    this.add(AwsS3StaticWebsiteServiceModule, 's3-website-service-module', {
      account: stub<Account>('${{account-module.model.account}}'),
      awsRegionId: 'us-east-1',
      bucketName: 'octo-test-aws-s3-website', // Fix me: S3 bucket name.
      directoryPath: websiteSourcePath,
    });
  }

  update<T extends AModule<unknown, any>>(
    module: Constructable<T>,
    moduleId: string,
    moduleInputs: ModuleSchemaInputs<T>,
  ): void {
    const index = this.moduleDefinitions.findIndex((m) => m.moduleId === moduleId);
    if (index === -1) {
      this.add(module, moduleId, moduleInputs);
    } else {
      this.moduleDefinitions[index] = {
        module,
        moduleId,
        moduleInputs,
      };
    }
  }

  remove(moduleId: string): void {
    const index = this.moduleDefinitions.findIndex((m) => m.moduleId === moduleId);
    if (index > -1) {
      this.moduleDefinitions.splice(index, 1);
    }
  }
}

@Factory<ModuleDefinitions>(ModuleDefinitions)
export class ModuleDefinitionsFactory {
  private static instance: ModuleDefinitions;

  static async create(): Promise<ModuleDefinitions> {
    if (!this.instance) {
      this.instance = new ModuleDefinitions();
    }
    return this.instance;
  }
}
