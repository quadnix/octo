import {
  AResource,
  Diff,
  DiffAction,
  DiffUtility,
  type DiffValueTypeTagUpdate,
  Resource,
  ResourceError,
} from '@quadnix/octo';
import { S3WebsiteSchema } from './index.schema.js';

/**
 * @internal
 */
export type S3WebsiteManifestDiff = {
  [key: string]: ['add' | 'delete' | 'update', string];
};

/**
 * @internal
 */
@Resource<S3Website>('@octo', 's3-website', S3WebsiteSchema)
export class S3Website extends AResource<S3WebsiteSchema, S3Website> {
  declare properties: S3WebsiteSchema['properties'];
  declare response: S3WebsiteSchema['response'];

  private readonly manifestDiff: S3WebsiteManifestDiff = {};

  constructor(resourceId: string, properties: S3WebsiteSchema['properties']) {
    super(resourceId, properties, []);
  }

  override async diffInverse(diff: Diff, deReferenceResource: (resourceId: string) => Promise<never>): Promise<void> {
    if (diff.field === 'update-source-paths' && diff.action === DiffAction.UPDATE) {
      // do nothing, since nothing in node changes for this diff action.
    } else {
      await super.diffInverse(diff, deReferenceResource);
    }
  }

  override async diffProperties(previous: S3Website): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties)) {
      throw new ResourceError('Cannot update S3 Website immutable properties once it has been created!', this);
    }

    const diffs: Diff[] = [];

    if (this.manifestDiff && Object.keys(this.manifestDiff).length > 0) {
      diffs.push(
        new Diff<any, S3WebsiteManifestDiff>(
          this,
          DiffAction.UPDATE,
          'update-source-paths',
          JSON.parse(JSON.stringify(this.manifestDiff)),
        ),
      );
    }

    return diffs;
  }

  override diffUnpack(diff: Diff): Diff[] {
    if (diff.action === DiffAction.ADD && diff.field === 'resourceId') {
      const diffs: Diff[] = [diff];

      if (this.manifestDiff && Object.keys(this.manifestDiff).length > 0) {
        diffs.push(
          new Diff<any, S3WebsiteManifestDiff>(
            this,
            DiffAction.UPDATE,
            'update-source-paths',
            JSON.parse(JSON.stringify(this.manifestDiff)),
          ),
        );
      }

      if (this.tags && Object.keys(this.tags).length > 0) {
        diffs.push(
          new Diff<any, DiffValueTypeTagUpdate>(this, DiffAction.UPDATE, 'tags', {
            add: JSON.parse(JSON.stringify(this.tags)),
            delete: [],
            update: {},
          }),
        );
      }

      return diffs;
    } else {
      return [diff];
    }
  }

  updateManifestDiff(manifestDiff: S3WebsiteManifestDiff): void {
    for (const key of Object.keys(manifestDiff)) {
      this.manifestDiff[key] = [...manifestDiff[key]];
    }
  }
}
