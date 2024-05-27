import './anchors/iam-role.anchor.js';
import './anchors/iam-user.anchor.js';
import './anchors/s3-directory.anchor.js';
import './anchors/security-group.anchor.js';

import './factories/aws/ec2.aws.factory.js';
import './factories/aws/ecr.aws.factory.js';
import './factories/aws/ecs.aws.factory.js';
import './factories/aws/efs.aws.factory.js';
import './factories/aws/iam.aws.factory.js';
import './factories/aws/s3.aws.factory.js';
import './factories/aws/sts.aws.factory.js';

export { AwsDeployment } from './models/deployment/aws.deployment.model.js';
import './models/deployment/actions/add-deployment.model.action.js';
import './models/deployment/actions/delete-deployment.model.action.js';

import './models/environment/actions/add-environment.model.action.js';
import './models/environment/actions/delete-environment.model.action.js';

import './models/execution/actions/add-execution.model.action.js';
import './models/execution/actions/delete-execution.model.action.js';

import './models/image/actions/add-image.model.action.js';
import './models/image/actions/delete-image.model.action.js';

export { AwsRegion, RegionId } from './models/region/aws.region.model.js';
import './models/region/actions/add-region.model.action.js';
import './models/region/actions/delete-region.model.action.js';

export { AwsServer } from './models/server/aws.server.model.js';
import './models/server/actions/add-server.model.action.js';
import './models/server/actions/delete-server.model.action.js';

export { EcrService } from './models/service/ecr/ecr.service.model.js';
import './models/service/ecr/actions/add-ecr-service.model.action.js';
import './models/service/ecr/actions/add-image-to-ecr.model.action.js';
import './models/service/ecr/actions/delete-image-from-ecr.model.action.js';

export { S3StaticWebsiteService } from './models/service/s3-static-website/s3-static-website.service.model.js';
import './models/service/s3-static-website/actions/add-s3-static-website.model.action.js';
import './models/service/s3-static-website/actions/delete-s3-static-website.model.action.js';
import './models/service/s3-static-website/actions/update-source-paths-s3-static-website.model.action.js';

export { S3StorageAccess, S3StorageService } from './models/service/s3-storage/s3-storage.service.model.js';
import './models/service/s3-storage/actions/add-s3-storage.model.action.js';
import './models/service/s3-storage/actions/delete-s3-storage.model.action.js';

import './models/subnet/actions/add-subnet.model.action.js';
import './models/subnet/actions/delete-subnet.model.action.js';
import './models/subnet/actions/update-subnet-association.model.action.js';

export { AwsSubnet } from './models/subnet/aws.subnet.model.js';

export { AwsRegionSharedEfsModule } from './modules/aws-region-shared-efs.module.js';
export { S3WebsiteSaveManifestModule } from './modules/s3-website-save-manifest.module.js';

import './overlays/s3-storage-access/actions/add-s3-storage-access.overlay.action.js';
import './overlays/s3-storage-access/actions/delete-s3-storage-access.overlay.action.js';
import './overlays/security-group/actions/add-security-group.overlay.action.js';
import './overlays/security-group/actions/update-security-group.overlay.action.js';

import './resources/ecr/actions/add-ecr-image.resource.action.js';
import './resources/ecr/actions/delete-ecr-image.resource.action.js';

import './resources/ecs/actions/add-ecs-cluster.resource.action.js';
import './resources/ecs/actions/add-ecs-service.resource.action.js';
import './resources/ecs/actions/add-ecs-task-definition.resource.action.js';
import './resources/ecs/actions/delete-ecs-cluster.resource.action.js';
import './resources/ecs/actions/delete-ecs-service.resource.action.js';
import './resources/ecs/actions/delete-ecs-task-definition.resource.action.js';

import './resources/efs/actions/add-efs.resource.action.js';
import './resources/efs/actions/add-efs-mount-target.resource.action.js';
import './resources/efs/actions/delete-efs.resource.action.js';
import './resources/efs/actions/delete-efs-mount-target.resource.action.js';

import './resources/iam/actions/add-iam-role.resource.action.js';
import './resources/iam/actions/add-iam-user.resource.action.js';
import './resources/iam/actions/delete-iam-role.resource.action.js';
import './resources/iam/actions/delete-iam-user.resource.action.js';
import './resources/iam/actions/update-iam-role-with-s3-storage-policy.resource.action.js';
import './resources/iam/actions/update-iam-user-with-s3-storage-policy.resource.action.js';

import './resources/internet-gateway/actions/add-internet-gateway.resource.action.js';
import './resources/internet-gateway/actions/delete-internet-gateway.resource.action.js';

import './resources/network-acl/actions/add-network-acl.resource.action.js';
import './resources/network-acl/actions/delete-network-acl.resource.action.js';
import './resources/network-acl/actions/update-network-acl-entries.resource.action.js';

import './resources/route-table/actions/add-route-table.resource.action.js';
import './resources/route-table/actions/delete-route-table.resource.action.js';

import './resources/s3/storage/actions/add-s3-storage.resource.action.js';
import './resources/s3/storage/actions/delete-s3-storage.resource.action.js';
import './resources/s3/storage/actions/update-source-paths-in-s3-storage.resource.action.js';

import './resources/s3/website/actions/add-s3-website.resource.action.js';
import './resources/s3/website/actions/delete-s3-website.resource.action.js';
import './resources/s3/website/actions/update-source-paths-in-s3-website.resource.action.js';

import './resources/security-group/actions/add-security-group.resource.action.js';
import './resources/security-group/actions/delete-security-group.resource.action.js';
import './resources/security-group/actions/update-security-group-rules.resource.action.js';

import './resources/subnet/actions/add-subnet.resource.action.js';
import './resources/subnet/actions/delete-subnet.resource.action.js';

import './resources/vpc/actions/add-vpc.resource.action.js';
import './resources/vpc/actions/delete-vpc.resource.action.js';

export { OctoAws } from './main.js';
