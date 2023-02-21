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

    // Make sure cursor is within input length.
    this.cursor = Math.min(input.length, this.cursor);

    const cursor = this.applyPromptOffset(input, this.cursor);
    const prompt = this.applyPrompt(input);

    // console.log(this.cursor, cursor, prompt.length);
    
    // ...
    this.print(prompt);

    const { col, row } = getColRow(prompt, cursor, this.terminalSize.cols);
    const trailingChars = prompt.substring(cursor).length;

    // If trailing characters found, check if they wrap...
    if (trailingChars) {
      const offset = cursor % this.terminalSize.cols;

      if ((offset + trailingChars) === this.terminalSize.cols) {
        this.terminal.write('\x1B[E');
      }

    // ...else, check for cursor wrap.
    } else {
      if (col === 0) {
        this.terminal.write('\x1B[E');
      }
    }

    // Move cursor to beginning of current row then right.
    this.terminal.write('\r');

    for (let i = 0; i < col; i++) {
      this.terminal.write('\x1B[C');
    }

    /* const lines = getLineCount(prompt, this.terminalSize.cols);
    const linesMove = lines - (rowC + 1);

    // ...
    for (let i = 0; i < linesMove; i++) {
      this.terminal.write('\x1B[F');
    } */

    // ...
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
    const insert = this.input.substring(0, this.cursor) + input + this.input.substring(this.cursor);

    // Add input length to cursor offset.
    this.cursor += input.length;

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



  private handleData_(data: any) {
    const char = data.charCodeAt(0);

    console.log(data, char);

    // ANSI escape sequences...
    if (char === 0x1B) {
      switch (data.substring(1)) {

        // Left arrow.
        case '[D': {
          if (this.cursor > 0) {
            this.cursor -= 1;

            this.terminal.write('\x1B[D');
          }
          break;
        }

        // Right arrow.
        case '[C': {
          if (this.cursor < this.input.length) {
            this.cursor += 1;

            this.terminal.write('\x1B[C');
          }
          break;
        }
      }

    // Special characters...
    } else if (char < 32 || char === 127) {
      

    // Default...
    } else {
      let a = '';
      let b = this.input.substring(0, this.cursor);
      let o = data;

      // ...
      if (this.cursor < this.input.length) {
        a = this.input.substring(this.cursor);
        o += a;
      }

      this.cursor += data.length;
      this.input = b + o;

      console.log(a, b, o);

      if (this.input.length === (this.terminalSize.cols - 1)) {
        this.terminal.write('\r\n');
      }

      this.terminal.write(o);

      for (let i = 0; i < a.length; i++) {
        this.terminal.write('\x1B[D');
      }

      console.log(this.cursor, this.input);
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
          if (hasIncompleteChars(this.input)) {
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
