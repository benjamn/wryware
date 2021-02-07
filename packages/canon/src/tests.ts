import assert from "assert";
import { Canon } from "./canon";

describe("Canon", () => {
  it("should be importable", () => {
    assert.strictEqual(typeof Canon, "function");
  });
});
