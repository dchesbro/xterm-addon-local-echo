/**
 * The history controller provides an ring-buffer
 */
export declare class History {
    private index;
    private sizeMax;
    items: string[];
    constructor(size: number);
    /**
     * Get previous history item.
     */
    getPrev(): string;
    /**
     * Get next history item.
     */
    getNext(): string;
    /**
     * Add item to history.
     *
     * @param input Input string.
     */
    push(input: string): void;
    /**
     * Set index to last item.
     */
    rewind(): void;
}
