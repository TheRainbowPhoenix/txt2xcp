# txt2xcp

`txt2xcp` started as a small C program that wraps arbitrary text or binary data in a Casio ClassPad II / fx-CP400 `.xcp` container. This repository now also includes a browser-based JavaScript port so you can generate `.xcp` files directly from a webpage.

## Web converter

Run a local static server and open <http://localhost:8080/web/>:

```sh
npm run serve
```

The web UI provides:

- a Monaco-powered ClassPad text editor with a textarea fallback;
- Unicode-safe payload handling for tokens such as `⇒`, `→`, `lim`, `diff`, `≤`, and `÷`;
- folder and variable-name settings, matching the original 8-byte ClassPad name limit;
- browser-side `.xcp` download generation with no upload step;
- lightweight diagnostics for common text mistakes, including unclosed strings, unbalanced parentheses, and ASCII arrow lookalikes;
- an experimental ClassPad-to-JavaScript sketch for quick inspection.

The included sample is the L’Hôpital-rule program:

```txt
ClrText
DelVar x
Local u,v,a,du,dv,r
Input u,"Numerator:"
Input v,"Denominator:"
Input a,"x approaches:"
ClrText
diff(u,x,1)⇒du
diff(v,x,1)⇒dv
Print "u'="
Print du
Print "v'="
Print dv
lim(du/dv,x,a)⇒r
Print "Result:"
Print r
```

> Important: the JavaScript port faithfully creates the same text-to-XCP container as the C tool. It is not a proprietary Casio tokenizing compiler. On workflows that require compiled executable program variables rather than imported program text, you may still need a calculator-side or official-software compile step.

## JavaScript API

```js
import { convertTextToXcp } from './web/src/xcp.js';

const { bytes, meta } = convertTextToXcp('ClrText\nPrint "Hello"', {
  folderName: 'main',
  variableName: 'hello',
  convertNewlines: true,
});
```

`bytes` is a `Uint8Array` containing the complete `.xcp` file.

## Testing

```sh
npm test
```

The compatibility test compiles the original C program and verifies that the JavaScript writer produces identical bytes for the same text input and options. It also checks Unicode arrow preservation and the sample-program diagnostics/transpiler path.

## Original C CLI

Build the original command-line utility:

```sh
make txt2xcp
```

Usage:

```sh
./txt2xcp [OPTIONS] SOURCE DEST
```

Options:

```txt
  -l       Convert newline characters from "\r\n" or "\n" to "\r".
  -n NAME  Specify the variable name, truncated to 8 bytes.
  -d NAME  Specify the folder name, truncated to 8 bytes.
  -o NAME  Specify the output filename.
  -v       Verbose output.
  -p HEX   Specify a padding byte.
```

Examples:

```sh
./txt2xcp yourfile.bin newfile.xcp
./txt2xcp -l yourfile2.txt newfile2.xcp
```
