import type { Terminal, ITerminalAddon, IDisposable } from 'xterm';
import ansiRegex from 'ansi-regex';

import { History } from './History';
import { getColRow, getLastFrargment, getLineCount, getTabMatch, 
  getTabSuggestions, getWord, hasIncompleteChars, hasTrailingWhitespace 
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

    const widest = items.reduce((width, e) => Math.max(width, e.length), 0);

    let output = '';

    for (let i = 0; i < items.length; i++) {
      let itemWide = items[i].padEnd(widest + padding, ' ');

      if ((output.length + itemWide.length) > this.terminalSize.cols) {
        this.println(output);

        output = '';
      }

      output += itemWide;
    }

    this.println(output);
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
   * Complete current input, call defined callback, and display prompt.
   * 
   * @param callback Handler function.
   */
  private applyPromptComplete(callback: Function) {
    const cursor = this.cursor;

    this.setCursor(this.input.length);
    this.terminal.write('\r\n');

    const resume = () => {
      this.cursor = cursor;

      this.setInput(this.input);
    };

    const promise = callback();

    // If callback doesn't return a promise, resume...
    if (promise == null) {
      resume();

    // ...else, wait for promise to resolve and then resume.
    } else {
      promise.then(resume);
    }
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
    const moveDown = lines - (row + 1);

    // Move to last line of the current input.
    for (let i = 0; i < moveDown; i++) {
      this.terminal.write('\x1B[E');
    }

    // Clear the current line, then move up and clear remaining lines.
    this.terminal.write('\r\x1B[K');

    for (let i = 1; i < lines; i++) {
      this.terminal.write('\x1B[F\x1B[K');
    }
  }

  /**
   * Insert character(s) at current cursor offset.
   * 
   * @param input Input string.
   */
  private handleCursorInsert(input: string) {
    this.cursor += input.length;

    this.setInput(this.input.substring(0, this.cursor) + input + this.input.substring(this.cursor));
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
    
    this.setInput(this.input.substring(0, this.cursor) + this.input.substring(this.cursor + 1));
  }

  /**
   * Handle input data from terminal based on key press.
   * 
   * @param data Key press data from terminal.
   */
  private handleData(data: string) {

    // If no prompt(s) active, return.
    if (!this.active){
      return;
    }

    const char = data.charCodeAt(0);
    
    // If ANSI escape sequence...
    if (char == 0x1b) {
      switch (data.substring(1)) {

        // Up arrow.
        case '[A':
          if (this.history) {
            const prev = this.history.getPrev();
            
            if (prev) {
              this.setInput(prev);
              this.setCursor(prev.length);
            }
          }
          break;

        // Down arrow.
        case '[B':
          if (this.history) {
            const next = this.history.getNext() || '';

            this.setInput(next);
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
          
          this.setInput(this.input.substring(0, b) + this.input.substring(a));
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

          // If any tab complete handlers found, check for suggestions...
          if (this.tabCompleteHandlers.length) {
            const input = this.input.substring(0, this.cursor);
            const suggestions = getTabSuggestions(
              this.tabCompleteHandlers,
              input
            );

            suggestions.sort();

            // If no suggestions found, check for trailing whitespace...
            if (suggestions.length === 0) {
              const trailingWhitespace = hasTrailingWhitespace(input);

              // If no trailing whitespace found, insert tab.
              if (!trailingWhitespace) {
                this.handleCursorInsert('\t');
              }

            // ...else, if only one suggestion found append to input...
            } else if (suggestions.length === 1) {
              const frargment = getLastFrargment(input);

              this.handleCursorInsert(
                suggestions[0].substring(frargment.length) + ' '
              );

            // ...else, if number of suggestions less than maximum print list...
            } else if (suggestions.length <= this.tabCompleteSize) {
              this.applyPromptComplete(() => {
                this.printlsInline(suggestions);
              });

            // ...else, print display all suggestions prompt.
            } else {
              this.applyPromptComplete(() =>
                this.readChar(
                  `Do you wish to see all ${suggestions.length} possibilities? (y/n) `
                ).then((char) => {
                  if (char === 'y' || char === 'Y') {
                    this.printlsInline(suggestions);
                  }
                })
              );
            }

          // ...else, insert tab.
          } else {
            this.handleCursorInsert('\t');
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

  /**
   * Handle completed read prompts.
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
   * Handle terminal input.
   * 
   * @param input Input string.
   */
  private handleTermData(input: string) {
    if (!this.active) {
      return;
    }

    // If active character prompt found, resolve it.
    if (this.activePromptChar !== null) {
      this.activePromptChar.resolve(input);

      this.activePromptChar = null;

      return this.terminal.write("\r\n");
    }

    // If pasted input, normalize and process each character...
    if (input.length > 3 && input.charCodeAt(0) !== 0x1b) {
      const pasted = input.replace(/[\r\n]+/g, "\r");

      Array.from(pasted).forEach((char) => this.handleData(char));

    // ...else, process input data.
    } else {
      this.handleData(input);
    }
  }

  /**
   * Clear the current prompt, update terminal size, and re-render prompt.
   * 
   * @param size Terminal size object.
   */
  private handleTermResize(size: TerminalSize) {
    this.clearInput();

    this.terminalSize = size;

    this.setInput(this.input, false);
  }

  /**
   * Set new cursor position as an offset of the current input string.
   * 
   * @param offset Input cursor offset.
   */
  private setCursor(offset: number) {

    // Make sure cursor offset isn't outside input length.
    if (offset < 0) {
      offset = 0;
    }

    if (offset > this.input.length) {
      offset = this.input.length;
    }

    const prompt = this.applyPrompt(this.input);
    
    // Get previous cursor position.
    const cursorPrev = this.applyPromptOffset(this.input, this.cursor);
    const { col: colPrev, row: rowPrev } = getColRow(
      prompt,
      cursorPrev,
      this.terminalSize.cols
    );

    // Get new cursor position.
    const cursorNew = this.applyPromptOffset(this.input, offset);
    const { col: colNew, row: rowNew } = getColRow(
      prompt,
      cursorNew,
      this.terminalSize.cols
    );

    // If new number of rows greater than previous number, move down...
    if (rowNew > rowPrev) {
      for (let i = rowPrev; i < rowNew; ++i) {
        this.terminal.write("\x1B[B");
      }
    
    // ...else, move up.
    } else {
      for (let i = rowNew; i < rowPrev; ++i) {
        this.terminal.write("\x1B[A");
      }
    }

    // If new number of columns greater than previous number, move right...
    if (colNew > colPrev) {
      for (let i = colPrev; i < colNew; ++i) {
        this.terminal.write("\x1B[C");
      }

    // ...else, move left.
    } else {
      for (let i = colNew; i < colPrev; ++i) {
        this.terminal.write("\x1B[D");
      }
    }

    // Set offset.
    this.cursor = offset;
  }

  /**
   * Set defined input w/ previous input or replace previous input.
   * 
   * @param input      Input string.
   * @param clearInput Clear current input before writing.
   */
  private async setInput(input: string, clearInput = true) {

    // Clear current input?
    if (clearInput) {
      this.clearInput();
    }

    // Make sure cursor offset isn't outside input length.
    if (this.cursor > input.length) {
      this.cursor = input.length;
    }

    const cursor = this.applyPromptOffset(input, this.cursor);
    const prompt = this.applyPrompt(input);

    // Print input to terminal.
    this.print(prompt);

    const { col, row } = getColRow(prompt, cursor, this.terminalSize.cols);
    const trailingChars = prompt.replace(ansiRegex(), '').substring(cursor).length;

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
}
