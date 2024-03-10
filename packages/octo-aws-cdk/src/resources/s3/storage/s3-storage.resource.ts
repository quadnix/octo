import { AResource, Diff, DiffAction, IResource, Resource } from '@quadnix/octo';
import { IS3StorageProperties } from './s3-storage.interface.js';

@Resource()
export class S3Storage extends AResource<S3Storage> {
  readonly MODEL_NAME: string = 's3-storage';

  private readonly manifestDiff: { [key: string]: ['add' | 'delete' | 'deleteDirectory', string] } = {};

  constructor(resourceId: string, properties: IS3StorageProperties) {
    super(resourceId, properties as unknown as IResource['properties'], []);
  }

  override async diff(previous?: S3Storage): Promise<Diff[]> {
    const diffs = await super.diff(previous);

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
