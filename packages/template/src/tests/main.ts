import * as assert from "assert";
import { name } from "../index";

describe("template", function () {
  it("should be importable", function () {
    assert.strictEqual(name, "@wry/template");
  });
});
