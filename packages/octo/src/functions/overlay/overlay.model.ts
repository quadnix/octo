import { Anchor } from './anchor.model.js';

export class Overlay {
  private readonly participants: Anchor[];

  constructor(participants: Anchor[]) {
    this.participants = [...participants];
  }
}
