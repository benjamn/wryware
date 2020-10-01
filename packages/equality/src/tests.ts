import assert from "assert";
import defaultEqual, { equal } from "./equality";

function toStr(value: any) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function assertEqual(a: any, b: any) {
  assert.strictEqual(equal(a, b), true, `unexpectedly not equal(${toStr(a)}}, ${toStr(b)})`);
  assert.strictEqual(equal(b, a), true, `unexpectedly not equal(${toStr(b)}, ${toStr(a)})`);
}

function assertNotEqual(a: any, b: any) {
  assert.strictEqual(equal(a, b), false, `unexpectedly equal(${toStr(a)}, ${toStr(b)})`);
  assert.strictEqual(equal(b, a), false, `unexpectedly equal(${toStr(b)}, ${toStr(a)})`);
}

describe("equality", function () {
  it("should work with named and default imports", function () {
    assert.strictEqual(defaultEqual, equal);
  });

  it("should work for primitive types", function () {
    assertEqual(2 + 2, 4);
    assertNotEqual(2 + 2, 5);

    assertEqual("oyez", "oyez");
    assertNotEqual("oyez", "onoz");

    assertEqual(null, null);
    assertEqual(void 0, void 1);
    assertEqual(NaN, NaN);

    assertNotEqual(void 0, null);
    assertNotEqual(void 0, false);
    assertNotEqual(false, null);
    assertNotEqual(0, null);
    assertNotEqual(0, false);
    assertNotEqual(0, void 0);

    assertEqual(123, new Number(123));
    assertEqual(true, new Boolean(true));
    assertEqual(false, new Boolean(false));
    assertEqual("oyez", new String("oyez"));
  });

  it("should work for arrays", function () {
    assertEqual([1, 2, 3], [1, 2, 3]);
    assertEqual([1, [2], 3], [1, [2], 3]);

    const a: any[] = [1];
    a.push(a, 2);
    const b: any[] = [1];
    b.push(b, 2);
    assertEqual(a, b);

    assertEqual(
      [1, /*hole*/, 3],
      [1, /*hole*/, 3],
    );

    assertEqual(
      [1, /*hole*/, 3],
      [1, void 0, 3],
    );

    // Not equal because the arrays are a different length.
    assertNotEqual(
      [1, 2, /*hole*/,],
      [1, 2],
    );
  });

  it("should work for objects", function () {
    assertEqual({
      a: 1,
      b: 2,
    }, {
      b: 2,
      a: 1,
    });

    assertNotEqual({
      a: 1,
      b: 2,
      c: 3,
    }, {
      b: 2,
      a: 1,
    });

    const a: any = {};
    a.self = a;
    const b: any = {};
    b.self = b;
    assertEqual(a, b);

    b.foo = 42;
    assertNotEqual(a, b);
  });

  it("should consider undefined and missing object properties equivalent", function () {
    assertEqual({
      a: 1,
      b: void 0,
      c: 3,
    }, {
      a: 1,
      c: 3,
    });

    assertEqual({
      a: void 0,
      b: void 0,
      c: void 0,
    }, {});
  });

  it("should work for Error objects", function () {
    assertEqual(new Error("oyez"), new Error("oyez"));
    assertNotEqual(new Error("oyez"), new Error("onoz"));
  });

  it("should work for Date objects", function () {
    const now = new Date;
    const alsoNow = new Date(+now);
    assert.notStrictEqual(now, alsoNow);
    assertEqual(now, alsoNow);
    const later = new Date(+now + 10);
    assertNotEqual(now, later);
  });

  it("should work for RegExp objects", function () {
    assert.notStrictEqual(/xy/, /xy/);
    assertEqual(/xy/img, /xy/mgi);
    assertNotEqual(/xy/img, /x.y/img);
  });

  it("should work for Set objects", function () {
    assertEqual(
      new Set().add(1).add(2).add(3).add(2),
      new Set().add(3).add(1).add(2).add(1),
    );

    const obj = {};
    assertEqual(
      new Set().add(1).add(obj).add(3).add(2),
      new Set().add(3).add(obj).add(2).add(1),
    );

    assertNotEqual(
      new Set(),
      new Set().add(void 0),
    );
  });

  it("should work for Map objects", function () {
    assertEqual(
      new Map().set(1, 2).set(2, 3),
      new Map().set(2, 3).set(1, 2),
    );

    assertEqual(
      new Map().set(1, 2).set(2, 3).set(1, 0),
      new Map().set(2, 3).set(1, 2).set(1, 0),
    );

    assertNotEqual(
      new Map().set(1, 2).set(2, 3).set(1, 0),
      new Map().set(2, 3).set(1, 2).set(3, 4),
    );

    assertEqual(
      new Map().set(1, new Set().add(2)),
      new Map().set(1, new Set().add(2)),
    );

    assertNotEqual(
      new Map().set(1, new Set().add(2)),
      new Map().set(1, new Set().add(2).add(3)),
    );

    const a = new Map;
    a.set(a, a);
    const b = new Map;
    b.set(a, b);
    assertEqual(a, b);

    a.set(1, 2);
    b.set(1, 2);
    assertEqual(a, b);

    a.set(3, 4);
    assertNotEqual(a, b);
  });

  it("should tolerate cycles", function () {
    const a: any[] = [];
    a.push(a);
    const b: any[] = [];
    b.push(b);
    assertEqual(a, b);
    assertEqual([a], b);
    assertEqual(a, [b]);
    assertEqual([a], [b]);

    a.push(1);
    b.push(1);
    assertEqual(a, b);
    assertEqual([a, 1], b);
    assertEqual(a, [b, 1]);

    const ring1 = { self: { self: { self: {} as any }}};
    ring1.self.self.self.self = ring1;
    const ring2 = { self: { self: {} as any }};
    ring2.self.self.self = ring2;
    assertEqual(ring1, ring2);

    ring1.self.self.self.self = ring1.self;
    assertEqual(ring1, ring2);
  });

  it("should not care about repeated references", function () {
    const r = { foo: 42 };
    assertEqual(
      [r, r, r],
      JSON.parse(JSON.stringify([r, r, r])),
    );
  });

  it("should equate non-native functions with the same code", function () {
    const fn = () => 1234;
    assertEqual(fn, fn);
    assertEqual(fn, () => 1234);

    // These functions are behaviorally the same, but there's no way to
    // decide that question statically.
    assertNotEqual(
      (a: number) => a + 1,
      (b: number) => b + 1,
    );

    assertEqual(
      { before: 123, fn() { return 4 }, after: 321 },
      { after: 321, before: 123, fn() { return 4 } },
    );

    assertEqual(Object.assign, Object.assign);

    // Since these slice methods are native functions, they happen to have
    // exactly the same (censored) code, but we can test their equality by
    // reference, since we can generally assume native functions are pure.
    assertNotEqual(String.prototype.slice, Array.prototype.slice);
    assertEqual(
      Function.prototype.toString.call(String.prototype.slice),
      Function.prototype.toString.call(Array.prototype.slice),
    );
  });
});
