import { Validate } from '../../decorators/validate.decorator.js';
import { Schema } from '../../functions/schema/schema.js';

export class ImageSchema {
  /**
   * Options passed to the Docker engine while building the image.
   */
  dockerOptions = Schema<{
    /**
     * Absolute path of the Dockerfile.
     */
    dockerfilePath: string;

    /**
     * Build arguments, same as [--build-arg](https://docs.docker.com/build/guide/build-args/) option.
     */
    buildArgs?: { [key: string]: string };

    /**
     * To suppress Docker output, same as [--quiet](https://docs.docker.com/reference/cli/docker/container/run/) option.
     */
    quiet?: boolean;
  }>();

  /**
   * An imageId is the unique identifier for this image.
   * - Format of imageId is `{imageName}:{imageTag}`
   */
  imageId = Schema<string>();

  /**
   * The name of the image, same as [namespace in Docker](https://docs.docker.com/reference/cli/docker/image/tag/).
   */
  @Validate({ options: { maxLength: 32, minLength: 2, regex: /^[a-zA-Z@][\w\-\/]*[a-zA-Z0-9]$/ } })
  imageName = Schema<string>();

  /**
   * The tag of the image, same as [tag in Docker](https://docs.docker.com/reference/cli/docker/image/tag/).
   * - Unlike Docker, `imageTag` is mandatory in Octo.
   */
  @Validate({ options: { maxLength: 32, minLength: 2, regex: /^[a-zA-Z0-9][\w.-]*[a-zA-Z0-9]$/ } })
  imageTag = Schema<string>();
}
