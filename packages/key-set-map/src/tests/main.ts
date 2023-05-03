import * as assert from "assert";
import { KeySetMap } from "../index.js";

describe("@wry/key-set-map", () => {
  it("should be importable/constructable/etc", () => {
    assert.strictEqual(typeof KeySetMap, "function");
    const ksm = new KeySetMap();
    assert.strictEqual(typeof ksm, "object");
    assert.strictEqual(ksm instanceof KeySetMap, true);
    assert.strictEqual(ksm.constructor, KeySetMap);
    assert.strictEqual(Object.getPrototypeOf(ksm), KeySetMap.prototype);
  });

  it("lookupSet should reject non-Set objects", () => {
    const ksm = new KeySetMap();
    // @ts-expect-error
    assert.throws(() => ksm.lookupSet({}), TypeError, "Not a Set: [object Object]");
    // @ts-expect-error
    assert.throws(() => ksm.lookupSet([]), TypeError, "Not a Set: [object Array]");
    // @ts-expect-error
    assert.throws(() => ksm.lookupSet(new Map()), TypeError, "Not a Set: [object Map]");
    // @ts-expect-error
    assert.throws(() => ksm.lookupSet(new WeakMap()), TypeError, "Not a Set: [object WeakMap]");
    // @ts-expect-error
    assert.throws(() => ksm.lookupSet(new WeakSet()), TypeError, "Not a Set: [object WeakSet]");
  });

  it("should look up keys with set semantics", () => {
    const ksm = new KeySetMap();

    const setOfEmptyLookups = new Set([
      ksm.lookup([]),
      ksm.lookup([]),
      ksm.lookup([]),
    ]);
    assert.strictEqual(setOfEmptyLookups.size, 1);

    const abData = ksm.lookup(["a", "b"]);
    const baData = ksm.lookup(["b", "a"]);
    assert.strictEqual(abData, baData);

    const abcDataSet = new Set([
      ksm.lookup(["a", "b", "c"]),
      ksm.lookup(["a", "c", "b"]),
      ksm.lookup(["b", "a", "c"]),
      ksm.lookup(["b", "c", "a"]),
      ksm.lookup(["c", "a", "b"]),
      ksm.lookup(["c", "b", "a"]),
    ]);
    assert.strictEqual(abcDataSet.size, 1);
    abcDataSet.forEach(abcData => {
      assert.strictEqual(abcData, ksm.lookup(["a", "b", "c"]));
    });
  });

  it("should peek keys with set semantics", () => {
    const ksm = new KeySetMap;

    assert.strictEqual(ksm.peek([]), void 0);
    assert.strictEqual(ksm.peek([]), void 0);
    assert.strictEqual(ksm.peek([]), void 0);

    const emptyData = ksm.lookup([]);
    assert.strictEqual(emptyData && typeof emptyData, "object");
    assert.strictEqual(ksm.peek([]), emptyData);

    assert.strictEqual(ksm.peek(["a", "b"]), void 0);
    assert.strictEqual(ksm.peek(["b", "a"]), void 0);
    const abData = ksm.lookup(["a", "b"]);
    assert.strictEqual(ksm.peek(["a", "b"]), abData);
    assert.strictEqual(ksm.peek(["b", "a"]), abData);
    const baData = ksm.lookup(["b", "a"]);
    assert.strictEqual(ksm.peek(["a", "b"]), baData);
    assert.strictEqual(ksm.peek(["b", "a"]), baData);
    assert.strictEqual(abData, baData);

    function checkABC<T extends object | undefined>(data: T): T {
      assert.strictEqual(ksm.peek(["a", "b", "c"]), data);
      assert.strictEqual(ksm.peek(["a", "c", "b"]), data);
      assert.strictEqual(ksm.peek(["b", "a", "c"]), data);
      assert.strictEqual(ksm.peek(["b", "c", "a"]), data);
      assert.strictEqual(ksm.peek(["c", "a", "b"]), data);
      assert.strictEqual(ksm.peek(["c", "b", "a"]), data);
      return data;
    }
    checkABC(void 0);
    const abcDataSet = new Set([
      checkABC(ksm.lookup(["a", "b", "c"])),
      checkABC(ksm.lookup(["a", "c", "b"])),
      checkABC(ksm.lookup(["b", "a", "c"])),
      checkABC(ksm.lookup(["b", "c", "a"])),
      checkABC(ksm.lookup(["c", "a", "b"])),
      checkABC(ksm.lookup(["c", "b", "a"])),
    ]);
    assert.strictEqual(abcDataSet.size, 1);
  });

  function eachPermutation<T>(
    items: T[],
    callback: (permutation: T[]) => void,
  ) {
    return (function recurse(n: number) {
      if (n === 1) {
        callback(items.slice());
      } else {
        for (let i = 0; i < n; ++i) {
          recurse(n - 1);
          const j = n % 2 ? 0 : i;
          const item = items[n - 1];
          items[n - 1] = items[j];
          items[j] = item;
        }
      }
    })(items.length);
  }

  const factorial = (n: number): number => n <= 1 ? 1 : n * factorial(n - 1);

  it("should look up object reference keys with set semantics", () => {
    const ksm = new KeySetMap();

    const objects = [
      { a: 1 },
      { b: 2 },
      { c: 3 },
      { d: 4 },
      { e: 5 },
    ];

    assert.strictEqual(ksm.peek(objects), void 0);
    const objectsData = ksm.lookup(objects);
    assert.strictEqual(ksm.peek(objects), objectsData);

    let permutationCount = 0;
    eachPermutation(objects, permutation => {
      const data = ksm.lookup(permutation);
      assert.strictEqual(data, objectsData);
      ++permutationCount;
    });
    const expectedPermutationCount = factorial(objects.length);
    assert.strictEqual(permutationCount, expectedPermutationCount);
  });

  describe("custom makeData functions", () => {
    it("object-returning makeData", () => {
      const ksm = new KeySetMap(true, it => {
        const array: any[] = [];
        for (let item = it.next(); !item.done; item = it.next()) {
          array.push(item.value);
        }
        return {
          count: array.length,
          array,
        };
      });

      const emptyData = ksm.lookup([]);
      assert.strictEqual(emptyData.count, 0);
      assert.deepStrictEqual(emptyData.array, []);

      const abcData1 = ksm.lookup(["b", "a", "b", "c"]);
      const abcData2 = ksm.lookup(["c", "b", "a", "b", "c"]);
      const abcData3 = ksm.lookup(["a", "b", "c"]);

      assert.strictEqual(abcData1.count, 3);
      assert.deepStrictEqual(abcData1.array, ["b", "a", "c"]);

      assert.strictEqual(abcData2.count, 3);
      assert.strictEqual(abcData2.array, abcData1.array);

      assert.strictEqual(abcData3.count, 3);
      assert.strictEqual(abcData3.array, abcData1.array);
    });

    it("primitive-returning makeData", () => {
      const ksm = new KeySetMap(true, it => {
        const array: string[] = [];
        for (let item = it.next(); !item.done; item = it.next()) {
          array.push(item.value);
        }
        return array.join(",");
      });

      const emptyData = ksm.lookup([]);
      assert.strictEqual(emptyData, "");

      const abcData2 = ksm.lookup(["c", "c", "b", "a", "b", "c"]);
      const abcData1 = ksm.lookup(["b", "a", "b", "c"]);
      const abcData3 = ksm.lookup(["a", "c", "a", "b"]);

      assert.strictEqual(abcData1, "c,b,a");
      assert.strictEqual(abcData2, abcData1);
      assert.strictEqual(abcData3, abcData1);
    });
  });

  it("should not be confused by supersets of keys", () => {
    const ksm = new KeySetMap();

    const emptyData = ksm.lookup([]);
    const aData = ksm.lookup(["a"]);
    const abData = ksm.lookup(["a", "b"]);
    const abVoidData = ksm.lookup(["a", "b", void 0]);
    const abcData = ksm.lookup(["a", "b", "c"]);

    assert.strictEqual(new Set([
      emptyData,
      aData,
      abData,
      abVoidData,
      abcData,
    ]).size, 5);

    const abcdDataObjects: object[] = [];
    const supersetDataObjects: object[] = [];

    eachPermutation(["a", "b", "c", "d"], permutation => {
      // Put a subset of this permutation into the ksm.
      const sliced = permutation.slice(1);
      const slicedData = ksm.lookup(sliced);
      assert.strictEqual(ksm.peek(sliced), slicedData);

      // Put a superset of this permutation into the ksm.
      const rogue = Symbol();
      assert.strictEqual(ksm.peek([...permutation, rogue]), void 0);
      const abcdeData = ksm.lookup([...permutation, rogue]);
      assert.strictEqual(ksm.peek([rogue, ...permutation]), abcdeData);
      supersetDataObjects.push(abcdeData);

      // Now put the permutation itself into the ksm, expecting no
      // interference from the previous lookups.
      abcdDataObjects.push(ksm.lookup(permutation));
    });

    // All the Data objects for the a,b,c,d permutations should be the same.
    assert.strictEqual(new Set(abcdDataObjects).size, 1);

    // There should only be as many superset Data objects as there are
    // permutations of the original four keys, but the extra rogue element makes
    // them all distinct rather than collapsing down to 1.
    assert.strictEqual(new Set(supersetDataObjects).size, factorial(4));
  });

  it("removing sets of keys", () => {
    const ksm = new KeySetMap();

    const abcData = ksm.lookup(["a", "b", "c"]);
    const abData = ksm.lookup(["a", "b"]);
    const emptyData = ksm.lookup([]);

    assert.strictEqual(ksm.peek(["a", "b", "c"]), abcData);
    assert.strictEqual(ksm.peek(["a", "b"]), abData);
    assert.strictEqual(ksm.peek([]), emptyData);

    assert.strictEqual(ksm.remove(["b", "a", "b", "c", "b"]), abcData);
    assert.strictEqual(ksm.remove(["b", "c", "a"]), void 0);
    assert.strictEqual(ksm.peek(["a", "b", "c"]), void 0);

    assert.strictEqual(ksm.remove([]), emptyData);
    assert.strictEqual(ksm.remove([]), void 0);
    assert.strictEqual(ksm.peek([]), void 0);

    assert.strictEqual(ksm.peek(["b", "a", "a"]), abData);
    assert.strictEqual(ksm.peek(["a", "b"]), abData);
    assert.strictEqual(ksm.remove(["a", "b"]), abData);
    assert.strictEqual(ksm.remove(["b", "a", "b"]), void 0);

    assert.notStrictEqual(ksm.lookup([]), emptyData);
    assert.notStrictEqual(ksm.lookup(["a", "b"]), abData);
    assert.notStrictEqual(ksm.lookup(["a", "b", "c"]), abcData);
  });
});
