import { type Account, AccountSchema, Schema, Validate } from '@quadnix/octo';
import { AwsAccountAnchorSchema } from '../../../anchors/aws-account/aws-account.anchor.schema.js';

/**
 * Puts a CloudFront distribution in front of the website bucket.
 *
 * Declaring this closes the bucket: it is no longer reachable on its own, and the distribution
 * becomes the only way in, serving the site over HTTPS from CloudFront's edge locations. It also
 * means a deploy invalidates the edge caches, without which new files would sit behind the old ones
 * for as long as a day.
 *
 * The distribution this builds is one opinion about serving a website out of a bucket. The resource
 * underneath it can do a great deal more - several origins, a routing table over them, policies of
 * its own - and a module wanting that writes its own distribution rather than widening this input.
 *
 * @group Modules/Service/AwsS3StaticWebsiteService
 *
 * @hideconstructor
 */
export class AwsS3StaticWebsiteServiceModuleCloudFrontSchema {
  /**
   * The custom domain names the distribution answers on, e.g. `docs.example.com`.
   * Each one needs a DNS record pointing at the distribution, which this module does not create.
   * Leaving this empty serves the site on the `*.cloudfront.net` domain CloudFront assigns.
   */
  @Validate({
    destruct: (value: AwsS3StaticWebsiteServiceModuleCloudFrontSchema['aliases']): string[] => value!,
    options: { minLength: 1 },
  })
  aliases? = Schema<string[]>([]);

  /**
   * The ARN of the ACM certificate covering every entry in `aliases`.
   * CloudFront only reads certificates from `us-east-1`, wherever the bucket itself lives.
   * Required when `aliases` is set, and pointless without it.
   */
  @Validate({
    destruct: (value: AwsS3StaticWebsiteServiceModuleCloudFrontSchema['certificateArn']): string[] =>
      value ? [value] : [],
    options: { minLength: 1 },
  })
  certificateArn? = Schema<string | null>(null);

  /**
   * What a visitor gets for a path the bucket has nothing at. The two answers are opposites, and
   * which one is right is a fact about the site rather than about CloudFront.
   *
   * * `error-document` returns a real `404` carrying the site's error document. This is what a
   * content site wants: a missing page is missing, and a search engine should be told so.
   * * `single-page-app` returns a `200` carrying the index document, so that the app's own router
   * decides what the path means. A single-page app needs this, and a content site using it would
   * report every typo as a working page.
   */
  @Validate({ options: { minLength: 1 } })
  notFoundBehavior? = Schema<'error-document' | 'single-page-app'>('error-document');

  /**
   * Which edge locations serve the site, which is what the distribution costs.
   * `PriceClass_100` is North America and Europe alone and is the cheapest;
   * `PriceClass_All` serves from everywhere.
   */
  @Validate({ options: { minLength: 1 } })
  priceClass? = Schema<'PriceClass_100' | 'PriceClass_200' | 'PriceClass_All'>('PriceClass_All');

  /**
   * The ARN of a web ACL to put in front of the distribution, or `null` for none.
   * The ACL is not created here, and CloudFront only reads one from `us-east-1`.
   */
  @Validate({
    destruct: (value: AwsS3StaticWebsiteServiceModuleCloudFrontSchema['webAclArn']): string[] => (value ? [value] : []),
    options: { minLength: 1 },
  })
  webAclArn? = Schema<string | null>(null);
}

/**
 * `AwsS3StaticWebsiteServiceModuleSchema` is the input schema for the `AwsS3StaticWebsiteServiceModule` module.
 * This schema defines the configuration for S3-based static website services including bucket naming,
 * source directory management, and file processing options.
 *
 * @group Modules/Service/AwsS3StaticWebsiteService
 *
 * @hideconstructor
 *
 * @see {@link AwsS3StaticWebsiteServiceModule} to learn more about the `AwsS3StaticWebsiteServiceModule` module.
 */
export class AwsS3StaticWebsiteServiceModuleSchema {
  /**
   * The AWS account that this service will be associated with.
   * Only AWS account types are supported for this module.
   */
  @Validate([
    {
      options: {
        isModel: { anchors: [{ schema: AwsAccountAnchorSchema }], NODE_NAME: 'account' },
      },
    },
    {
      destruct: (value: AwsS3StaticWebsiteServiceModuleSchema['account']): [AccountSchema] => [value.synth()],
      options: {
        isSchema: { schema: AccountSchema },
      },
    },
  ])
  account = Schema<Account>();

  /**
   * The AWS region that this service will be associated with.
   */
  @Validate({ options: { minLength: 1 } })
  awsRegionId = Schema<string>();

  /**
   * The name of the S3 bucket to create for the static website.
   * This name must be globally unique across all AWS accounts and regions.
   * Must follow S3 bucket naming conventions.
   */
  @Validate({ options: { minLength: 1 } })
  bucketName = Schema<string>();

  /**
   * Serves the bucket through a CloudFront distribution, and closes the bucket to everything else.
   * Omitting this serves the bucket directly from its S3 website endpoint, over plain HTTP.
   * See {@link AwsS3StaticWebsiteServiceModuleCloudFrontSchema} for options.
   */
  @Validate({
    destruct: (
      value: AwsS3StaticWebsiteServiceModuleSchema['cloudFront'],
    ): AwsS3StaticWebsiteServiceModuleCloudFrontSchema[] => (value ? [value] : []),
    options: { isSchema: { schema: AwsS3StaticWebsiteServiceModuleCloudFrontSchema } },
  })
  cloudFront? = Schema<AwsS3StaticWebsiteServiceModuleCloudFrontSchema | null>(null);

  /**
   * The local directory path containing the static website files.
   * This is the source directory that will be synchronized to S3.
   */
  @Validate({ options: { minLength: 1 } })
  directoryPath = Schema<string>();

  /**
   * Optional filter function to exclude specific files from upload.
   * This function receives a file path and returns true to include the file or false to exclude it.
   * Useful for excluding development files, system files, or temporary files.
   */
  @Validate({
    destruct: (value: AwsS3StaticWebsiteServiceModuleSchema['filter']): ((filePath: string) => boolean)[] => {
      const subjects: ((filePath: string) => boolean)[] = [];
      if (value) {
        subjects.push(value);
      }
      return subjects;
    },
    options: {
      custom: (value: ((filePath: string) => boolean)[]): boolean => value.every((v) => typeof v === 'function'),
    },
  })
  filter? = Schema<((filePath: string) => boolean) | null>(null);

  /**
   * Optional subdirectory or specific file path within the source directory.
   * When specified, only this subdirectory or file will be uploaded instead of the entire directory.,
   * but the path leading up to this subdirectory or file will still be preserved.
   *
   * For example, if `subDirectoryOrFilePath` is `subdirectory/file.html`, only the file `file.html` will be uploaded,
   * but the path `subdirectory/` will still be preserved. The URL will be `my-website.com/subdirectory/file.html`.
   */
  @Validate({
    destruct: (value: AwsS3StaticWebsiteServiceModuleSchema['subDirectoryOrFilePath']): string[] => {
      const subjects: string[] = [];
      if (value) {
        subjects.push(value);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  subDirectoryOrFilePath? = Schema<string | null>(null);

  /**
   * Optional transform function to modify file paths before upload.
   * This function receives the original file path and returns the transformed path.
   * Useful for renaming files, changing directory structures, or modifying extensions.
   */
  @Validate({
    destruct: (value: AwsS3StaticWebsiteServiceModuleSchema['transform']): ((filePath: string) => string)[] => {
      const subjects: ((filePath: string) => string)[] = [];
      if (value) {
        subjects.push(value);
      }
      return subjects;
    },
    options: {
      custom: (value: ((filePath: string) => string)[]): boolean => value.every((v) => typeof v === 'function'),
    },
  })
  transform? = Schema<((filePath: string) => string) | null>(null);
}
