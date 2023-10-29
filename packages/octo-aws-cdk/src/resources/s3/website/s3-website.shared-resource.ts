import { Diff, DiffAction, SharedResource } from '@quadnix/octo';
import { S3Website } from './s3-website.resource.js';

export class SharedS3Website extends SharedResource<S3Website> {
  constructor(resource: S3Website) {
    super(resource);
  }

  override async diff(previous?: SharedS3Website): Promise<Diff[]> {
    const diffs: Diff[] = [];

    // Update marker for S3 website is always set to either regions or update-source-paths.
    const updateMarker = this.getUpdateMarker();
    const action = updateMarker!.key === 'regions' ? updateMarker!.value : 'UPDATE';

    if (action.toUpperCase() === 'DELETE' && previous) {
      diffs.push(new Diff(this, DiffAction.DELETE, 'resourceId', this.resourceId));
    } else if (action.toUpperCase() === 'ADD' && !previous) {
      diffs.push(new Diff(this, DiffAction.ADD, 'resourceId', this.resourceId));
    } else if (action.toUpperCase() === 'UPDATE') {
      diffs.push(new Diff(this, DiffAction.UPDATE, 'resourceId', this.resourceId));
    }

    return diffs;
  }
}
