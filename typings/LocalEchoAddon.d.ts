import type { Terminal, ITerminalAddon } from 'xterm';
import { History } from './History';
export interface Options {
    historySize: number;
    incompleteEnabled: boolean;
    tabCompleteSize: number;
}
export declare class LocalEchoAddon implements ITerminalAddon {
    private terminal;
    private disposables;
    private active;
    private activePrompt;
    private activePromptChar;
    private cursor;
    private incompleteEnabled;
    private input;
    private tabCompleteHandlers;
    private tabCompleteSize;
    private terminalSize;
    history: History;
    constructor(options?: Partial<Options>);
    private attach;
    private detach;
    activate(terminal: Terminal): void;
    dispose(): void;
    /**
     * Return promise that resolves when a complete input is sent.
     *
     * @param ps1 Default input prompt string.
     * @param ps2 Continuation input prompt string.
     */
    read(ps1?: string, ps2?: string): Promise<unknown>;
    /**
     * Return a promise that resolves when a user inputs a single character -- can
     * be active in addition to `read()` and will resolve before it.
     *
     * @param ps1 Default input prompt string.
     */
    readChar(ps1: string): Promise<unknown>;
    /**
     * Abort read operation(s), if any are pending.
     *
     * @param reason Abort reason string.
     */
    readAbort(reason?: string): void;
    /**
     * Print string and format newline characters.
     *
     * @param output String to print.
     */
    print(output: string): void;
    /**
     * Print string w/ newline.
     *
     * @param output String to print.
     */
    println(output: string): void;
    /**
     * Print inline list w/ padding.
     *
     * @param items   Array of list items.
     * @param padding Horizontal padding between list items.
     */
    printlsInline(items: string[], padding?: number): void;
    /**
     * Print numbered list w/ padding.
     *
     * @param items   Array of list items.
     * @param padding Horizontal padding between columns.
     */
    printlsNumber(items: string[], padding?: number): void;
    /**
     * Add a tab complete handler function.
     *
     * @param callback Handler function.
     * @param args     Additional arguments.
     */
    addTabCompleteHandler(callback: Function, ...args: any[]): void;
    /**
     * Remove a previously added tab complete handler function.
     *
     * @param callback Handler function.
     */
    removeTabCompleteHandler(callback: Function): void;
    /**
     * Apply prompt string(s) to the defined input.
     *
     * @param input Input string.
     */
    private applyPrompt;
    /**
     * Complete current input, call defined callback, and display prompt.
     *
     * @param callback Handler function.
     */
    private applyPromptComplete;
    /**
     * Returns adjusted offset w/ respect to defined input and prompt strings.
     *
     * @param input  Input string.
     * @param offset Input cursor offset.
     */
    private applyPromptOffset;
    /**
     * Clear current input and move the cursor to beginning of prompt.
     */
    private clearInput;
    /**
     * Insert character(s) at current cursor offset.
     *
     * @param input Input string.
     */
    private handleCursorInsert;
    /**
     * Move cursor w/ respect to current cursor offset.
     *
     * @param offset Cursor movement offset.
     */
    private handleCursorMove;
    /**
     * Erase a character at cursor location
     *
     * @param bksp Backspace key press.
     */
    private handleCursorErase;
    /**
     * Handle input data from terminal based on key press.
     *
     * @param data Key press data from terminal.
     */
    private handleData;
    /**
     * Handle completed read prompts.
     */
    private handleReadComplete;
    /**
     * Handle terminal input.
     *
     * @param input Input string.
     */
    private handleTermData;
    /**
     * Clear the current prompt, update terminal size, and re-render prompt.
     *
     * @param size Terminal size object.
     */
    private handleTermResize;
    /**
     * Set new cursor position as an offset of the current input string.
     *
     * @param offset Input cursor offset.
     */
    private setCursor;
    /**
     * Set defined input w/ previous input or replace previous input.
     *
     * @param input      Input string.
     * @param clearInput Clear current input before writing.
     */
    private setInput;
}
