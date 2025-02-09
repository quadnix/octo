import { type Account, type App, LocalStateProvider, Octo, type Region, stub } from '@quadnix/octo';
import { AwsAccountModule } from '@quadnix/octo-aws-cdk/account/ini-based-aws-account';
import { AppModule } from '@quadnix/octo-aws-cdk/app/simple-app';
import { RegionId } from '@quadnix/octo-aws-cdk/region/per-az-aws-region/schema';
import { AwsRegionModule } from '@quadnix/octo-aws-cdk/region/per-az-aws-region';
import { AwsS3StaticWebsiteServiceModule } from '@quadnix/octo-aws-cdk/service/s3-static-website-aws-service';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const octoStatePath = join(__dirname, '.octo');
const websiteSourcePath = join(__dirname, 'website');

const octo = new Octo();
const stateProvider = new LocalStateProvider(octoStatePath);

await octo.initialize(stateProvider);

octo.loadModule(AppModule, 'app-module', { name: 'aws-s3-website' });
octo.loadModule(AwsAccountModule, 'account-module', {
  accountId: '', // Fix me: AWS account ID.
  app: stub<App>('${{app-module.model.app}}'),
});
octo.loadModule(AwsRegionModule, 'region-module', {
  account: stub<Account>('${{account-module.model.account}}'),
  regionId: RegionId.AWS_US_EAST_1A,
  vpcCidrBlock: '10.0.0.0/16',
});
octo.loadModule(AwsS3StaticWebsiteServiceModule, 's3-website-service-module', {
  bucketName: 'octo-test', // Fix me: S3 bucket name.
  directoryPath: websiteSourcePath,
  region: stub<Region>('${{region-module.model.region}}'),
});

octo.orderModules([AppModule, AwsAccountModule, AwsRegionModule, AwsS3StaticWebsiteServiceModule]);

const { 'app-module.model.app': app } = (await octo.compose()) as { 'app-module.model.app': App };
const transaction = octo.beginTransaction(app);
await transaction.next();
