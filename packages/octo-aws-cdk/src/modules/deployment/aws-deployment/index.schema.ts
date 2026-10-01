import { type Image, ImageSchema, Schema, type Server, ServerSchema, Validate } from '@quadnix/octo';
import { AwsDeploymentAnchorPortSchema } from '../../../anchors/aws-deployment/aws-deployment.anchor.schema.js';
import { AwsEcrImageAnchorSchema } from '../../../anchors/aws-ecr/aws-ecr-image.anchor.schema.js';
import { AwsServerAnchorSchema } from '../../../anchors/aws-server/aws-server.anchor.schema.js';

/**
 * `AwsDeploymentModuleSchema` is the input schema for the `AwsDeploymentModule` module.
 * This schema defines the code a deployment runs and what that code needs.
 *
 * The code is a container image: either `image` and `imageTag`, naming a tag octo publishes into ECR,
 * or `imageUri`, naming any other image. Every other field is what the code needs from whatever runs
 * it, and the execution module checks the ones its runtime uses.
 *
 * @group Modules/Deployment/AwsDeployment
 *
 * @hideconstructor
 *
 * @see {@link AwsDeploymentModule} to learn more about the `AwsDeploymentModule` module.
 */
export class AwsDeploymentModuleSchema {
  /**
   * The command to run, replacing the image's own, e.g. `node main.js`.
   */
  @Validate({
    destruct: (value: AwsDeploymentModuleSchema['command']): string[] => (value ? [value] : []),
    options: { minLength: 1 },
  })
  command? = Schema<string | null>(null);

  /**
   * The CPU units the code needs, where 1024 units are one vCPU. ECS needs it; Lambda derives CPU from
   * memory.
   */
  @Validate({
    destruct: (value: AwsDeploymentModuleSchema['cpu']): number[] => (value ? [value] : []),
    options: { minLength: 1 },
  })
  cpu? = Schema<number | null>(null);

  /**
   * A unique tag to identify this deployment version.
   */
  @Validate({ options: { minLength: 1 } })
  deploymentTag = Schema<string>();

  /**
   * The ECR image whose published tag the deployment runs. Set it with `imageTag`.
   */
  @Validate<unknown>([
    {
      destruct: (value: AwsDeploymentModuleSchema['image']): Image[] => (value ? [value] : []),
      options: {
        isModel: { anchors: [{ schema: AwsEcrImageAnchorSchema }], NODE_NAME: 'image' },
      },
    },
    {
      destruct: (value: AwsDeploymentModuleSchema['image']): ImageSchema[] => (value ? [value.synth()] : []),
      options: {
        isSchema: { schema: ImageSchema },
      },
    },
  ])
  image? = Schema<Image | null>(null);

  /**
   * The tag of `image` the deployment runs, e.g. `0.0.1`.
   */
  @Validate({
    destruct: (value: AwsDeploymentModuleSchema['imageTag']): string[] => (value ? [value] : []),
    options: { minLength: 1 },
  })
  imageTag? = Schema<string | null>(null);

  /**
   * The URI of an image octo does not publish, e.g. `docker.io/nginx:1.27`. Only ECS runs it.
   */
  @Validate({
    destruct: (value: AwsDeploymentModuleSchema['imageUri']): string[] => (value ? [value] : []),
    options: { minLength: 1 },
  })
  imageUri? = Schema<string | null>(null);

  /**
   * The memory the code needs, in MiB.
   */
  @Validate({
    destruct: (value: AwsDeploymentModuleSchema['memory']): number[] => (value ? [value] : []),
    options: { minLength: 1 },
  })
  memory? = Schema<number | null>(null);

  /**
   * The ports the code listens on.
   * See {@link AwsDeploymentAnchorPortSchema} for options.
   */
  @Validate({
    destruct: (value: AwsDeploymentModuleSchema['ports']): AwsDeploymentAnchorPortSchema[] => value!,
    options: { isSchema: { schema: AwsDeploymentAnchorPortSchema } },
  })
  ports? = Schema<AwsDeploymentAnchorPortSchema[]>([]);

  /**
   * The server whose code this is.
   */
  @Validate([
    {
      options: {
        isModel: { anchors: [{ schema: AwsServerAnchorSchema }], NODE_NAME: 'server' },
      },
    },
    {
      destruct: (value: AwsDeploymentModuleSchema['server']): [ServerSchema] => [value.synth()],
      options: {
        isSchema: { schema: ServerSchema },
      },
    },
  ])
  server = Schema<Server>();

  /**
   * How long one request may run, in seconds. Lambda needs it.
   */
  @Validate({
    destruct: (value: AwsDeploymentModuleSchema['timeoutInSeconds']): number[] => (value ? [value] : []),
    options: { minLength: 1 },
  })
  timeoutInSeconds? = Schema<number | null>(null);
}
