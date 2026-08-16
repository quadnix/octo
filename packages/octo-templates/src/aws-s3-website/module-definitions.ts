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
import { config } from './app.config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const websiteSourcePath = join(__dirname, 'website');

type ModuleDefinition<T extends AModule<unknown, any>> = {
  module: Constructable<T>;
  moduleId: string;
  moduleInputs: ModuleSchemaInputs<T>;
};

/**
 * The modules this template loads, and the inputs it loads them with.
 *
 * A test mutates the set - `update()` to change an input, `remove()` to drop a module - and runs the
 * lifecycle again, which is how the template exercises a change to live infrastructure.
 */
export class ModuleDefinitions {
  private readonly moduleDefinitions: ModuleDefinition<AModule<unknown, any>>[] = [];

  /**
   * Starts from the template's own set of modules.
   */
  constructor() {
    this.init();
  }

  /**
   * Appends a module definition to the end of the set.
   */
  add<T extends AModule<unknown, any>>(
    module: Constructable<T>,
    moduleId: string,
    moduleInputs: ModuleSchemaInputs<T>,
  ): void {
    this.moduleDefinitions.push({ module, moduleId, moduleInputs });
  }

  /**
   * Returns the definition of the given module id, or `undefined` when the set holds none.
   */
  get<T extends AModule<unknown, any>>(moduleId: string): ModuleDefinition<T> | undefined {
    return this.moduleDefinitions.find((m) => m.moduleId === moduleId) as ModuleDefinition<T>;
  }

  /**
   * Returns every definition, in the order the template loads them.
   */
  getAll(): ModuleDefinitions['moduleDefinitions'] {
    return this.moduleDefinitions;
  }

  /**
   * Drops the definition of the given module id. An id the set does not hold is not an error.
   */
  remove(moduleId: string): void {
    const index = this.moduleDefinitions.findIndex((m) => m.moduleId === moduleId);
    if (index > -1) {
      this.moduleDefinitions.splice(index, 1);
    }
  }

  /**
   * Replaces the definition of the given module id in place, keeping its load order, and appends it
   * when the set holds none.
   */
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

  /**
   * Declares this template's infrastructure: an app, the AWS account hosting it, and an S3 bucket
   * serving the website in `src/aws-s3-website/website` as a static site.
   */
  private init(): void {
    this.add(SimpleAppModule, 'app-module', { name: 'aws-s3-website' });

    this.add(AwsIniAccountModule, 'account-module', {
      accountId: config.AWS_ACCOUNT_ID,
      app: stub<App>('${{app-module.model.app}}'),
    });

    this.add(AwsS3StaticWebsiteServiceModule, 's3-website-service-module', {
      account: stub<Account>('${{account-module.model.account}}'),
      awsRegionId: 'us-east-1',
      bucketName: config.AWS_S3_WEBSITE_BUCKET_NAME,
      directoryPath: websiteSourcePath,
    });
  }
}

/**
 * Serves {@link ModuleDefinitions} through the container, so a test and the lifecycle it runs read
 * and mutate one set.
 */
@Factory<ModuleDefinitions>(ModuleDefinitions)
export class ModuleDefinitionsFactory {
  private static instance: ModuleDefinitions;

  /**
   * Returns the shared set, building it on the first call.
   */
  static async create(): Promise<ModuleDefinitions> {
    if (!this.instance) {
      this.instance = new ModuleDefinitions();
    }
    return this.instance;
  }
}
