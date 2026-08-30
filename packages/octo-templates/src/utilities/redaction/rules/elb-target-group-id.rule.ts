import type { IRedactionRule } from '../redaction.utility.js';

/**
 * The identifier AWS mints for an ELB target group, e.g. the `a5011f203bf2381a` of
 * `targetgroup/backend-v1-80/a5011f203bf2381a`.
 *
 * Only the suffix matches, because the target group's name in front of it is octo's and is stable.
 * A validate report truncates a long value, so the suffix is matched from two characters up: the
 * whole of it reaches the report in `arn_suffix`, and the first characters of it reach `arn` and
 * `id`. Both are the same live identifier and both move when the target group is recreated.
 */
export const ELB_TARGET_GROUP_ID_RULE: IRedactionRule = {
  name: 'ELB target group id',
  patterns: [/(?<=targetgroup\/[\w.-]{1,64}\/)[0-9a-f]{2,16}\b/g],
  placeholders: [],
  token: null,
};
