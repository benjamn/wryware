import typescriptPlugin from 'rollup-plugin-typescript2';
import typescript from 'typescript';

const globals = {
  __proto__: null,
  tslib: "tslib",
};

function external(id) {
  return id in globals;
}

export default [{
  input: "src/template.ts",
  external,
  output: {
    file: "lib/template.esm.js",
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
  input: "lib/template.esm.js",
  external,
  output: {
    // Intentionally overwrite the template.js file written by tsc:
    file: "lib/template.js",
    format: "cjs",
    exports: "named",
    sourceMap: true,
    name: "template",
    globals,
  },
}];
