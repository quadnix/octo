import type { UnknownModel } from '../app.type.js';
import type { INode, INodeReference } from '../functions/node/node.interface.js';
import type { AAnchor } from '../overlays/anchor.abstract.js';

/**
 * {@link AModel} interface.
 */
export interface IModel<I, T> extends INode<I, T> {
  /**
   * To add an {@link Anchor}.
   *
   * Each node can store multiple anchors for reference.
   * These anchors don't necessarily need to be parented by self, but must be unique,
   * i.e. an anchor, identified by it's parent, cannot be added twice to self's list of anchors.
   */
  addAnchor(anchor: AAnchor): void;

  /**
   * To get an anchor with a given ID and parent.
   *
   * @param anchorId The ID of the anchor.
   * @param parent The parent of the anchor.
   * - If parent is not given, then self is considered the parent of this anchor.
   */
  getAnchor(anchorId: string, parent?: UnknownModel): AAnchor | undefined;

  /**
   * To get the index of an anchor with a given ID and parent.
   *
   * @param anchorId The ID of the anchor.
   * @param parent The parent of the anchor.
   * - If parent is not given, then self is considered the parent of this anchor.
   */
  getAnchorIndex(anchorId: string, parent?: UnknownModel): number;

  /**
   * To get all anchors, filtered by anchor properties.
   *
   * @param filters A set of filters, where `key` is the property name and `value` is the value to filter by.
   */
  getAnchors(filters: { key: string; value: any }[]): AAnchor[];

  /**
   * To remove all anchors from self.
   */
  removeAllAnchors(): void;

  /**
   * To remove an anchor from self.
   *
   * @param anchor The anchor to remove.
   */
  removeAnchor(anchor: AAnchor): void;
}

export interface IModelReference extends INodeReference {}
