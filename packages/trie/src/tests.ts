import assert from "assert";
import { name } from "./trie";

describe("trie", function () {
  it("should be importable", function () {
    assert.strictEqual(name, "@wry/trie");
  });
});
