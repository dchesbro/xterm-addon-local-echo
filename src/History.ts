export class History {
  private index = 0;
  private itemsMax: number;

  public items: string[] = [];

  constructor(size: number) {
    this.itemsMax = size;
  }

  /**
   * Get previous history item.
   */
  getPrev(): string {
    this.index = Math.max(0, this.index - 1);

    return this.items[this.index];
  }

  /**
   * Get next history item.
   */
  getNext(): string {
    this.index = Math.min(this.items.length, this.index + 1);

    return this.items[this.index];
  }

  /**
   * Add item to history.
   *
   * @param input Input string.
   */
  push(input: string): void {
    if (input.trim() === '') {
      return;
    }

    const prevItem = this.items[this.items.length - 1];

    if (input !== prevItem) {
      this.items.push(input);

      if (this.items.length > this.itemsMax) {
        this.items.shift();
      }
    }

    this.rewind();
  }

  /**
   * Set index to last item.
   */
  rewind(): void {
    this.index = this.items.length;
  }
}
