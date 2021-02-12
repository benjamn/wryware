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

  it("can admit ring structures", () => {
    function cons(value: number, tail: any) {
      return { value, tail };
    }
    const last = cons(5, null);
    const list = cons(1, cons(2, cons(3, cons(4, last))));
    last.tail = list;

    const canon = new Canon;

    const from1 = canon.admit(list);
    const from2 = canon.admit(list.tail);
    const from3 = canon.admit(list.tail.tail);
    const from4 = canon.admit(list.tail.tail.tail);
    const from5 = canon.admit(list.tail.tail.tail.tail);

    assert.ok(equal(from1, list));
    assert.ok(equal(from2, list.tail));
    assert.ok(equal(from3, list.tail.tail));
    assert.ok(equal(from4, list.tail.tail.tail));
    assert.ok(equal(from5, list.tail.tail.tail.tail));
    assert.ok(equal(from1, list.tail.tail.tail.tail.tail));

    assert.strictEqual(from1, canon.admit(list));
    assert.strictEqual(from2, canon.admit(list.tail));
    assert.strictEqual(from3, canon.admit(list.tail.tail));
    assert.strictEqual(from4, canon.admit(list.tail.tail.tail));
    assert.strictEqual(from5, canon.admit(list.tail.tail.tail.tail));
    assert.strictEqual(from1, canon.admit(list.tail.tail.tail.tail.tail));

    const fromSet = new Set([
      from1,
      from1.tail,
      from1.tail.tail,
      from1.tail.tail.tail,
      from1.tail.tail.tail.tail,
      from1.tail.tail.tail.tail.tail,
      from1.tail.tail.tail.tail.tail.tail,
    ]);
    assert.strictEqual(fromSet.size, 5);

    const symLast = cons(1, null);
    const symList = cons(2, cons(1, cons(2, symLast)));
    symLast.tail = symList;

    const symFrom2 = canon.admit(symList);
    const symFrom1 = canon.admit(symList.tail);

    assert.strictEqual(symFrom1, symFrom2.tail);
    assert.strictEqual(symFrom2, symFrom1.tail);

    const symSet = new Set([
      symFrom1,
      symFrom1.tail,
      symFrom1.tail.tail,
      symFrom1.tail.tail.tail,
      symFrom1.tail.tail.tail.tail,
      symFrom1.tail.tail.tail.tail.tail,
      symFrom1.tail.tail.tail.tail.tail.tail,
    ]);
    assert.strictEqual(symSet.size, 2);
  });
});
