import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
  type Region,
  hasNodeName,
} from '@quadnix/octo';
import { AwsEcsAlbAnchorSchema } from '../../../../../../anchors/aws-ecs/aws-ecs-alb.anchor.schema.js';
import { AwsLambdaFunctionAnchorSchema } from '../../../../../../anchors/aws-lambda/aws-lambda-function.anchor.schema.js';
import { AwsS3StorageServiceAnchorSchema } from '../../../../../../anchors/aws-s3-storage-service/aws-s3-storage-service.anchor.schema.js';
import { CloudFrontDistribution } from '../../../../../../resources/cloudfront-distribution/index.js';
import type {
  CloudFrontBehaviorSchema,
  CloudFrontOriginSchema,
} from '../../../../../../resources/cloudfront-distribution/index.schema.js';
import type { AwsCloudFrontServiceModule } from '../../../aws-cloudfront-service.module.js';
import { AwsCloudFrontService } from '../aws-cloudfront-service.model.js';

/**
 * @internal
 */
@Action(AwsCloudFrontService)
export class AddAwsCloudFrontServiceModelAction implements IModelAction<AwsCloudFrontServiceModule> {
  /**
   * @internal
   */
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsCloudFrontService &&
      hasNodeName(diff.node, 'service') &&
      diff.field === 'serviceId'
    );
  }

  /**
   * @internal
   */
  async handle(
    diff: Diff<AwsCloudFrontService>,
    actionInputs: EnhancedModuleSchema<AwsCloudFrontServiceModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const { distributionName } = diff.node;
    const { awsAccountId } = actionInputs.metadata;
    const { inputs } = actionInputs;

    // Resolve each origin from its source.
    const origins: CloudFrontOriginSchema[] = [];
    // An app behind a Lambda function or an ALB, rather than a bucket of static files.
    const appOriginIds: string[] = [];
    for (const origin of inputs.origins) {
      const originSettings = {
        connectionAttempts: origin.connectionAttempts ?? 3,
        connectionTimeout: origin.connectionTimeout ?? 10,
        customHeaders: { ...(origin.customHeaders || {}) },
        originId: origin.originId,
        originPath: origin.originPath || '',
      };

      if (hasNodeName(origin.source, 'execution')) {
        const [matchingAnchor] = await origin.source.getAnchorsMatchingSchema(AwsLambdaFunctionAnchorSchema, [], {
          searchBoundaryMembers: false,
        });
        const { functionName } = matchingAnchor.getSchemaInstance().properties;

        origins.push({ ...originSettings, kind: { kind: 'lambda', resourceId: `lambda-function-${functionName}` } });
        appOriginIds.push(origin.originId);
        continue;
      }

      const [matchingAlbAnchor] = await origin.source.getAnchorsMatchingSchema(AwsEcsAlbAnchorSchema, [], {
        searchBoundaryMembers: false,
      });
      if (matchingAlbAnchor) {
        const { albName } = matchingAlbAnchor.getSchemaInstance().properties;

        origins.push({ ...originSettings, kind: { kind: 'alb', resourceId: `alb-${albName}` } });
        appOriginIds.push(origin.originId);
        continue;
      }

      const [matchingAnchor] = await origin.source.getAnchorsMatchingSchema(AwsS3StorageServiceAnchorSchema, [], {
        searchBoundaryMembers: false,
      });
      const { awsRegionId, bucketName } = matchingAnchor.getSchemaInstance().properties;

      origins.push({ ...originSettings, kind: { bucketName, bucketRegion: awsRegionId, kind: 's3' } });
    }

    // Resolve each route, filling what is unset with what suits its origin: a bucket of static files,
    // or an app serving an API.
    const behaviors: CloudFrontBehaviorSchema[] = inputs.routes.map((route) => {
      const isAppOrigin = appOriginIds.includes(route.originId);

      return {
        allowedMethods:
          route.allowedMethods ||
          (isAppOrigin ? ['GET', 'HEAD', 'OPTIONS', 'PUT', 'POST', 'PATCH', 'DELETE'] : ['GET', 'HEAD']),
        cachedMethods: route.cachedMethods || ['GET', 'HEAD'],
        cachePolicy:
          route.cachePolicy ||
          ({ kind: 'managed', name: isAppOrigin ? 'Managed-CachingDisabled' : 'Managed-CachingOptimized' } as const),
        compress: route.compress ?? true,
        functionAssociations: [...(route.functionAssociations || [])],
        originRequestPolicy:
          route.originRequestPolicy ||
          (isAppOrigin ? { kind: 'managed', name: 'Managed-AllViewerExceptHostHeader' } : null),
        pathPattern: route.pathPattern || null,
        responseHeadersPolicy: route.responseHeadersPolicy || null,
        targetOriginId: route.originId,
        viewerProtocolPolicy: route.viewerProtocolPolicy || 'redirect-to-https',
      };
    });

    // Create CloudFront Distribution.
    const aliases = [...(inputs.aliases || [])];
    const cloudFrontDistribution = new CloudFrontDistribution(`cloudfront-${distributionName}`, {
      aliases,
      awsAccountId,
      behaviors,
      cachePolicies: [...(inputs.cachePolicies || [])],
      comment: aliases[0] || distributionName,
      customErrorResponses: [...(inputs.errorResponses || [])],
      defaultRootObject: inputs.defaultRootObject || '',
      distributionName,
      enabled: true,
      geoRestriction: { kind: 'none' },
      httpVersion: 'http2and3',
      originGroups: [],
      originRequestPolicies: [...(inputs.originRequestPolicies || [])],
      origins,
      priceClass: inputs.priceClass || 'PriceClass_All',
      responseHeadersPolicies: [...(inputs.responseHeadersPolicies || [])],
      viewerCertificate: inputs.certificateArn
        ? {
            certificateArn: inputs.certificateArn,
            kind: 'acm',
            // eslint-disable-next-line spellcheck/spell-checker
            minimumProtocolVersion: 'TLSv1.2_2021',
          }
        : { kind: 'default' },
    });

    actionOutputs[cloudFrontDistribution.resourceId] = cloudFrontDistribution;

    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAwsCloudFrontServiceModelAction>(AddAwsCloudFrontServiceModelAction)
export class AddAwsCloudFrontServiceModelActionFactory {
  private static instance: AddAwsCloudFrontServiceModelAction;

  /**
   * @internal
   */
  static async create(): Promise<AddAwsCloudFrontServiceModelAction> {
    if (!this.instance) {
      this.instance = new AddAwsCloudFrontServiceModelAction();
    }
    return this.instance;
  }
}
