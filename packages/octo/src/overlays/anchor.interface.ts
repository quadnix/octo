import type { IModelReference } from '../models/model.interface.js';
import type { AAnchor } from './anchor.abstract.js';

export interface IAnchor {
  anchorId: AAnchor['anchorId'];
  parent: IModelReference;
}
