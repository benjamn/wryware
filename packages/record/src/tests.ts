import assert from "assert";
import record, { Record } from "./record";

describe("record", function () {
  it("should be importable", function () {
    assert.strictEqual(typeof record, "function");
  });

  it("should pass isRecord", function () {
    const recXY = record({ x: "y", y: "z" });
    assert.strictEqual(Record.isRecord(recXY), true);
    assert.strictEqual(Record.isRecord({ ...recXY }), false);
    assert.deepEqual(recXY, { ...recXY });
    assert.strictEqual(recXY, record({ ...recXY }));
  });

  it("should be frozen", function () {
    assert.strictEqual(Object.isFrozen(record({
      a: 1,
      b: 2,
      c: 3,
    })), true);
  });

  it("should sort keys", function () {
    assert.deepEqual(
      Object.keys(record({
        zxcv: "qwer",
        asdf: "zxcv",
        qwer: "asdf",
      })),
      ["asdf", "qwer", "zxcv"],
    );
  })

  it("should be === when deeply equal", function () {
    assert.strictEqual(
      record({
        a: 1,
        b: 2,
      }),
      record({
        b: 2,
        a: 1,
      }),
    );

    const ab = {
      a: "a".charCodeAt(0),
      b: "b".charCodeAt(0),
    };

    const abRec = record(ab);

    const xy = {
      x: "x".charCodeAt(0),
      y: "y".charCodeAt(0),
    };

    const xyRec = record(xy);

    const abxyRec = record({
      ...xy,
      ...ab,
    });

    assert.strictEqual(record({
      ...ab,
      ...xy,
    }), abxyRec);

    assert.strictEqual(record({
      ...ab,
      ...xy,
      ...ab,
    }), abxyRec);

    assert.strictEqual(record({
      ...xy,
      ...ab,
      ...xy,
    }), abxyRec);

    assert.strictEqual(record({
      ...abRec,
      ...xyRec,
    }), abxyRec);

    assert.strictEqual(record({
      ...xyRec,
      ...abRec,
    }), abxyRec);

    assert.deepEqual(abxyRec, {
      a: 97,
      b: 98,
      x: 120,
      y: 121,
    });

    assert.deepEqual(
      Object.keys(abxyRec),
      ["a", "b", "x", "y"],
    );
  });
});
