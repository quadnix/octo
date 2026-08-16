import { DeleteTaskDefinitionsCommand, ECSClient } from '@aws-sdk/client-ecs';

/**
 * `DeleteTaskDefinitions` accepts at most 10 task definitions per call.
 */
const DELETE_BATCH_SIZE = 10;

/**
 * ECS operations an e2e teardown needs that terraform does not perform.
 */
export class AwsEcsUtility {
  private readonly client: ECSClient;

  /**
   * @param endpoint Address of an AWS-compatible service, e.g. a localstack container. Defaults to AWS.
   */
  constructor(region: string, endpoint?: string) {
    this.client = new ECSClient({ endpoint, region });
  }

  /**
   * Permanently deletes the given task definition revisions.
   *
   * Destroying an `aws_ecs_task_definition` only retires the revision to INACTIVE; this reclaims it.
   * The delete is asynchronous — the revision sits in DELETE_IN_PROGRESS and stays visible to the
   * tagging API meanwhile — so it is a cleanup, not something a teardown assertion can depend on. See
   * `AwsLiveResourcesUtility`.
   *
   * @returns The ARNs AWS refused to delete, paired with its reason.
   */
  async deleteTaskDefinitions(taskDefinitionArns: string[]): Promise<{ arn: string; reason: string }[]> {
    const failures: { arn: string; reason: string }[] = [];

    for (let i = 0; i < taskDefinitionArns.length; i += DELETE_BATCH_SIZE) {
      const batch = taskDefinitionArns.slice(i, i + DELETE_BATCH_SIZE);
      const response = await this.client.send(new DeleteTaskDefinitionsCommand({ taskDefinitions: batch }));

      for (const failure of response.failures ?? []) {
        if (failure.arn) {
          failures.push({ arn: failure.arn, reason: failure.reason ?? 'unknown' });
        }
      }
    }

    return failures;
  }
}
