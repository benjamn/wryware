import assert from "assert";
import tuple, { Tuple } from "./tuple";

describe("tuple", function () {
  it("should be importable", function () {
    assert.strictEqual(typeof tuple, "function");
  });

  it("should produce array-like Tuple instances", function () {
    assert.deepEqual(tuple(1, 2, 3), [1, 2, 3]);
    assert.strictEqual(tuple("a", "b").length, 2);
    assert.strictEqual(tuple() instanceof Tuple, true);
    assert.strictEqual(tuple(false, true) instanceof Tuple, true);
    assert.strictEqual(Tuple.isTuple(tuple(1, 2, 3)), true);
    assert.strictEqual(Tuple.isTuple([1, 2, 3]), false);
  });

  it("should internalize basic tuples", function () {
    assert.strictEqual(tuple(), tuple());
    assert.strictEqual(tuple(1, 2, 3), tuple(1, 2, 3));
  });

  it("can internalize tuples of tuples", function () {
    assert.strictEqual(
      tuple(1, tuple(2, 3), tuple(), 4),
      tuple(1, tuple(2, 3), tuple(), 4),
    );

    assert.notEqual(
      tuple(1, tuple(2, 3), tuple(), 4),
      tuple(1, tuple(2, 3), tuple(3.5), 4),
    );
  });

  it("can be built with ...spread syntax", function () {
    const t1 = tuple(1);
    const t111 = tuple(...t1, ...t1, ...t1);
    assert.strictEqual(
      tuple(...t111, ...t111),
      tuple(1, 1, 1, 1, 1, 1),
    );
  })
});
