import typescriptPlugin from 'rollup-plugin-typescript2';
import typescript from 'typescript';

const globals = {
  __proto__: null,
  tslib: "tslib",
  "@wry/tuple": "wryTuple",
};

function external(id) {
  return id in globals;
}

export default [{
  input: "src/record.ts",
  external,
  output: {
    file: "lib/record.esm.js",
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
  input: "lib/record.esm.js",
  external,
  output: {
    // Intentionally overwrite the record.js file written by tsc:
    file: "lib/record.js",
    format: "cjs",
    exports: "named",
    sourcemap: true,
    name: "record",
    globals,
  },
}];
