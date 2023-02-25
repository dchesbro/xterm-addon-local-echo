import type { Terminal, ITerminalAddon, IDisposable } from 'xterm';
import ansiRegex from 'ansi-regex';

import { History } from './History';
import { getColRow, getLastFragment, getLineCount, getSharedFragment, 
  getTabSuggestions, getWord, hasIncompleteChars, hasTailingWhitespace 
} from './Utils';

interface ActivePrompt {
  ps1: string;
  ps2: string;
  resolve: any;
  reject: any;
}

export interface Options {
  historySize: number;
  incompleteEnabled: boolean;
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
  private incompleteEnabled: boolean;
  private input = '';
  private tabCompleteHandlers: TabCompleteHandler[] = [];
  private tabCompleteSize: number;
  private terminalSize: TerminalSize = { cols: 0, rows: 0 };

  public history: History;
  
  constructor(options?: Partial<Options>) {
    this.history = new History(options?.historySize ?? 10);
    this.incompleteEnabled = options?.incompleteEnabled ?? true;
    this.tabCompleteSize = options?.tabCompleteSize ?? 10;
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
   * Clear current input and move the cursor to beginning of prompt.
   */
  private clearInput() {
    const input = this.applyPrompt(this.input);
    const offset = this.applyPromptOffset(this.input, input.length);

    // Get current cursor position and lines count.
    const { row } = getColRow(input, offset, this.terminalSize.cols);
    const lines = getLineCount(input, this.terminalSize.cols)
    const linesDown = lines - (row + 1);

    // Move to last line of the current input.
    for (let i = 0; i < linesDown; i++) {
      this.terminal.write('\x1B[E');
    }

    // Clear the current line, then move up and clear remaining lines.
    this.terminal.write('\r\x1B[K');

    for (let i = 1; i < lines; i++) {
      this.terminal.write('\x1B[F\x1B[K');
    }
  }



  /**
   * Write defined input w/ current input or as replacement for current input.
   * 
   * @param input      Input string.
   * @param clearInput Clear current input before writing.
   */
  private async writeInput(input: string, clearInput = true) {
    
    // Clear current input?
    if (clearInput) {
      this.clearInput();
    }

    // Make sure cursor offset isn't outside of input length.
    if (this.cursor > input.length) {
      this.cursor = input.length;
    }

    const cursor = this.applyPromptOffset(input, this.cursor);
    const prompt = this.applyPrompt(input);

    // Write input w/prompt to terminal.
    this.print(prompt);

    const { col, row } = getColRow(prompt, cursor, this.terminalSize.cols);

    // Wrap to newline?
    if (row !== 0 && col === 0) {
      this.terminal.write('\x1B[E');
    }

    const lines = getLineCount(prompt, this.terminalSize.cols);
    const moveUp = lines - (row + 1);

    // Move cursor to beginning of current row.
    this.terminal.write('\r');

    for (let i = 0; i < moveUp; i++) {
      this.terminal.write('\x1B[F');
    }

    for (let i = 0; i < col; i++) {
      this.terminal.write('\x1B[C');
    }

    // Set input.
    this.input = input;
  }

  private async writeInput_(input: string, clearInput = true) {

    // Clear current input?
    if (clearInput) {
      this.clearInput();
    }

    // Make sure cursor offset isn't outside of input length.
    if (this.cursor > input.length) {
      this.cursor = input.length;
    }

    const cursor = this.applyPromptOffset(input, this.cursor);
    const prompt = this.applyPrompt(input);

    // Write input to terminal.
    this.print(prompt);

    const { col, row } = getColRow(prompt, cursor, this.terminalSize.cols);
    const trailingChars = prompt.substring(cursor).length;

    // If trailing characters found, check if they wrap...
    if (trailingChars) {
      const offset = cursor % this.terminalSize.cols;

      if ((offset + trailingChars) === this.terminalSize.cols) {
        this.terminal.write('\x1B[E');
      }

    // ...else, maybe wrap to newline.
    } else {
      if (row !== 0 && col === 0) {
        this.terminal.write('\x1B[E');
      }
    }

    const lines = getLineCount(prompt, this.terminalSize.cols);
    const moveUp = lines - (row + 1);

    // Move cursor to beginning of current row then right.
    this.terminal.write('\r');

    for (let i = 0; i < moveUp; i++) {
      this.terminal.write('\x1B[F');
    }

    for (let i = 0; i < col; i++) {
      this.terminal.write('\x1B[C');
    }

    // Set input.
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
   * Insert character(s) at current cursor offset.
   * 
   * @param input Input string.
   */
  private handleCursorInsert(input: string) {
    this.cursor += input.length;

    const insert = this.input.substring(0, this.cursor) + input + this.input.substring(this.cursor);

    this.writeInput(insert);
  }
  
  /**
   * Move cursor w/ respect to current cursor offset.
   * 
   * @param offset Cursor movement offset.
   */
  private handleCursorMove(offset: number) {

    // If positive offset, move cursor forward.
    if (offset > 0) {
      const move = Math.min(offset, (this.input.length - this.cursor));

      this.setCursor(this.cursor + move);

    // ...else, if negative offset, move cursor back.
    } else if (offset < 0) {
      const move = Math.max(offset, (this.cursor * -1));

      this.setCursor(this.cursor + move);
    }
  }

  /**
   * Erase a character at cursor location
   * 
   * @param bksp Backspace key press.
   */
  private handleCursorErase(bksp: boolean) {

    // If backspace key press, move cursor position back.
    if (bksp && this.cursor > 0) {
      this.cursor -= 1;
    }

    const erase = this.input.substring(0, this.cursor) + this.input.substring(this.cursor + 1);
    
    this.writeInput(erase);
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
   * 
   * 
   */
  private handleData(data: string) {

    // If no prompt(s) active, return.
    if (!this.active){
      return;
    }

    const char = data.charCodeAt(0);
    
    console.log(this.tabCompleteSize);

    // If ANSI escape sequence...
    if (char == 0x1b) {
      switch (data.substring(1)) {

        // Up arrow.
        case '[A':
          if (this.history) {
            const prev = this.history.getPrev();
            
            if (prev) {
              this.writeInput(prev);
              this.setCursor(prev.length);
            }
          }
          break;

        // Down arrow.
        case '[B':
          if (this.history) {
            const next = this.history.getNext() || '';

            this.writeInput(next);
            this.setCursor(next.length);
          }
          break;

        /* Left arrow.
        case '[D':
          this.handleCursorMove(-1);
          break; */

        /* Right arrow.
        case '[C':
          this.handleCursorMove(1);
          break; */

        // Delete.
        case '[3~':
          this.handleCursorErase(false);
          break;

        /* End.
        case '[F':
          this.setCursor(this.input.length);
          break; */

        /* Home.
        case '[H':
          this.setCursor(0);
          break; */

        /* Alt + left arrow.
        case 'b':
          const left = getWord(this.input, this.cursor, true);

          this.setCursor(left);
          break; */

        /* Alt + right arrow.
        case 'f':
          const right = getWord(this.input, this.cursor, false);

          this.setCursor(right);
          break; */

        // Alt + backspace.
        case '\x7F': {
          const b = getWord(this.input, this.cursor, true);
          const a = getWord(this.input, b, false);
          
          this.writeInput(this.input.substring(0, b) + this.input.substring(a));
          this.setCursor(b);
          break;
        }
      }

    // ...else, if special character...
    } else if (char < 32 || char === 0x7f) {
      switch (data) {

        // Enter.
        case '\r':
          if (this.incompleteEnabled) {

            // If current input has incomplete char(s), move to new line.
            if (hasIncompleteChars(this.input)) {
              this.handleCursorInsert('\n');
            }
          } else {
            this.handleReadComplete();
          }
          break;

        // Backspace.
        case '\x7F':
          this.handleCursorErase(true);
          break;

        // Tab.
        case '\t':          
          if (this.tabCompleteHandlers.length) {
            const fragment = this.input.substring(0, this.cursor);
            const suggestions = getTabSuggestions(
              this.tabCompleteHandlers,
              fragment
            );
            const trailingWhitespace = hasTailingWhitespace(fragment);

            suggestions.sort();

            // If no suggestions found...
            if (suggestions.length === 0) {

              // If no trailing whitespace already, insert space.
              if (!trailingWhitespace) {
                this.handleCursorInsert(' ');
              }

            // ...else, if only one suggestion found, print it...
            } else if (suggestions.length === 1) {
              const fragmentLast = getLastFragment(fragment);

              this.handleCursorInsert(
                suggestions[0].substring(fragmentLast.length) + ' '
              );

            // ...else, if number of suggestions less than max, print list...
            } else if (suggestions.length <= this.tabCompleteSize) {
              const fragmentShared = getSharedFragment(fragment, suggestions);

              // If shared fragment found, print it.
              if (fragmentShared) {
                const fragmentLast = getLastFragment(fragment);

                this.handleCursorInsert(
                  fragmentShared.substring(fragmentLast.length)
                );
              }

              this.printAndRestartPrompt(() => {
                this.printlsInline(suggestions);
              });

            // ...else, print suggestions prompt.
            } else {
              this.printAndRestartPrompt(() =>
                this.readChar(
                  `Do you wish to see all ${suggestions.length} possibilities? (y/n) `
                ).then((char) => {
                  if (char === 'y' || char === 'Y') {
                    this.printlsInline(suggestions);
                  }
                })
              );
            }
          } else {
            this.handleCursorInsert('    ');
          }
          break;

        // Ctrl + C.
        case '\x03':
          const prompt = {
            ...{ ps1: '', ps2: '' },
            ...this.activePrompt
          };

          this.setCursor(this.input.length);
          this.terminal.write('^C\r\n' + prompt.ps1);

          this.cursor = 0;
          this.input = '';

          if (this.history) this.history.rewind();
          break;
      }

    // ...else, printable character(s).
    } else {
      this.handleCursorInsert(data);
    }
  }
}
