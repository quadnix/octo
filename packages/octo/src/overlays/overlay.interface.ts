import type { UnknownOverlay } from '../app.type.js';
import type { BaseOverlaySchema } from './overlay.schema.js';

export interface IOverlay<S extends BaseOverlaySchema, T extends UnknownOverlay> {}
