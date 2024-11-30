import { AResource, Diff, DiffAction, Resource } from '@quadnix/octo';
import { S3StorageSchema } from './s3-storage.schema.js';

@Resource<S3Storage>('@octo', 's3-storage', S3StorageSchema)
export class S3Storage extends AResource<S3StorageSchema, S3Storage> {
  declare properties: S3StorageSchema['properties'];
  declare response: S3StorageSchema['response'];

  private readonly manifestDiff: { [key: string]: ['add' | 'delete' | 'deleteDirectory', string] } = {};

  constructor(resourceId: string, properties: S3StorageSchema['properties']) {
    super(resourceId, properties, []);
  }

  override async diffInverse(diff: Diff, deReferenceResource: (resourceId: string) => Promise<never>): Promise<void> {
    if (diff.field === 'update-source-paths' && diff.action === DiffAction.UPDATE) {
      // do nothing, since nothing in node changes for this diff action.
    } else {
      await super.diffInverse(diff, deReferenceResource);
    }
  }

  override async diffProperties(): Promise<Diff[]> {
    const diffs: Diff[] = [];

    if (this.manifestDiff && Object.keys(this.manifestDiff).length > 0) {
      diffs.push(
        new Diff(this, DiffAction.UPDATE, 'update-source-paths', JSON.parse(JSON.stringify(this.manifestDiff))),
      );
    }

    return diffs;
  }

  updateManifestDiff(manifestDiff: S3Storage['manifestDiff']): void {
    for (const key of Object.keys(manifestDiff)) {
      this.manifestDiff[key] = [...manifestDiff[key]];
    }
  }
}
