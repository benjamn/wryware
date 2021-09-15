import assert from "assert";
import defaultEqual, { equal } from "./equality";
import { Equatable, DeepEqualsHelper, objToStr } from "./helpers";

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

  it("should not equate !== objects with custom prototypes", function () {
    class Custom {
      constructor(public readonly number: number) {}
    }

    const c1 = new Custom(1234);
    const c2 = new Custom(1234);
    const c3 = new Custom(2345);

    assertEqual(Object.keys(c1), ["number"]);
    assertEqual(Object.keys(c2), ["number"]);
    assertEqual(Object.keys(c3), ["number"]);

    assert.strictEqual(objToStr.call(c1), "[object Object]");
    assert.strictEqual(objToStr.call(c2), "[object Object]");
    assert.strictEqual(objToStr.call(c3), "[object Object]");

    assertEqual(c1, c1);
    assertEqual(c2, c2);
    assertEqual(c3, c3);
    assertNotEqual(c1, c2);
    assertNotEqual(c1, c3);
    assertNotEqual(c2, c3);
  });

  it("should respect custom a.deepEquals(b) methods for unknown Symbol.toStringTag", function () {
    class Tagged {
      [Symbol.toStringTag] = "Tagged";

      constructor(private value: any) {}

      deepEquals(that: Tagged) {
        return this.value === that.value;
      }
    }

    const t1a = new Tagged(1);
    const t1b = new Tagged(1);
    const t2a = new Tagged(2);
    const t2b = new Tagged(2);

    assert.strictEqual(objToStr.call(t1a), "[object Tagged]");
    assert.strictEqual(objToStr.call(t2b), "[object Tagged]");

    assertEqual(t1a, t1b);
    assertEqual(t2a, t2b);

    assertNotEqual(t1a, t2a);
    assertNotEqual(t1a, t2b);
    assertNotEqual(t1b, t2a);
    assertNotEqual(t1b, t2b);
  });

  it("should respect asymmetric a.deepEquals(b) methods", function () {
    class Point2D implements Equatable {
      constructor(
        public readonly x: number,
        public readonly y: number,
      ) {}

      // It's a shame that we have to provide the parameter types explicitly.
      deepEquals(that: Point2D, equal: DeepEqualsHelper) {
        return this === that || (
          equal(this.x, that.x) &&
          equal(this.y, that.y)
        );
      }
    }

    class Point3D extends Point2D implements Equatable<Point3D> {
      constructor(
        x: number,
        y: number,
        public readonly z: number,
      ) {
        super(x, y);
      }

      deepEquals(that: Point3D, equal: DeepEqualsHelper) {
        return this === that || (
          super.deepEquals(that, equal) &&
          equal(this.z, that.z)
        );
      }
    }

    const x1y2 = new Point2D(1, 2);
    const x2y1 = new Point2D(2, 1);
    const x1y2z0 = new Point3D(1, 2, 0);
    const x1y2z3 = new Point3D(1, 2, 3);

    assertEqual(x1y2, x1y2);
    assertEqual(x2y1, x2y1);
    assertEqual(x1y2z0, x1y2z0);
    assertEqual(x1y2z3, x1y2z3);

    assert.strictEqual(x1y2.deepEquals(x1y2, equal), true);
    assert.strictEqual(x2y1.deepEquals(x2y1, equal), true);
    assert.strictEqual(x1y2z0.deepEquals(x1y2z0, equal), true);
    assert.strictEqual(x1y2z3.deepEquals(x1y2z3, equal), true);

    assertEqual(x1y2, new Point2D(1, 2));
    assertEqual(x2y1, new Point2D(2, 1));
    assertEqual(x1y2z0, new Point3D(1, 2, 0));
    assertEqual(x1y2z3, new Point3D(1, 2, 3));

    assertNotEqual(x1y2, x2y1);
    assertNotEqual(x1y2, x1y2z3);
    assertNotEqual(x2y1, x1y2z0);
    assertNotEqual(x2y1, x1y2z3);
    assertNotEqual(x1y2z0, x1y2z3);

    // These are the most interesting cases, because x1y2 thinks it's equal to
    // both x1y2z0 and x1y2z3, but the equal(a, b) function enforces symmetry.
    assertNotEqual(x1y2, x1y2z0);
    assert.strictEqual(x1y2.deepEquals(x1y2z0, equal), true);
    assert.strictEqual(x1y2.deepEquals(x1y2z3, equal), true);
    assert.strictEqual(x1y2z0.deepEquals(x1y2 as Point3D, equal), false);
    assert.strictEqual(x1y2z3.deepEquals(x1y2 as Point3D, equal), false);
  });

  it("can check cyclic structures of objects with deepEquals methods", function () {
    class Node<T> implements Equatable<Node<T>> {
      constructor(
        public value: T,
        public next?: Node<T>,
      ) {}

      static cycle(n: number) {
        const head = new Node(n);
        let node = head;
        while (--n >= 0) {
          node = new Node(n, node);
        }
        return head.next = node;
      }

      deepEquals(that: Node<T>, equal: DeepEqualsHelper) {
        return this === that || (
          equal(this.value, that.value) &&
          equal(this.next, that.next)
        );
      }
    }

    const cycles = [
      Node.cycle(0),
      Node.cycle(1),
      Node.cycle(2),
      Node.cycle(3),
      Node.cycle(4),
    ];

    cycles.forEach((cycleToCheck, i) => {
      const sameSizeCycle = Node.cycle(i);
      assert.notStrictEqual(cycleToCheck, sameSizeCycle);
      assertEqual(cycleToCheck, sameSizeCycle);

      cycles.forEach((otherCycle, j) => {
        if (i === j) {
          assert.strictEqual(cycleToCheck, otherCycle);
        } else {
          assertNotEqual(cycleToCheck, otherCycle);
        }
      });
    });
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

  it("should equate async functions with the same code", function () {
    const fn = async () => 1234;
    assertEqual(fn, fn);
    assertEqual(fn, async () => 1234);

    // These functions are behaviorally the same, but there's no way to
    // decide that question statically.
    assertNotEqual(
      async (a: number) => a + 1,
      async (b: number) => b + 1,
    );

    assertEqual(
      { before: 123, async fn() { return 4 }, after: 321 },
      { after: 321, before: 123, async fn() { return 4 } },
    );
  });

  it("should equate generator functions with the same code", function () {
    const fn = function *(): Generator<number> { return yield 1234 };
    assertEqual(fn, fn);
    assertEqual(fn, function *(): Generator<number> { return yield 1234 });

    // These functions are behaviorally the same, but there's no way to
    // decide that question statically.
    assertNotEqual(
      function *(a: number): Generator<number> { return yield a + 1 },
      function *(b: number): Generator<number> { return yield b + 1 },
    );

    assertEqual(
      { before: 123, *fn() { return 4 }, after: 321 },
      { after: 321, before: 123, *fn() { return 4 } },
    );
  });

  it("should equate async generator functions with the same code", function () {
    const fn = async function *(): AsyncGenerator<number> { return await (yield 1234) };
    assertEqual(fn, fn);
    assertEqual(fn, async function *(): AsyncGenerator<number> { return await (yield 1234) });

    // These functions are behaviorally the same, but there's no way to
    // decide that question statically.
    assertNotEqual(
      async function *(a: number): AsyncGenerator<number> { return yield a + 1 },
      async function *(b: number): AsyncGenerator<number> { return yield b + 1 },
    );

    assertEqual(
      { before: 123, async *fn() { return 4 }, after: 321 },
      { after: 321, before: 123, async *fn() { return 4 } },
    );
  });

  it('should work for Array Buffers And Typed Arrays', function () {
    const hello = new Int8Array([1, 2, 3, 4, 5]);
    const world = new Int8Array([1, 2, 3, 4, 5]);
    const small = new Int8Array([1, 2, 3, 4])
    assertEqual(new DataView(new ArrayBuffer(4)), new DataView(new ArrayBuffer(4)))
    assertEqual(new Int16Array([42]), new Int16Array([42]));
    assertEqual(new Int32Array(new ArrayBuffer(4)), new Int32Array(new ArrayBuffer(4)))
    assertEqual(new ArrayBuffer(2), new ArrayBuffer(2))
    assertNotEqual(new Int16Array([1, 2, 3]), new Int16Array([1, 2]));
    assertNotEqual(new Int16Array([1, 2, 3]), new Uint16Array([1, 2, 3]))
    assertNotEqual(new Int16Array([1, 2, 3]), new Int8Array([1, 2, 3]))
    assertNotEqual(new Int32Array(8), new Uint32Array(8));
    assertNotEqual(new Int32Array(new ArrayBuffer(8)), new Int32Array(Array.from({ length: 8 })));
    assertNotEqual(new ArrayBuffer(1), new ArrayBuffer(2));
    assertEqual(hello, world);
    assertEqual(hello.buffer, world.buffer);
    assertEqual(new DataView(hello.buffer), new DataView(world.buffer));
    assertNotEqual(small, world)
    assertNotEqual(small.buffer, world.buffer);
    assertNotEqual(new DataView(small.buffer), new DataView(world.buffer));
  });

  it('should work with a kitchen sink', function () {
    const foo = {
      foo: 'value1',
      bar: new Set([1, 2, 3]),
      baz: /foo/i,
      bat: {
        hello: new Map([ ['hello', 'world'] ]),
        world: {
          aaa: new Map([
            [{ foo: /bar/ }, 'sub sub value1'],
          ]),
          bbb: [1, 2, { prop2:1, prop:2 }, 4, 5]
        }
      },
      quz: new Set([{ a:1 , b:2 }]),
      qut: new Date(2016, 2, 10),
      qar: new Uint8Array([1, 2, 3, 4, 5]),
    }

    const bar = {
      quz: new Set([{ a:1 , b:2 }]),
      baz: /foo/i,
      foo: 'value1',
      bar: new Set([1, 2, 3]),
      qar: new Uint8Array([1, 2, 3, 4, 5]),
      qut: new Date('2016/03/10'),
      bat: {
        world: {
          aaa: new Map([
            [{ foo: /bar/ }, 'sub sub value1'],
          ]),
          bbb: [1, 2, { prop2:1, prop:2 }, 4, 5]
        },
        hello: new Map([ ['hello', 'world'] ])
      }
    };

    assertNotEqual(foo, bar)
  });

  describe("performance", function () {
    const limit = 1e6;
    this.timeout(20000);

    function check(a: any, bEqual: any, bNotEqual: any) {
      for (let i = 0; i < limit; ++i) {
        assert.strictEqual(equal(a, bEqual), true);
        assert.strictEqual(equal(bEqual, a), true);
        assert.strictEqual(equal(a, bNotEqual), false);
        assert.strictEqual(equal(bNotEqual, a), false);
      }
    }

    it("should be fast for arrays", function () {
      const a = [1, 2, 3];
      check(a, a.slice(0), [1, 2, 4]);
    });

    it("should be fast for objects", function () {
      const a = { a: 1, b: 2, c: 3 };
      check(a, { ...a }, { a: 1, b: 3 });
    });

    it("should be fast for strings", function () {
      check('foo', new String('foo'), 'bar');
    });

    it("should be fast for functions", function () {
      check(() => 123, () => 123, () => 321);
    });
  });
});
