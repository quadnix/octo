import { AAnchor, Anchor, BaseAnchorSchema, Schema, type Service, Validate } from '@quadnix/octo';

class AwsS3DirectoryAnchorSchema extends BaseAnchorSchema {
  @Validate({
    destruct: (value): string[] => [value.bucketName, [value.remoteDirectoryPath]],
    options: { minLength: 1 },
  })
  override properties = Schema<{
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
