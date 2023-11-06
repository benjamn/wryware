import * as assert from "assert";
import { name } from "../index.js";

describe("caches", function () {
  it("should be importable", function () {
    assert.strictEqual(name, "@wry/caches");
  });
});
