import { AAnchor, Anchor, BaseAnchorSchema, Schema, type Service } from '@quadnix/octo';

class AwsS3DirectoryAnchorSchema extends BaseAnchorSchema {
  override properties = Schema<{
    allowRead: boolean;
    allowWrite: boolean;
    bucketName: string;
    remoteDirectoryPath: string;
  }>();
}

@Anchor('@octo')
export class AwsS3DirectoryAnchor extends AAnchor<AwsS3DirectoryAnchorSchema, Service> {
  declare properties: AwsS3DirectoryAnchorSchema['properties'];

  constructor(anchorId: string, properties: AwsS3DirectoryAnchorSchema['properties'], parent: Service) {
    super(anchorId, properties, parent);
  }
}
