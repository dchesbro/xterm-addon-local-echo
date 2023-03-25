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
- **Paste text:** Paste commands or other text using `cmd+v`.
- **Tab completion:** Auto-complete commands using the `tab` key with support for adding user defined tab completion callback functions, now works with multi-word commands!

**Note:** Crossed out features are completely or partially implemented, but disabled because of bugs related to cursor position on multi-line commands.

## Usage

### As an ES6 Module

1. Install using your preferred package manager:

    ### `npm`

    ```sh
    npm install dchesbro/xterm-addon-local-echo
    ```

    ### `yarn`

    ```sh
    yarn add dchesbro/xterm-addon-local-echo
    ```

2. Import and initialize:

    ```js
    import { LocalEchoAddon } from "@dchesbro/xterm-addon-local-echo";
    import { Terminal } from "xterm";

    // Create addon and terminal.
    const localEcho = new LocalEchoAddon();
    const term = new Terminal();

    // Add user defined tab complete callback functions.
    localEcho.addTabCompleteHandler((index) => {
      if (index !== 0) return [];

      return ["bash", "chmod", "chown", "cp", "ls", "ps"];
    });

    localEcho.addTabCompleteHandler((index) => {
      if (index === 0) return [];
      
      return [".git", ".gitignore", "some-file", "some-other-file"];
    });

    // Load addon and initialize terminal.
    term.loadAddon(localEcho);
    term.open(document.getElementById("terminal"));

    // Simple looping read function.
    const readInput = async () => {
      localEcho.read("$ ")
        .then((input) => localEcho.println("Local echo: " + input))
        .then(readInput);
    };

    readInput();
    ```

## Public API Reference

### `constructor(term, [options])`

The add-on constructor accepts an `xterm.js` instance as the first argument, and an object with settings for all other options as the second argument. Options are:

```js
{
    // The maximum number of items to save in the command history.
    historySize: 10,

    // Enable support for incomplete commands.
    incompleteEnabled: true,

    // The maximum number of tab complete suggestions to display before prompting the user.
    tabCompleteSize: 10,
}
```

### `.read(ps1, ps2)`

Return promise that resolves when a complete input is sent. For example:

```js
localEcho.read("$ ", "> ")
    .then((input) => localEcho.println("Local echo: " + input))
    .catch((error) => localEcho.println("Error: " + error));
```

### `.readChar(ps1)`

Return a promise that resolves when a user inputs a single character -- can be active in addition to `read()` and will resolve before it. For example:

```js
localEcho.readChar("Do you wish to see all possibilities? (y/n) ")
    .then((char) => {
        if (char === 'y' || char === 'Y') {
            localEcho.println("All the possibilities!");
        }
    })
    .catch((error) => localEcho.println("Error: " + error));
```

### `.abortRead(reason)`

Abort read operation(s), if any are pending. For example:

```js
localEcho.read("$ ", "> ")
    .then((input) => localEcho.println("Local echo: " + input))
    .catch((error) => localEcho.println("Error: " + error));

localEcho.abortRead("Reason the operation was aborted.");
```

### `.print(output)`
### `.println(output)`

Print string (with newline) and format newline characters.

### `.printlsInline([items], padding)`
### `.printlsNumber([items], padding)`

Print an array of string as an inline or numbered list. For example:

```js
localEcho.printlsInline(["First", "Second", "Third"]);
localEcho.printlsNumber(["First", "Second", "Third"]);
```

Will output the following formatted lists:

```
First    Second   Third

1  First
2  Second
3  Third
```

### `.addTabCompleteHandler(callback, [args...])`

Add a tab complete handler function. Callback functions have the following signature:

```js
/**
 * @param index     Input fragment used to match tab complete suggestions.
 * @param fragments An array with all the fragments from the current input string.
 * @param args...   One or more additional arguments.
 */
function (index: Number, fragments: Array[String], [args...]): Array[String] 
```

Tab complete callback functions should return an array of suggestions for the current input fragment. For example:

```js
// Suggestions for commands.
const suggestCommands = (index) => {
    if (index !== 0) return [];

    return ["bash", "chmod", "chown", "cp", "ls", "ps"];
};

// Suggestions for known files.
const suggestFiles = (index) => {
    if (index === 0) return [];
    
    return [".git", ".gitignore", "some-file", "some-other-file"];
};

localEcho.addTabCompleteHandler(suggestCommands);
localEcho.addTabCompleteHandler(suggestFiles);
```

### `.removeTabCompleteHandler(callback)`

Remove a previously added tab complete handler function. For example:

```js
localEcho.removeTabCompleteHandler(suggestCommands);
```
