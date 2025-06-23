import './actions/add-iam-user.resource.action.js';
import './actions/delete-iam-user.resource.action.js';
import './actions/update-iam-user-with-s3-storage-policy.resource.action.js';
import './actions/update-iam-user-tags.resource.action.js';

export {
  type IIamUserAddPolicyDiff,
  type IIamUserDeletePolicyDiff,
  type IIamUserPolicyDiff,
  IamUser,
  isAddPolicyDiff,
  isDeletePolicyDiff,
} from './iam-user.resource.js';
