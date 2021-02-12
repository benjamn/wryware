import assert from "assert";
import { Canon } from "./canon";

describe("Canon", () => {
  it("should be importable", () => {
    assert.strictEqual(typeof Canon, "function");
  });

  it("can admit primitive values as-is", () => {
    const canon = new Canon;
    assert.strictEqual(canon.admit(123), 123);
    assert.strictEqual(canon.admit("abc"), "abc");
    assert.strictEqual(canon.admit(true), true);
    assert.strictEqual(canon.admit(false), false);
    assert.strictEqual(canon.admit(null), null);
  });

  it("can admit simple nested arrays", () => {
    const canon = new Canon;

    const input = [
      "a",
      ["b", ["c", "d"]],
      [1, 2, 3],
      "f",
    ];

    const admitted1 = canon.admit(input);
    assert.deepStrictEqual(input, admitted1);
    const admitted2 = canon.admit(input);
    assert.deepStrictEqual(input, admitted2);
    assert.strictEqual(admitted1, admitted2);

    const cd = canon.admit(input[1][1]);
    assert.deepStrictEqual(cd, ["c", "d"]);
    assert.strictEqual(cd, admitted1[1][1]);
    assert.strictEqual(cd, admitted2[1][1]);

    assert.strictEqual(
      canon.admit(admitted1),
      admitted2,
    );

    assert.strictEqual(
      canon.admit(admitted2),
      admitted1,
    );
  });
});
