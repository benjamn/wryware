const globals = {
  __proto__: null,
  tslib: "tslib",
  "@wry/trie": "wryTrie",
};

function external(id) {
  return id in globals;
}

export default [{
  input: "lib/index.js",
  external,
  output: {
    file: "lib/bundle.cjs",
    format: "cjs",
    exports: "named",
    sourcemap: true,
    name: "supertext",
    globals,
  },
}];
