import './actions/add-iam-role.resource.action.js';
import './actions/delete-iam-role.resource.action.js';
import './actions/update-iam-role-assume-role-policy.resource.action.js';
import './actions/update-iam-role-with-aws-policy.resource.action.js';
import './actions/update-iam-role-with-s3-storage-policy.resource.action.js';
import './actions/update-iam-role-tags.resource.action.js';

export {
  type IIamRoleAddPolicyDiff,
  type IIamRoleDeletePolicyDiff,
  type IIamRolePolicyDiff,
  IamRole,
  isAddPolicyDiff,
  isDeletePolicyDiff,
} from './iam-role.resource.js';
