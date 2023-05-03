import * as assert from "assert";
import { name } from "../index.js";

describe("template", function () {
  it("should be importable", function () {
    assert.strictEqual(name, "@wry/template");
  });
});
