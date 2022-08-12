import typescriptPlugin from 'rollup-plugin-typescript2';
import typescript from 'typescript';

const globals = {
  __proto__: null,
  tslib: "tslib",
  "@wry/trie": "trie",
};

function external(id) {
  return id in globals;
}

export default [{
  input: "src/tuple.ts",
  external,
  output: {
    file: "lib/tuple.esm.js",
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
  input: "lib/tuple.esm.js",
  external,
  output: {
    // Intentionally overwrite the tuple.js file written by tsc:
    file: "lib/tuple.js",
    format: "cjs",
    exports: "named",
    sourcemap: true,
    name: "tuple",
    globals,
  },
}];
