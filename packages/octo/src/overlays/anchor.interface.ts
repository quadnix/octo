import { IModelReference } from '../models/model.interface.js';
import { AAnchor } from './anchor.abstract.js';

export interface IAnchor {
  anchorId: AAnchor['anchorId'];
  parent: IModelReference;
}
