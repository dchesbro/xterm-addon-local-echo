import type { Terminal, ITerminalAddon, IDisposable } from 'xterm';
import ansiRegex from 'ansi-regex';

import { History } from './History';
import { getColRow, getLastFragment, getLineCount, getSharedFragment, 
  getTabSuggestions, getWord, hasIncompleteChar, hasTailingWhitespace 
} from './Utils';

interface ActivePrompt {
  ps1: string;
  ps2: string;
  resolve: any;
  reject: any;
}

export interface Options {
  enableIncomplete: boolean;
  historySize: number;
  tabCompleteSize: number;
}

interface TabCompleteHandler {
  callback: Function;
  args: any[];
}

interface TerminalSize {
  cols: number;
  rows: number;
}

export class LocalEchoAddon implements ITerminalAddon {
  private terminal!: Terminal;
  private disposables: IDisposable[] = [];

  private active = false;
  private activePrompt: ActivePrompt | null = null;
  private activePromptChar: ActivePrompt | null = null;
  private cursor = 0;
  private enableIncomplete: boolean;
  private input = '';
  private tabCompleteHandlers: TabCompleteHandler[] = [];
  private tabCompleteSize: number;
  private terminalSize: TerminalSize = { cols: 0, rows: 0 };

  public history: History;
  
  constructor(
    options: Options = {
      enableIncomplete: false,
      historySize: 10,
      tabCompleteSize: 100,
    }
  ) {
    this.enableIncomplete = options.enableIncomplete;
    this.history = new History(options.historySize);
    this.tabCompleteSize = options.tabCompleteSize;
  }

  private attach() {
    if (!this.terminal) {
      return;
    }
    
    this.disposables.push(this.terminal.onData((data) => {
      return this.handleTermData(data);
    }));

    this.disposables.push(this.terminal.onResize((size) => {
      return this.handleTermResize(size);
    }));

    this.terminalSize = {
      cols: this.terminal.cols,
      rows: this.terminal.rows,
    };
  }

  private detach() {
    this.disposables.forEach((e) => e.dispose());
    this.disposables = [];
  }

  public activate(terminal: Terminal): void {
    this.terminal = terminal;
    this.attach();
  }

  public dispose(): void {
    this.detach();
  }

  /*--------------------------------------------------------------------------*/
  // Public API
  /*--------------------------------------------------------------------------*/

  /**
   * Return promise that resolves when a complete input is sent.
   * 
   * @param ps1 Default input prompt string.
   * @param ps2 Continuation input prompt string.
   */
  public async read(ps1 = '$ ', ps2 = '> ') {
    return new Promise((resolve, reject) => {
      this.terminal.write(ps1);

      this.active = true;
      this.activePrompt = {
        ps1,
        ps2,
        resolve,
        reject,
      };
      this.cursor = 0;
      this.input = '';
    });
  }

  /**
   * Return a promise that resolves when a user inputs a single character -- can 
   * be active in addition to `read()` and will resolve before it.
   * 
   * @param ps1 Default input prompt string.
   */
  public async readChar(ps1: string) {
    return new Promise((resolve, reject) => {
      this.terminal.write(ps1);

      this.activePromptChar = {
        ps1,
        ps2: '',
        resolve,
        reject,
      };
    });
  }

  /**
   * Abort read operation(s), if any are pending.
   * 
   * @param reason Abort reason string.
   */
  public readAbort(reason = 'READINT') {
    if (this.activePrompt !== null || this.activePromptChar !== null) {
      this.terminal.write('\r\n');
    }

    if (this.activePrompt !== null) {
      this.activePrompt.reject(reason);
      this.activePrompt = null;
    }

    if (this.activePromptChar !== null) {
      this.activePromptChar.reject(reason);
      this.activePromptChar = null;
    }

    this.active = false;
  }

  /**
   * Print string and format newline characters.
   * 
   * @param output String to print.
   */
  public print(output: string) {
    const print = output.replace(/[\r\n]+/g, '\n');
    
    this.terminal.write(print.replace(/\n/g, '\r\n'));
  }

  /**
   * Print string w/ newline.
   * 
   * @param output String to print.
   */
  public println(output: string) {
    this.print(output + '\n');
  }

  /**
   * Print inline list w/ padding.
   * 
   * @param items   Array of list items.
   * @param padding Horizontal padding between list items.
   */
  public printlsInline(items: string[], padding = 3) {
    if (items.length === 0) {
      return;
    }

    const width = items.reduce((width, e) => Math.max(width, e.length), 0);
    const widthTerm = this.terminal.cols;
    const cols = Math.floor(widthTerm / width) || 1;
    const rows = Math.floor(items.length / width) || 1;

    let i = 0;

    for (let row = 0; row < rows; row++) {
      let output = '';

      for (let col = 0; col < cols; col++) {
        if (i < items.length) {
          output += items[i++].padEnd(width + padding, ' ');
        }
      }

      this.println(output);
    }
  }

  /**
   * Print numbered list w/ padding.
   * 
   * @param items   Array of list items.
   * @param padding Horizontal padding between columns.
   */
  public printlsNumber(items: string[], padding = 3) {
    if (items.length === 0) {
      return;
    }

    const cols = items.length.toString().length;

    for (let i = 0; i < items.length; i++ ) {
      this.println(`${i + 1}`.padEnd(padding, ' ').padStart(cols, ' ') + items[i]);
    }
  }

  /**
   * Add a tab complete handler function.
   * 
   * @param callback Handler function.
   * @param args     Additional arguments.
   */
  public addTabCompleteHandler(callback: Function, ...args: any[]) {
    this.tabCompleteHandlers.push({ callback, args });
  }

  /**
   * Remove a previously added tab complete handler function.
   * 
   * @param callback Handler function.
   */
  public removeTabCompleteHandler(callback: Function) {
    const index = this.tabCompleteHandlers.findIndex((e) => {
      return e.callback === callback;
    });

    if (index !== -1) {
      this.tabCompleteHandlers.splice(index, 1);
    }
  }

  /*--------------------------------------------------------------------------*/
  // Private(~ish) API
  /*--------------------------------------------------------------------------*/

  /**
   * Apply prompt string(s) to the defined input.
   * 
   * @param input Input string.
   */
  private applyPrompt(input: string) {
    const prompt = {
      ...{ ps1: '', ps2: '' },
      ...this.activePrompt
    };

    return prompt.ps1 + input.replace(/\n/g, '\n' + prompt.ps2);
  }

  /**
   * Returns adjusted offset w/ respect to defined input and prompt strings.
   * 
   * @param input  Input string.
   * @param offset Input cursor offset.
   */
  private applyPromptOffset(input: string, offset: number) {
    const prompt = this.applyPrompt(input.substring(0, offset));

    return prompt.replace(ansiRegex(), '').length;
  }



  /**
   * Clear current input and move the cursor to the beginning of the prompt.
   */
  private clearInput() {
    const input = this.applyPrompt(this.input);
    const offset = this.applyPromptOffset(this.input, this.cursor);

    // Get current cursor position and lines count.
    const { row } = getColRow(input, offset, this.terminalSize.cols);
    const lines = getLineCount(input, this.terminalSize.cols)
    const linesMove = lines - (row + 1);

    // If negative value, move up.
    for (let i = linesMove; i < 0; i++) {
      this.terminal.write('\x1B[2K\x1B[F');
    }

    // If positive value, move down.
    for (let i = 0; i < linesMove; i++) {
      this.terminal.write('\x1B[E');
    }

    // First clear the current line, then clear all remaining lines.
    this.terminal.write('\r\x1B[K');

    for (let i = 1; i < lines; i++) {
      this.terminal.write('\x1B[F\x1B[K');
    }
  }

  /**
   * Replace input with the new input given
   *
   * This function clears all the lines that the current input occupies and
   * then replaces them with the new input.
   */
  private writeInput(input: string, clearInput = true) {

    // Clear current input?
    if (clearInput) {
      this.clearInput();
    }

    // Set cursor to input length if less than current position.
    this.cursor = Math.min(input.length, this.cursor);

    const cursorOffset = this.applyPromptOffset(input, this.cursor);
    const prompt = this.applyPrompt(input);
    
    // ...
    this.print(prompt);

    const { col: cursorCol, row: cursorRow } = getColRow(
      prompt,
      cursorOffset,
      this.terminalSize.cols
    );
    const { col: promptCol, row: promptRow } = getColRow(
      prompt,
      prompt.length,
      this.terminalSize.cols
    );
    const col = Math.max(cursorCol, promptCol);
    const row = Math.max(cursorRow, promptRow);

    const lines = getLineCount(prompt, this.terminalSize.cols);

    // ...
    const linesMove = lines - (row + 1);

    // xterm keep the cursor on last column when it is at the end of the line.
    // Move it to next line.
    if (col === 0) this.terminal.write('\x1B[E');

    this.terminal.write('\r');

    for (let i = 0; i < linesMove; ++i) this.terminal.write("\x1B[F");
    for (let i = 0; i < col; ++i) this.terminal.write('\x1B[C');

    // Replace input
    this.input = input;
  }

  /**
   * This function completes the current input, calls the given callback
   * and then re-displays the prompt.
   */
  private printAndRestartPrompt(callback: any) {
    const cursor = this.cursor;

    // Complete input
    this.setCursor(this.input.length);
    this.terminal.write("\r\n");

    // Prepare a function that will resume prompt
    const resume = () => {
      this.cursor = cursor;
      this.writeInput(this.input);
    };

    // Call the given callback to echo something, and if there is a promise
    // returned, wait for the resolution before resuming prompt.
    const ret = callback();
    if (ret == null) {
      resume();
    } else {
      ret.then(resume);
    }
  }

  /**
   * Set the new cursor position, as an offset on the input string
   *
   * This function:
   * - Calculates the previous and current
   */
  private setCursor(newCursor: number) {
    if (newCursor < 0) newCursor = 0;
    if (newCursor > this.input.length) newCursor = this.input.length;

    // Apply prompt formatting to get the visual status of the display
    const inputWithPrompt = this.applyPrompt(this.input);

    // Estimate previous cursor position
    const prevPromptOffset = this.applyPromptOffset(this.input, this.cursor);
    const { col: prevCol, row: prevRow } = getColRow(
      inputWithPrompt,
      prevPromptOffset,
      this.terminalSize.cols
    );

    // Estimate next cursor position
    const newPromptOffset = this.applyPromptOffset(this.input, newCursor);
    const { col: newCol, row: newRow } = getColRow(
      inputWithPrompt,
      newPromptOffset,
      this.terminalSize.cols
    );

    // Adjust vertically
    if (newRow > prevRow) {
      for (let i = prevRow; i < newRow; ++i) this.terminal.write("\x1B[B");
    } else {
      for (let i = newRow; i < prevRow; ++i) this.terminal.write("\x1B[A");
    }

    // Adjust horizontally
    if (newCol > prevCol) {
      for (let i = prevCol; i < newCol; ++i) this.terminal.write("\x1B[C");
    } else {
      for (let i = newCol; i < prevCol; ++i) this.terminal.write("\x1B[D");
    }

    // Set new offset
    this.cursor = newCursor;
  }

  /**
   * Move cursor at given direction
   */
  private handleCursorMove(dir: number) {
    if (dir > 0) {
      const num = Math.min(dir, this.input.length - this.cursor);
      this.setCursor(this.cursor + num);
    } else if (dir < 0) {
      const num = Math.max(dir, -this.cursor);
      this.setCursor(this.cursor + num);
    }
  }

  /**
   * Erase a character at cursor location
   */
  private handleCursorErase(backspace: boolean) {
    if (backspace) {
      if (this.cursor <= 0) return;
      const newInput =
        this.input.substring(0, this.cursor - 1) + this.input.substring(this.cursor);
      this.clearInput();
      this.cursor -= 1;
      this.writeInput(newInput, false);
    } else {
      const newInput =
        this.input.substring(0, this.cursor) + this.input.substring(this.cursor + 1);
      this.writeInput(newInput);
    }
  }

  /**
   * Insert character at cursor location
   */
  private handleCursorInsert(data: string) {
    const newInput =
      this.input.substring(0, this.cursor) + data + this.input.substring(this.cursor);
    this.cursor += data.length;
    this.writeInput(newInput);
  }

  /**
   * Handle input completion
   */
  private handleReadComplete() {
    if (this.history) {
      this.history.push(this.input);
    }
    if (this.activePrompt) {
      this.activePrompt.resolve(this.input);
      this.activePrompt = null;
    }
    this.terminal.write("\r\n");
    this.active = false;
  }

  /**
   * Handle terminal resize
   *
   * This function clears the prompt using the previous configuration,
   * updates the cached terminal size information and then re-renders the
   * input. This leads (most of the times) into a better formatted input.
   */
  private handleTermResize(size: TerminalSize) {
    const { cols, rows } = size;
    
    this.clearInput();
    this.terminalSize = { cols, rows };
    this.writeInput(this.input, false);
  }

  /**
   * Handle terminal input
   */
  private handleTermData(data: string) {
    if (!this.active) return;

    // If we have an active character prompt, satisfy it in priority
    if (this.activePromptChar != null) {
      this.activePromptChar.resolve(data);
      this.activePromptChar = null;
      this.terminal.write("\r\n");
      return;
    }

    // If this looks like a pasted input, expand it
    if (data.length > 3 && data.charCodeAt(0) !== 0x1b) {
      const normData = data.replace(/[\r\n]+/g, "\r");
      Array.from(normData).forEach((c) => this.handleData(c));
    } else {
      this.handleData(data);
    }
  }

  /**
   * Handle a single piece of information from the terminal.
   */
  private handleData(data: string) {
    if (!this.active) return;
    const ord = data.charCodeAt(0);
    let ofs;

    // Handle ANSI escape sequences
    if (ord == 0x1b) {
      switch (data.substring(1)) {
        case "[A": // Up arrow
          if (this.history) {
            const value = this.history.getPrev();
            if (value) {
              this.writeInput(value);
              this.setCursor(value.length);
            }
          }
          break;

        case "[B": // Down arrow
          if (this.history) {
            let value = this.history.getNext();
            if (!value) value = "";
            this.writeInput(value);
            this.setCursor(value.length);
          }
          break;

        case "[D": // Left Arrow
          this.handleCursorMove(-1);
          break;

        case "[C": // Right Arrow
          this.handleCursorMove(1);
          break;

        case "[3~": // Delete
          this.handleCursorErase(false);
          break;

        case "[F": // End
          this.setCursor(this.input.length);
          break;

        case "[H": // Home
          this.setCursor(0);
          break;

        // Alt + Left
        case 'b': {
          let offset = getWord(this.input, this.cursor, true);

          this.setCursor(offset);
          break;
        }

        // Alt + Right
        case 'f': {
          let offset = getWord(this.input, this.cursor, false);

          this.setCursor(offset);
          break;
        }

        // Alt + Backspace
        case '\x7F': {
          let before = getWord(this.input, this.cursor, true);
          let after = getWord(this.input, before, false);
          
          this.writeInput(
            this.input.substring(0, before) + this.input.substring(after)
          );
          this.setCursor(before);
          break;
        }
      }

      // Handle special characters
    } else if (ord < 32 || ord === 0x7f) {
      switch (data) {
        case "\r": // ENTER
          if (hasIncompleteChar(this.input)) {
            this.handleCursorInsert("\n");
          } else {
            this.handleReadComplete();
          }
          break;

        case "\x7F": // BACKSPACE
          this.handleCursorErase(true);
          break;

        case "\t": // TAB
          if (this.tabCompleteHandlers.length > 0) {
            const inputFragment = this.input.substring(0, this.cursor);
            const hasTailingSpace = hasTailingWhitespace(inputFragment);
            const candidates = getTabSuggestions(
              this.tabCompleteHandlers,
              inputFragment
            );

            // Sort candidates
            candidates.sort();

            // Depending on the number of candidates, we are handing them in
            // a different way.
            if (candidates.length === 0) {
              // No candidates? Just add a space if there is none already
              if (!hasTailingSpace) {
                this.handleCursorInsert(" ");
              }
            } else if (candidates.length === 1) {
              // Just a single candidate? Complete
              const lastToken = getLastFragment(inputFragment);
              this.handleCursorInsert(
                candidates[0].substring(lastToken.length) + " "
              );
            } else if (candidates.length <= this.tabCompleteSize) {
              // search for a shared fragement
              const sameFragment = getSharedFragment(inputFragment, candidates);

              // if there's a shared fragement between the candidates
              // print complete the shared fragment
              if (sameFragment) {
                const lastToken = getLastFragment(inputFragment);
                this.handleCursorInsert(sameFragment.substring(lastToken.length));
              }

              // If we are less than maximum auto-complete candidates, print
              // them to the user and re-start prompt
              this.printAndRestartPrompt(() => {
                this.printlsInline(candidates);
              });
            } else {
              // If we have more than maximum auto-complete candidates, print
              // them only if the user acknowledges a warning
              this.printAndRestartPrompt(() =>
                this.readChar(
                  `Do you wish to see all ${candidates.length} possibilities? (y/n) `
                ).then((yn) => {
                  if (yn == "y" || yn == "Y") {
                    this.printlsInline(candidates);
                  }
                })
              );
            }
          } else {
            this.handleCursorInsert("    ");
          }
          break;

        case "\x03": // CTRL+C
          this.setCursor(this.input.length);
          this.terminal.write(
            "^C\r\n" + ((this.activePrompt || {}).ps1 || "")
          );
          this.input = "";
          this.cursor = 0;
          if (this.history) this.history.rewind();
          break;
      }

      // Handle visible characters
    } else {
      this.handleCursorInsert(data);
    }
  }
}
