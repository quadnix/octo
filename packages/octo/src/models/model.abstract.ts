import { NodeType, type UnknownModel } from '../app.type.js';
import { Diff, DiffAction } from '../functions/diff/diff.js';
import { DiffUtility } from '../functions/diff/diff.utility.js';
import { ANode } from '../functions/node/node.abstract.js';
import type { AAnchor } from '../overlays/anchor.abstract.js';
import type { IModel } from './model.interface.js';

export abstract class AModel<I, T> extends ANode<I, T> implements IModel<I, T> {
  abstract override readonly NODE_NAME: string;
  override readonly NODE_TYPE: NodeType = NodeType.MODEL;

  private readonly anchors: AAnchor[] = [];

  addAnchor(anchor: AAnchor): void {
    const existingAnchor = this.getAnchor(anchor.anchorId, anchor.getParent());
    if (!existingAnchor) {
      this.anchors.push(anchor);
    }
  }

  override async diff(): Promise<Diff[]> {
    const diffs: Diff[] = [];

    const currentChildrenByModels = this.getChildren();
    for (const modelName of Object.keys(currentChildrenByModels)) {
      const previousChildren = [];
      const currentChildren = currentChildrenByModels[modelName].map((d) => d.to);
      const field = currentChildrenByModels[modelName][0].getRelationship()!.toField;
      const childrenDiffs = await DiffUtility.diffNodes(previousChildren, currentChildren, field as string);
      diffs.push(...childrenDiffs);
    }

    const currentSiblingsByModels = this.getSiblings();
    for (const modelName of Object.keys(currentSiblingsByModels)) {
      const currentSiblings = currentSiblingsByModels[modelName];

      for (const cd of currentSiblings) {
        // Skip OVERLAY sibling, since overlays are diffed separately.
        if (cd.to.NODE_TYPE === NodeType.OVERLAY) {
          continue;
        }

        diffs.push(new Diff(this, DiffAction.ADD, 'sibling', cd.to));
      }
    }

    // Add model.
    diffs.push(new Diff(this, DiffAction.ADD, '', ''));

    // Diff model properties.
    const propertyDiffs = await this.diffProperties();
    diffs.push(...propertyDiffs);

    return diffs;
  }

  override async diffProperties(): Promise<Diff[]> {
    return [];
  }

  getAnchor(anchorId: string, parent?: UnknownModel): AAnchor | undefined {
    const index = this.getAnchorIndex(anchorId, parent);
    return index > -1 ? this.anchors[index] : undefined;
  }

  getAnchorIndex(anchorId: string, parent?: UnknownModel): number {
    return this.anchors.findIndex(
      (a) => a.anchorId === anchorId && a.getParent().getContext() === (parent || this).getContext(),
    );
  }

  getAnchors(filters: { key: string; value: any }[] = []): AAnchor[] {
    return this.anchors.filter((a) => filters.every((c) => a[c.key] === c.value));
  }

  removeAllAnchors(): void {
    const anchors = this.getAnchors();
    while (anchors.length > 0) {
      this.removeAnchor(anchors.shift()!);
    }
  }

  removeAnchor(anchor: AAnchor): void {
    const existingAnchorIndex = this.getAnchorIndex(anchor.anchorId, anchor.getParent());
    if (existingAnchorIndex !== -1) {
      this.anchors.splice(existingAnchorIndex, 1);
    }
  }

  abstract override setContext(): string;

  abstract override synth(): I;

  static override async unSynth(...args: unknown[]): Promise<UnknownModel> {
    if (args.length > 4) {
      throw new Error('Too many args in unSynth()');
    }

    throw new Error('Method not implemented! Use derived class implementation');
  }
}
