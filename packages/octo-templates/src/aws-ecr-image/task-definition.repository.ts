import { DescribeTaskDefinitionCommand, ECSClient } from '@aws-sdk/client-ecs';

/**
 * Reads the ECS task definition this template's consumer registers, so the e2e can prove the image
 * URI AWS was given is the one octo published, rather than the empty value a broken response would
 * leave behind.
 */
export class TaskDefinitionRepository {
  private readonly client: ECSClient;

  /**
   * @param endpoint Address of an AWS-compatible service, e.g. a localstack container. Defaults to AWS.
   */
  constructor(region: string, endpoint?: string) {
    this.client = new ECSClient({ endpoint, region });
  }

  /**
   * Returns the image each of the task definition's containers runs, in the order they are defined.
   *
   * @param taskDefinition The ARN of one revision, or a family name for its newest revision.
   * @returns The images, or `null` when AWS holds no such task definition.
   */
  async getContainerImages(taskDefinition: string): Promise<string[] | null> {
    try {
      const { taskDefinition: described } = await this.client.send(
        new DescribeTaskDefinitionCommand({ taskDefinition }),
      );
      return described?.containerDefinitions?.map((containerDefinition) => containerDefinition.image ?? '') ?? null;
    } catch (error) {
      if (error.name === 'ClientException') {
        return null;
      }
      throw error;
    }
  }
}
