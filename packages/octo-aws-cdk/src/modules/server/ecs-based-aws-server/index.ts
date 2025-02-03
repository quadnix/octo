import './models/server/index.js';
import './overlays/server-s3-access/index.js';

import '../../../resources/iam-role/index.js';
import '../../../resources/s3-storage/index.js';

export { AwsServerModule } from './aws-server.module.js';
