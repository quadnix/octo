import './anchors/iam-role.anchor.model.js';
import './anchors/iam-user.anchor.model.js';

import './factories/aws/ec2.aws.factory.js';
import './factories/aws/ecr.aws.factory.js';
import './factories/aws/ecs.aws.factory.js';
import './factories/aws/efs.aws.factory.js';
import './factories/aws/iam.aws.factory.js';
import './factories/aws/s3.aws.factory.js';
import './factories/aws/sts.aws.factory.js';

import './models/environment/actions/add-environment.action.js';
import './models/environment/actions/delete-environment.action.js';

export { EcrImage } from './models/image/ecr.image.model.js';
import './models/image/actions/add-image.action.js';
import './models/image/actions/delete-image.action.js';

export { AwsRegion, AwsRegionId } from './models/region/aws.region.model.js';
import './models/region/actions/add-region.action.js';
import './models/region/actions/delete-region.action.js';

export { AwsServer } from './models/server/aws.server.model.js';
import './models/server/actions/add-server.action.js';
import './models/server/actions/delete-server.action.js';

export { S3StaticWebsiteService } from './models/service/s3-static-website/s3-static-website.service.model.js';
import './models/service/s3-static-website/actions/add-s3-static-website.action.js';
import './models/service/s3-static-website/actions/delete-s3-static-website.action.js';
import './models/service/s3-static-website/actions/update-source-paths-s3-static-website.action.js';

export { S3StorageService } from './models/service/s3-storage/s3-storage.service.model.js';
import './models/service/s3-storage/actions/add-s3-storage.action.js';
import './models/service/s3-storage/actions/delete-s3-storage.action.js';
import './models/service/s3-storage/actions/update-directories-s3-storage.action.js';

export { AAction } from './models/action.abstract.js';

export { NginxRouterModule } from './modules/routers/nginx.router.module.js';

import './resources/ecr/actions/add-ecr-image.action.js';
import './resources/ecr/actions/delete-ecr-image.action.js';

import './resources/ecs/actions/add-ecs-cluster.action.js';
import './resources/ecs/actions/delete-ecs-cluster.action.js';

import './resources/efs/actions/add-efs.action.js';
import './resources/efs/actions/delete-efs-action.js';

import './resources/iam/actions/add-iam-user.action.js';
import './resources/iam/actions/delete-iam-user.action.js';

import './resources/internet-gateway/actions/add-internet-gateway.action.js';
import './resources/internet-gateway/actions/delete-internet-gateway.action.js';

import './resources/network-acl/actions/add-network-acl.action.js';
import './resources/network-acl/actions/delete-network-acl.action.js';

import './resources/route-table/actions/add-route-table.action.js';
import './resources/route-table/actions/delete-route-table.action.js';

import './resources/s3/storage/actions/add-s3-storage.action.js';
import './resources/s3/storage/actions/delete-s3-storage.action.js';
import './resources/s3/storage/actions/update-add-directories-in-s3-storage.action.js';
import './resources/s3/storage/actions/update-remove-directories-in-s3-storage.action.js';

// import './resources/s3/website/actions/add-s3-website.action.js';
// import './resources/s3/website/actions/delete-s3-website.action.js';
// import './resources/s3/website/actions/update-source-paths-in-s3-website.action.js';

import './resources/security-groups/actions/add-security-group.action.js';
import './resources/security-groups/actions/delete-security-group.action.js';

import './resources/subnet/actions/add-subnet.action.js';
import './resources/subnet/actions/delete-subnet.action.js';

import './resources/vpc/actions/add-vpc.action.js';
import './resources/vpc/actions/delete-vpc.action.js';

export { OctoAws } from './main.js';
