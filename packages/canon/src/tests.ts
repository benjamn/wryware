import assert from "assert";
import { equal } from "@wry/equality";
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

  it("can admit arrays that contain themselves", () => {
    const canon = new Canon;

    const input: any[] = [1];
    input.push(input, 2, input, 3);

    const admitted = canon.admit(input);

    assert.strictEqual(admitted[1], admitted);
    assert.strictEqual(admitted[3], admitted);

    assert.ok(equal(input, admitted));

    assert.strictEqual(
      canon.admit(input),
      admitted,
    );

    assert.strictEqual(
      canon.admit(admitted),
      admitted,
    );

    assert.strictEqual(
      canon.admit(input[3]),
      admitted[3],
    );

    assert.strictEqual(
      canon.admit(admitted[3]),
      admitted,
    );
  });

  it("can admit objects that symmetrically reference each other", () => {
    const canon = new Canon;

    const a: Record<string, any> = {};
    const b: Record<string, any> = {};

    a.other = b;
    a.self = a;

    b.other = a;
    b.self = b;

    const a1 = canon.admit(a);
    const b1 = canon.admit(b);

    assert.strictEqual(a1.other, b1);
    assert.strictEqual(a1.self, a1);
    assert.strictEqual(b1.other, a1);
    assert.strictEqual(b1.self, b1);

    assert.ok(equal(a, a1));
    assert.ok(equal(b, b1));

    // This is the REAL magic trick.
    assert.strictEqual(a1, b1);

    b.a = a;
    a.b = b;

    const a2 = canon.admit(a);
    const b2 = canon.admit(b);

    assert.ok(equal(a, a2));
    assert.ok(equal(b, b2));

    assert.notStrictEqual(a1, a2);
    assert.notStrictEqual(b1, b2);

    assert.strictEqual(a2.b, b2);
    assert.strictEqual(b2.a, a2);

    assert.notStrictEqual(a2, b2);
    assert.strictEqual(equal(a2, b2), false);
  });
});
