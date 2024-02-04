import { IAnchor } from './anchor.interface.js';

export interface IOverlay {
  anchors: IAnchor[];

  overlayId: string;

  properties: { [key: string]: unknown };
}
