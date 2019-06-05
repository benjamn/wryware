import assert from "assert";
import { name } from "./equality";

describe("equality", function () {
  it("should be importable", function () {
    assert.strictEqual(name, "@wry/equality");
  });
});
