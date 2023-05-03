import { build } from "../../shared/rollup.config.js";

// This package doesn't use the lib/es5 directory, so we need to override the
// default export from ../../shared/rollup.config.js (as we also do in the
// @wry/equality package).
export default [
  build(
    "lib/index.js",
    "lib/bundle.cjs",
    "cjs"
  ),
  build(
    "lib/tests/main.js",
    "lib/tests/bundle.js",
    "esm"
  ),
  build(
    "lib/tests/main.js",
    "lib/tests/bundle.cjs",
    "cjs"
  ),
];
