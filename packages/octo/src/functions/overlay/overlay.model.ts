import { AAnchor } from './anchor.abstract.js';

export class Overlay {
  private readonly participants: AAnchor[];

  constructor(participants: AAnchor[]) {
    this.participants = [...participants];
  }
}
