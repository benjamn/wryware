import { readFile, writeFile } from "fs/promises";

export const globals = {
  __proto__: null,
  tslib: "tslib",
  assert: "assert",
  // "@wry/context": "wryContext",
  // "@wry/trie": "wryTrie",
  // "@wry/task": "wryTask",
  // "@wry/equality": "wryEquality",
};

function external(id) {
  return id in globals;
}

export function build(input, output, format) {
  return {
    input,
    external,
    output: {
      file: output,
      format,
      sourcemap: true,
      globals
    },
    ...(output.endsWith(".cjs") ? { plugins: [
      { // Inspired by https://github.com/apollographql/apollo-client/pull/9716,
        // this workaround ensures compatibility with versions of React Native
        // that refuse to load .cjs modules as CommonJS (to be fixed in v0.72):
        name: "copy *.cjs to *.cjs.native.js",
        async writeBundle({ file }) {
          const buffer = await readFile(file);
          await writeFile(file + ".native.js", buffer);
        },
      },
    ]} : null),
  };
}

export default [
  build(
    "lib/es5/index.js",
    "lib/bundle.cjs",
    "cjs"
  ),
  build(
    "lib/tests/main.js",
    "lib/tests/bundle.js",
    "esm"
  ),
  build(
    "lib/es5/tests/main.js",
    "lib/tests/bundle.cjs",
    "cjs"
  ),
];
