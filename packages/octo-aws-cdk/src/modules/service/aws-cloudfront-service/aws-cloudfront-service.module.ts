import { AModule, type Account, AccountType, Module, ModuleError, hasNodeName } from '@quadnix/octo';
import { AwsCloudFrontAnchor } from '../../../anchors/aws-cloudfront/aws-cloudfront.anchor.js';
import { AwsEcsAlbAnchorSchema } from '../../../anchors/aws-ecs/aws-ecs-alb.anchor.schema.js';
import { AwsLambdaFunctionAnchorSchema } from '../../../anchors/aws-lambda/aws-lambda-function.anchor.schema.js';
import { AwsS3StorageServiceAnchorSchema } from '../../../anchors/aws-s3-storage-service/aws-s3-storage-service.anchor.schema.js';
import { type AwsCloudFrontServiceModuleRouteSchema, AwsCloudFrontServiceModuleSchema } from './index.schema.js';
import { AwsCloudFrontService } from './models/service/index.js';
import { AwsCloudFrontAlbOriginOverlay } from './overlays/aws-cloudfront-alb-origin/index.js';
import { AwsCloudFrontLambdaOriginOverlay } from './overlays/aws-cloudfront-lambda-origin/index.js';
import { AwsCloudFrontS3OriginOverlay } from './overlays/aws-cloudfront-s3-origin/index.js';

/**
 * `AwsCloudFrontServiceModule` is a CloudFront-based AWS gateway module that provides an implementation
 * for the `Service` model: one distribution, the global entry point to what it serves.
 *
 * It is given its origins, the models it serves, and its routes, the paths that pick an origin, the
 * way CloudFront itself is configured. For each source it creates an overlay, and grants the
 * distribution access to it through an origin access control: for a bucket from
 * `AwsS3StorageServiceModule`, a statement in the bucket's policy; for a Lambda function from
 * `AwsLambdaExecutionModule`, a permission on the function to be called through its URL, by the
 * CloudFront distributions of its account. An ALB from `AwsEcsAlbServiceModule` is reached over HTTP
 * through its DNS name, and is granted nothing: it still answers anyone who calls it directly. It sits
 * under the account. To drop the edges' copies of a
 * source's files when they change, add `AwsCloudFrontInvalidationServiceModule`.
 *
 * A route whose origin is a Lambda function or an ALB defaults to every method, no caching, and every
 * viewer header but `Host`. Behind a Lambda function, a client sending a body - a `POST` or a `PUT` -
 * must also send its SHA-256 in the `x-amz-content-sha256` header, because CloudFront signs the request
 * it forwards to the function. CloudFront waits 60 seconds for the function, so a function with a
 * longer timeout is rejected.
 *
 * @example
 * TypeScript
 * ```ts
 * import { type Account, type Service, stub } from '@quadnix/octo';
 * import { AwsCloudFrontServiceModule } from '@quadnix/octo-aws-cdk/modules/service/aws-cloudfront-service';
 *
 * octo.loadModule(AwsCloudFrontServiceModule, 'my-distribution-module', {
 *   account: stub<Account>('${{my-account-module.model.account}}'),
 *   aliases: ['www.example.com'],
 *   certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d',
 *   defaultRootObject: 'index.html',
 *   distributionName: 'my-website',
 *   errorResponses: [{ errorCode: 403, responseCode: 404, responsePagePath: '/error.html' }],
 *   origins: [
 *     { originId: 'site', source: stub<Service>('${{my-content-module.model.service}}') },
 *   ],
 *   routes: [
 *     { originId: 'site', pathPattern: '/assets/*' },
 *     { originId: 'site' },
 *   ],
 * });
 * ```
 *
 * @group Modules/Service/AwsCloudFrontService
 *
 * @reference Resources {@link AlbSchema}
 * @reference Resources {@link CloudFrontDistributionSchema}
 * @reference Resources {@link LambdaFunctionSchema}
 * @reference Resources {@link S3StorageSchema}
 *
 * @see {@link AwsCloudFrontServiceModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see [Service](/api/octo/class/Service) to learn more about the `Service` model.
 */
@Module<AwsCloudFrontServiceModule>('@octo', AwsCloudFrontServiceModuleSchema)
export class AwsCloudFrontServiceModule extends AModule<AwsCloudFrontServiceModuleSchema, AwsCloudFrontService> {
  /**
   * Validates the origins and routes, creates the distribution's service under the account, and an
   * overlay for each origin's source.
   */
  async onInit(
    inputs: AwsCloudFrontServiceModuleSchema,
  ): Promise<
    [
      AwsCloudFrontService,
      ...(AwsCloudFrontAlbOriginOverlay | AwsCloudFrontLambdaOriginOverlay | AwsCloudFrontS3OriginOverlay)[],
    ]
  > {
    const account = inputs.account;
    if (account.accountType !== AccountType.AWS) {
      throw new ModuleError('Only AWS accounts are supported in this module!', this.constructor.name);
    }

    // Validate the distribution can serve the domains it answers on.
    if (inputs.aliases?.length && !inputs.certificateArn) {
      throw new ModuleError('A CloudFront certificate is required to serve an alias!', this.constructor.name);
    }

    // Validate origins.
    const originIds = inputs.origins.map((o) => o.originId);
    const duplicateOriginId = originIds.find((id, index) => originIds.indexOf(id) !== index);
    if (duplicateOriginId) {
      throw new ModuleError(`Origin "${duplicateOriginId}" is declared more than once!`, this.constructor.name);
    }

    // Validate routes.
    const defaultRoutes = inputs.routes.filter((r) => !r.pathPattern);
    if (defaultRoutes.length !== 1) {
      throw new ModuleError('Exactly one route must have no pathPattern: the default route!', this.constructor.name);
    }
    const pathPatterns = inputs.routes.filter((r) => r.pathPattern).map((r) => r.pathPattern!);
    const duplicatePathPattern = pathPatterns.find((p, index) => pathPatterns.indexOf(p) !== index);
    if (duplicatePathPattern) {
      throw new ModuleError(`Path pattern "${duplicatePathPattern}" is routed more than once!`, this.constructor.name);
    }
    const unknownRoute = inputs.routes.find((r) => !originIds.includes(r.originId));
    if (unknownRoute) {
      throw new ModuleError(`Route names unknown origin "${unknownRoute.originId}"!`, this.constructor.name);
    }
    const unusedOriginId = originIds.find((id) => !inputs.routes.some((r) => r.originId === id));
    if (unusedOriginId) {
      throw new ModuleError(`Origin "${unusedOriginId}" is not used by any route!`, this.constructor.name);
    }
    const overCachingRoute = inputs.routes.find((r) => {
      const allowedMethods: readonly string[] = r.allowedMethods || ['GET', 'HEAD'];
      return (r.cachedMethods || ['GET', 'HEAD']).some((method) => !allowedMethods.includes(method));
    });
    if (overCachingRoute) {
      throw new ModuleError(
        `Route "${overCachingRoute.pathPattern || 'default'}" caches a method it does not allow!`,
        this.constructor.name,
      );
    }

    // Validate custom policies.
    for (const route of inputs.routes) {
      const references: [
        string,
        AwsCloudFrontServiceModuleRouteSchema['cachePolicy' | 'originRequestPolicy' | 'responseHeadersPolicy'],
        { name: string }[] | undefined,
      ][] = [
        ['cache', route.cachePolicy, inputs.cachePolicies],
        ['origin request', route.originRequestPolicy, inputs.originRequestPolicies],
        ['response headers', route.responseHeadersPolicy, inputs.responseHeadersPolicies],
      ];
      for (const [slot, reference, declaredPolicies] of references) {
        if (reference?.kind === 'custom' && !declaredPolicies?.some((p) => p.name === reference.name)) {
          throw new ModuleError(`Route names unknown ${slot} policy "${reference.name}"!`, this.constructor.name);
        }
      }
    }

    // Create a new distribution.
    const service = new AwsCloudFrontService(inputs.distributionName, account);

    // Add anchors.
    const cloudFrontAnchor = new AwsCloudFrontAnchor(
      'AwsCloudFrontAnchor',
      { awsAccountId: account.accountId, distributionName: inputs.distributionName },
      service,
    );
    service.addAnchor(cloudFrontAnchor);

    // Add an overlay for each origin's source.
    const overlays: (
      | AwsCloudFrontAlbOriginOverlay
      | AwsCloudFrontLambdaOriginOverlay
      | AwsCloudFrontS3OriginOverlay
    )[] = [];
    for (const origin of inputs.origins) {
      if (hasNodeName(origin.source, 'execution')) {
        const [matchingLambdaFunctionAnchor] = await origin.source.getAnchorsMatchingSchema(
          AwsLambdaFunctionAnchorSchema,
          [],
          { searchBoundaryMembers: false },
        );
        const { functionName } = matchingLambdaFunctionAnchor.getSchemaInstance().properties;

        // Validate the function can be served, from this distribution's account.
        const environment = origin.source.getParents()['environment'][0].to;
        const region = environment.getParents()['region'][0].to;
        if ((region.getParents()['account'][0].to as Account).accountId !== account.accountId) {
          throw new ModuleError(
            `Lambda function "${functionName}" is not in the distribution's account!`,
            this.constructor.name,
          );
        }

        // Validate a function is one origin of this distribution.
        if (
          overlays.some(
            (o) => o instanceof AwsCloudFrontLambdaOriginOverlay && o.properties.functionName === functionName,
          )
        ) {
          throw new ModuleError(
            `Lambda function "${functionName}" is named by more than one origin!`,
            this.constructor.name,
          );
        }

        overlays.push(
          new AwsCloudFrontLambdaOriginOverlay(
            `aws-cloudfront-lambda-origin-overlay-${inputs.distributionName}-${functionName}`,
            { functionName },
            [cloudFrontAnchor, matchingLambdaFunctionAnchor],
          ),
        );
        continue;
      }

      const [matchingAlbAnchor] = await origin.source.getAnchorsMatchingSchema(AwsEcsAlbAnchorSchema, [], {
        searchBoundaryMembers: false,
      });
      if (matchingAlbAnchor) {
        const { albName } = matchingAlbAnchor.getSchemaInstance().properties;

        // Validate the ALB can be served, from this distribution's account.
        const subnet = origin.source.getParents()['subnet'][0].to;
        const region = subnet.getParents()['region'][0].to;
        if ((region.getParents()['account'][0].to as Account).accountId !== account.accountId) {
          throw new ModuleError(`ALB "${albName}" is not in the distribution's account!`, this.constructor.name);
        }

        // Validate an ALB is one origin of this distribution.
        if (overlays.some((o) => o instanceof AwsCloudFrontAlbOriginOverlay && o.properties.albName === albName)) {
          throw new ModuleError(`ALB "${albName}" is named by more than one origin!`, this.constructor.name);
        }

        overlays.push(
          new AwsCloudFrontAlbOriginOverlay(
            `aws-cloudfront-alb-origin-overlay-${inputs.distributionName}-${albName}`,
            { albName },
            [cloudFrontAnchor, matchingAlbAnchor],
          ),
        );
        continue;
      }

      const [matchingSourceAnchor] = await origin.source.getAnchorsMatchingSchema(AwsS3StorageServiceAnchorSchema, [], {
        searchBoundaryMembers: false,
      });
      if (!matchingSourceAnchor) {
        throw new ModuleError(
          `Origin "${origin.originId}" is neither an S3 storage bucket nor an ALB!`,
          this.constructor.name,
        );
      }
      const { bucketName } = matchingSourceAnchor.getSchemaInstance().properties;

      // Validate a bucket is one origin of this distribution.
      if (overlays.some((o) => o instanceof AwsCloudFrontS3OriginOverlay && o.properties.bucketName === bucketName)) {
        throw new ModuleError(`Bucket "${bucketName}" is named by more than one origin!`, this.constructor.name);
      }

      overlays.push(
        new AwsCloudFrontS3OriginOverlay(
          `aws-cloudfront-s3-origin-overlay-${inputs.distributionName}-${bucketName}`,
          { bucketName },
          [cloudFrontAnchor, matchingSourceAnchor],
        ),
      );
    }

    return [service, ...overlays];
  }

  /**
   * Resolves the account this distribution is created in.
   */
  override async registerMetadata(inputs: AwsCloudFrontServiceModuleSchema): Promise<{ awsAccountId: string }> {
    return { awsAccountId: inputs.account.accountId };
  }
}
