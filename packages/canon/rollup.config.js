import typescriptPlugin from 'rollup-plugin-typescript2';
import typescript from 'typescript';

const globals = {
  __proto__: null,
  tslib: "tslib",
  "@wry/trie": "wryTrie",
};

function external(id) {
  return id in globals;
}

export default [{
  input: "src/canon.ts",
  external,
  output: {
    file: "lib/canon.esm.js",
    format: "esm",
    sourcemap: true,
    globals,
  },
  plugins: [
    typescriptPlugin({
      typescript,
      tsconfig: "./tsconfig.rollup.json",
    }),
  ],
}, {
  input: "lib/canon.esm.js",
  external,
  output: {
    // Intentionally overwrite the canon.js file written by tsc:
    file: "lib/canon.js",
    format: "cjs",
    exports: "named",
    sourcemap: true,
    name: "canon",
    globals,
  },
}];
