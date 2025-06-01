import './actions/add-iam-user.resource.action.js';
import './actions/delete-iam-user.resource.action.js';
import './actions/update-iam-user-with-s3-storage-policy.resource.action.js';

export {
  IamUser,
  type IIamUserPolicyDiff,
  type IIamUserAddPolicyDiff,
  type IIamUserDeletePolicyDiff,
  isAddPolicyDiff,
  isDeletePolicyDiff,
} from './iam-user.resource.js';
