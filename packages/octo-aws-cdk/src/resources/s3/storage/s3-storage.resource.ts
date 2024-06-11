import { AResource, Diff, DiffAction, Resource } from '@quadnix/octo';
import type { IS3StorageProperties } from './s3-storage.interface.js';

@Resource()
export class S3Storage extends AResource<S3Storage> {
  readonly MODEL_NAME: string = 's3-storage';

  declare properties: IS3StorageProperties;

  private readonly manifestDiff: { [key: string]: ['add' | 'delete' | 'deleteDirectory', string] } = {};

  constructor(resourceId: string, properties: IS3StorageProperties) {
    super(resourceId, properties, []);
  }

  override async diff(): Promise<Diff[]> {
    const diffs: Diff[] = [];

    if (this.manifestDiff && Object.keys(this.manifestDiff).length > 0) {
      diffs.push(new Diff(this, DiffAction.UPDATE, 'update-source-paths', this.manifestDiff));
    }

    return diffs;
  }

  updateManifestDiff(manifestDiff: S3Storage['manifestDiff']): void {
    for (const key of Object.keys(manifestDiff)) {
      this.manifestDiff[key] = [...manifestDiff[key]];
    }
  }
}
