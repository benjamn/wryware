const globals = {
  __proto__: null,
  tslib: "tslib",
  // "@wry/context": "wryContext",
  // "@wry/trie": "wryTrie",
  // "@wry/task": "wryTask",
  // "@wry/equality": "wryEquality",
};

function external(id) {
  return id in globals;
}

function build(input, output, format) {
  return {
    input,
    external,
    output: {
      file: output,
      format,
      sourcemap: true,
      globals
    },
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
