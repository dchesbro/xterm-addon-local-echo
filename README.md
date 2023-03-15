# 📣 xterm-addon-local-echo 

This repository is forked from the TypeScript port of [wavesoft/local-echo](https://github.com/wavesoft/local-echo) by  [kobakazu0429](https://github.com/kobakazu0429/local-echo).

> A fully(~ish) functional local echo controller for `xterm.js`.

You'd be surprised how difficult it is to implement a fully(~ish) functional local echo controller for [`xterm.js`](https://github.com/xtermjs/xterm.js), or any other terminal emulator for that matter. This project takes much of that burden off your hands!

### Features

This local echo controller tries to replicate many bash-like features, including:

- ~~**Arrow navigation:** Use `left` and `right` arrow keys to navigate in your input.~~
- ~~**Word boundary navigation:** Use `alt+left` and `alt+right` to navigate between words.~~
- ~~**Line navigation:** Use `alt+e` and `alt+h` to navigation to the beginning or end of the current line.~~
- **Word boundary deletion:** Use `alt+backspace` to delete a words.
- **Multi-line continuation:** Break commands into multiple lines if they contain incomplete quotation marks, boolean operators (`&&` or `||`), pipe operators (`|`), or new-line escape sequence (`\`).
- **Full navigation for multi-line commands:** Navigate within and edit all lines of the multi-line commands.
- **History:** Access previous commands using the `up` and `down` arrow keys.
- **Paste commands:** Paste commands or other text using `cmd+v`.
- **Tab completion:** Auto-complete commands using the `tab` key with support for adding user defined tab completion callback functions.

## Demo

To-do.

[https://dchesbro.github.io/xterm-addon-local-echo/](https://dchesbro.github.io/xterm-addon-local-echo/)

## Usage

### As an ES6 Module

1. Install it using your preferred package manager:

    `npm`

    ```sh
    npm install @dchesbro/xterm-addon-local-echo
    ```

    `yarn`

    ```sh
    yarn add @dchesbro/xterm-addon-local-echo
    ```

2. Import and initialize like so:

    ```js
    import { LocalEchoAddon } from "@dchesbro/xterm-addon-local-echo";
    import { Terminal } from "xterm";

    // Create addon and terminal.
    const localEcho = new LocalEchoAddon();
    const term = new Terminal();

    // Add user defined tab complete callback functions.
    localEcho.addAutocompleteHandler((index) => {
      if (index !== 0) return [];

      return ["bash", "cp", "chown", "chmod", "ls", "ps"];
    });

    localEcho.addAutocompleteHandler((index) => {
      if (index === 0) return [];
      
      return [".git", ".gitignore", "some-file", "some-other-file", ];
    });

    // Load addon and initialize terminal.
    term.loadAddon(localEcho);
    term.open(document.getElementById("terminal"));

    // Simple looping read function.
    const readInput = async () => {
      localEcho.read('~$ ')
        .then((input) => localEcho.println("Local echo: " + input))
        .then(readInput);
    };

    readInput();
    ```

## API Reference

### `constructor(term, [options])`

The constructor accepts an `xterm.js` instance as the first argument and an object with possible options. The options can be:

```js
{
    // The maximum number of entries to keep in history
    historySize: 10,
    // The maximum number of auto-complete entries, after which the user
    // will have to confirm before the entries are displayed.
    maxAutocompleteEntries: 100
}
```

### `.read(prompt, [continuationPrompt])` -> Promise

Reads a single line from the user, using local-echo. Returns a promise that will be resolved with the user input when completed.

```js
localEcho.read("~$", "> ")
        .then(input => alert(`User entered: ${input}`))
        .catch(error => alert(`Error reading: ${error}`));
```

### `.readChar(prompt)` -> Promise

Reads a single character from the user, without echoing anything. Returns a promise that will be resolved with the user input when completed.

This input can be active in parallel with a `.read` prompt. A character typed will be handled in priority by this function.

This is particularly helpful if you want to prompt the user for something amidst an input operation. For example, prompting to confirm an expansion of a large number of auto-complete candidates during tab completion.

```js
localEcho.readChar("Display all 1000 possibilities? (y or n)")
        .then(yn => {
            if (yn === 'y' || yn === 'Y') {
                localEcho.print("lots of stuff!");
            }
        })
        .catch(error => alert(`Error reading: ${error}`));
```

### `.abortRead([reason])`

Aborts a currently active `.read`. This function will reject the promise returned from `.read`, passing the `reason` as the rejection reason.

```js
localEcho.read("~$", "> ")
        .then(input => {})
        .catch(error => alert(`Error reading: ${error}`));

localEcho.abortRead("aborted because the server responded");
```

### `.print([message])`
### `.println([message])`

Print a message (and change line) to the terminal. These functions are tailored for writing plain-text messages, performing the appropriate conversions.

For example all new-lines are normalized to `\r\n`, in order for them to appear correctly on the terminal.

### `.printWide(strings)`

Prints an array of strings, occupying the full terminal width. For example:

```js
localEcho.printWide(["first", "second", "third", "fourth", "fifth", "sixth"]);
```

Will display the following, according to the current width of your terminal:

```
first  second  third  fourth
fifth  sixth
```

### `.addAutocompleteHandler(callback, [args...])`

Registers an auto-complete handler that will be used by the local-echo controller when the user hits `TAB`.

The callback has the following signature:

```js
function (index: Number, tokens: Array[String], [args ...]): Array[String] 
```

Where:

* `index`: represents the current token in the user command that an auto-complete is requested for.
* `tokens` : an array with all the tokens in the user command
* `args...` : one or more arguments, as given when the callback was registered.

The function should return an array of possible auto-complete expressions for the current state of the user input.

For example:

```js
// Auto-completes common commands
function autocompleteCommonCommands(index, tokens) {
    if (index == 0) return ["cp", "mv", "ls", "chown"];
    return [];
}

// Auto-completes known files
function autocompleteCommonFiles(index, tokens) {
    if (index == 0) return [];
    return [ ".git", ".gitignore", "package.json" ];
}

// Register the handlers
localEcho.addAutocompleteHandler(autocompleteCommonCommands);
localEcho.addAutocompleteHandler(autocompleteCommonFiles);
```
