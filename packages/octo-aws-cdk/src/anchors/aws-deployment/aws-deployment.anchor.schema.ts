import { BaseAnchorSchema, type Deployment, Schema, Validate } from '@quadnix/octo';

/**
 * Defines a port the deployment's code listens on.
 *
 * @group Anchors/AwsDeployment
 *
 * @hideconstructor
 */
export class AwsDeploymentAnchorPortSchema {
  /**
   * The port number the code listens on.
   */
  @Validate({ options: { maxLength: 65535, minLength: 1 } })
  containerPort = Schema<number>();

  /**
   * The protocol the code listens on.
   */
  @Validate({ options: { regex: /^(tcp|udp)$/ } })
  protocol = Schema<'tcp' | 'udp'>();
}

/**
 * Defines the code a deployment runs and what that code needs.
 *
 * A runtime reads only the fields it uses. An execution module checks that every field its runtime
 * needs is set and within the runtime's limits, so a field one runtime ignores can still be set.
 *
 * @group Anchors/AwsDeployment
 *
 * @hideconstructor
 */
export class AwsDeploymentAnchorPropertiesSchema {
  /**
   * The command to run, replacing the image's own, or `null` to keep the image's own command.
   */
  @Validate({
    destruct: (value: AwsDeploymentAnchorPropertiesSchema['command']): string[] => (value ? [value] : []),
    options: { minLength: 1 },
  })
  command = Schema<string | null>();

  /**
   * The CPU units the code needs, where 1024 units are one vCPU, or `null` to leave it to the runtime.
   */
  @Validate({
    destruct: (value: AwsDeploymentAnchorPropertiesSchema['cpu']): number[] => (value ? [value] : []),
    options: { minLength: 1 },
  })
  cpu = Schema<number | null>();

  /**
   * The container image the code is in. It is either an image octo publishes into ECR, named by its
   * image and tag, or any other image, named by its URI.
   */
  @Validate<unknown>([
    {
      options: {
        custom: (value: AwsDeploymentAnchorPropertiesSchema['image']): boolean =>
          value.kind === 'ecr' ? !!value.imageId && !!value.imageTag : value.kind === 'uri' && !!value.uri,
      },
    },
  ])
  image = Schema<{ imageId: string; imageTag: string; kind: 'ecr' } | { kind: 'uri'; uri: string }>();

  /**
   * The memory the code needs in MiB, or `null` to leave it to the runtime.
   */
  @Validate({
    destruct: (value: AwsDeploymentAnchorPropertiesSchema['memory']): number[] => (value ? [value] : []),
    options: { minLength: 1 },
  })
  memory = Schema<number | null>();

  /**
   * The ports the code listens on.
   * See {@link AwsDeploymentAnchorPortSchema} for options.
   */
  @Validate({
    destruct: (value: AwsDeploymentAnchorPropertiesSchema['ports']): AwsDeploymentAnchorPortSchema[] => value,
    options: { isSchema: { schema: AwsDeploymentAnchorPortSchema } },
  })
  ports = Schema<AwsDeploymentAnchorPortSchema[]>();

  /**
   * How long one request may run in seconds, or `null` to leave it to the runtime.
   */
  @Validate({
    destruct: (value: AwsDeploymentAnchorPropertiesSchema['timeoutInSeconds']): number[] => (value ? [value] : []),
    options: { minLength: 1 },
  })
  timeoutInSeconds = Schema<number | null>();
}

/**
 * This anchor is associated with a {@link Deployment} model built by an AWS deployment module.
 * It holds the code the deployment runs and what that code needs, for any AWS execution module to read.
 *
 * @group Anchors/AwsDeployment
 *
 * @hideconstructor
 *
 * @see [AModel](/api/octo/class/AModel)'s `getAnchorsMatchingSchema()` to consume this anchor from
 * your own module.
 */
export class AwsDeploymentAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Deployment;

  /**
   * Input properties.
   * See {@link AwsDeploymentAnchorPropertiesSchema} for options.
   */
  @Validate({ options: { isSchema: { schema: AwsDeploymentAnchorPropertiesSchema } } })
  override properties = Schema<{
    [K in keyof AwsDeploymentAnchorPropertiesSchema]: AwsDeploymentAnchorPropertiesSchema[K];
  }>();
}
