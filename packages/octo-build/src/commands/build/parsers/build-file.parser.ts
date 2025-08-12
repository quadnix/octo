import type { IBuildConfiguration, IJob } from '../models/build-configuration.interface.js';

export class BuildFileParser {
  static parse(content: any): IBuildConfiguration {
    const jobs: { [key: string]: IJob } = {};
    for (const jobName of Object.keys(content?.jobs || {})) {
      const job = content.jobs[jobName];
      if (!job.command) {
        throw new Error('Missing required property - jobs > command');
      }

      jobs[jobName] = {
        command: job.command,
        dependsOn: job.dependsOn || [],
        onError: job.onError?.toLowerCase() || 'throw',
        retry: Number(job.retry) || 0,
        timeout: Number(job.timeout) || 0,
      };
    }

    return {
      dist: content?.dist || '',
      env:
        content?.env?.variables &&
        typeof content.env.variables === 'object' &&
        Object.keys(content.env.variables).length > 0
          ? content.env.variables
          : {},
      jobs,
    };
  }
}
