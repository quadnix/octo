import { AModule, Module, ModuleError } from '@quadnix/octo';
import { AwsDeploymentAnchor } from '../../../anchors/aws-deployment/aws-deployment.anchor.js';
import type { AwsDeploymentAnchorSchema } from '../../../anchors/aws-deployment/aws-deployment.anchor.schema.js';
import { AwsEcrImageAnchorSchema } from '../../../anchors/aws-ecr/aws-ecr-image.anchor.schema.js';
import { CommonUtility } from '../../../utilities/common/common.utility.js';
import { AwsDeploymentModuleSchema } from './index.schema.js';
import { AwsDeployment } from './models/deployment/index.js';
import { AwsDeploymentImageOverlay } from './overlays/aws-deployment-image/index.js';

/**
 * `AwsDeploymentModule` is an AWS deployment module that provides an implementation for the
 * `Deployment` model. A deployment is one version of a server's code: the container image it is in,
 * and what it needs to run - command, ports, CPU, memory and timeout. It creates nothing
 * and knows nothing about where the code runs. The execution that runs it checks the fields its
 * runtime needs, so a field one runtime ignores can still be set.
 *
 * An image octo publishes is named by its image and tag rather than by its URI, so the image is always
 * pushed before anything runs it. The module publishing the tag, `AwsEcrImageTagModule`, must be loaded
 * too; the execution running the deployment fails if the tag is not published where it runs.
 *
 * @example
 * TypeScript
 * ```ts
 * import { type Image, type Server, stub } from '@quadnix/octo';
 * import { AwsDeploymentModule } from '@quadnix/octo-aws-cdk/modules/deployment/aws-deployment';
 *
 * octo.loadModule(AwsDeploymentModule, 'my-deployment-module', {
 *   deploymentTag: 'v1',
 *   image: stub<Image>('${{my-image-module.model.image}}'),
 *   imageTag: '0.0.1',
 *   memory: 512,
 *   ports: [{ containerPort: 8080, protocol: 'tcp' }],
 *   server: stub<Server>('${{my-server-module.model.server}}'),
 *   timeoutInSeconds: 30,
 * });
 * ```
 *
 * @group Modules/Deployment/AwsDeployment
 *
 * @see {@link AwsDeploymentModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see [Deployment](/api/octo/class/Deployment) to learn more about the `Deployment` model.
 */
@Module<AwsDeploymentModule>('@octo', AwsDeploymentModuleSchema)
export class AwsDeploymentModule extends AModule<AwsDeploymentModuleSchema, AwsDeployment> {
  /**
   * Creates the deployment under its server, anchors what it needs, and links it to the ECR image
   * whose tag it runs.
   */
  async onInit(inputs: AwsDeploymentModuleSchema): Promise<(AwsDeployment | AwsDeploymentImageOverlay)[]> {
    const { image, imageTag, imageUri, server } = inputs;

    // Validate the image is named exactly one way.
    if (!!imageUri === !!image || !!image !== !!imageTag) {
      throw new ModuleError(
        'Name the image either by "image" and "imageTag", or by "imageUri"!',
        this.constructor.name,
      );
    }

    // Create a new deployment.
    const deployment = new AwsDeployment(inputs.deploymentTag);
    server.addDeployment(deployment);
    const models: (AwsDeployment | AwsDeploymentImageOverlay)[] = [deployment];

    // Add anchors.
    const deploymentImage: AwsDeploymentAnchorSchema['properties']['image'] = image
      ? { imageId: image.imageId, imageTag: imageTag!, kind: 'ecr' }
      : { kind: 'uri', uri: imageUri! };
    const deploymentAnchor = new AwsDeploymentAnchor(
      'AwsDeploymentAnchor',
      {
        command: inputs.command!,
        cpu: inputs.cpu!,
        image: deploymentImage,
        memory: inputs.memory!,
        ports: inputs.ports!.map((p) => ({ containerPort: p.containerPort, protocol: p.protocol })),
        timeoutInSeconds: inputs.timeoutInSeconds!,
      },
      deployment,
    );
    deployment.addAnchor(deploymentAnchor);

    if (!image) {
      return models;
    }

    // Link the deployment to the image.
    const [matchingAwsEcrImageAnchor] = await image.getAnchorsMatchingSchema(AwsEcrImageAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    const overlayIdSuffix = CommonUtility.hash(server.serverKey, deployment.deploymentTag).substring(0, 12);
    models.push(
      new AwsDeploymentImageOverlay(
        `aws-deployment-image-overlay-${overlayIdSuffix}`,
        {
          deploymentTag: deployment.deploymentTag,
          imageId: image.imageId,
          imageTag: imageTag!,
          serverKey: server.serverKey,
        },
        [deploymentAnchor, matchingAwsEcrImageAnchor],
      ),
    );

    return models;
  }
}
