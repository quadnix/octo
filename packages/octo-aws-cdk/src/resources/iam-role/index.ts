import './actions/add-iam-role.resource.action.js';
import './actions/delete-iam-role.resource.action.js';
import './actions/update-iam-role-assume-role-policy.resource.action.js';
import './actions/update-iam-role-with-aws-policy.resource.action.js';
import './actions/update-iam-role-with-s3-storage-policy.resource.action.js';

export { IamRole } from './iam-role.resource.js';
export {
  IIamRoleAssumeRolePolicy,
  IIamRolePolicy,
  IIamRolePolicyTypes,
  IIamRoleS3BucketPolicy,
  IamRoleSchema,
} from './iam-role.schema.js';
