import assert from "assert";
import { name } from "./template";

describe("template", function () {
  it("should be importable", function () {
    assert.strictEqual(name, "@wry/template");
  });
});
