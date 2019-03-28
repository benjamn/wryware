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
  input: "src/task.ts",
  external,
  output: {
    file: "lib/task.esm.js",
    format: "esm",
    sourceMap: true,
    globals,
  },
  plugins: [
    typescriptPlugin({
      typescript,
      tsconfig: "./tsconfig.rollup.json",
    }),
  ],
}, {
  input: "lib/task.esm.js",
  external,
  output: {
    // Intentionally overwrite the task.js file written by tsc:
    file: "lib/task.js",
    format: "cjs",
    exports: "named",
    sourceMap: true,
    name: "task",
    globals,
  },
}];
