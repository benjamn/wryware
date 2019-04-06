import assert from "assert";
import { name } from "./context";

describe("context", function () {
  it("should be importable", function () {
    assert.strictEqual(name, "@wry/context");
  });
});
