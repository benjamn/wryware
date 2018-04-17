var assert = require("assert");
var crypto = require("crypto");
var optimism = require("../lib/index.js");
var wrap = optimism.wrap;

describe("optimism", function () {
  it("sanity", function () {
    assert.strictEqual(typeof wrap, "function");
    assert.strictEqual(typeof optimism.defaultMakeCacheKey, "function");
  });

  it("works with single functions", function () {
    var test = wrap(function (x) {
      return x + salt;
    }, {
      makeCacheKey: function (x) {
        return x;
      }
    });

    var salt = "salt";
    assert.strictEqual(test("a"), "asalt");

    salt = "NaCl";
    assert.strictEqual(test("a"), "asalt");
    assert.strictEqual(test("b"), "bNaCl");

    test.dirty("a");
    assert.strictEqual(test("a"), "aNaCl");
  });

  it("works with two layers of functions", function () {
    var files = {
      "a.js": "a",
      "b.js": "b"
    };

    var fileNames = Object.keys(files);

    var read = wrap(function (path) {
      return files[path];
    });

    var hash = wrap(function (paths) {
      var h = crypto.createHash("sha1");
      paths.forEach(function (path) {
        h.update(read(path));
      });
      return h.digest("hex");
    });

    var hash1 = hash(fileNames);
    files["a.js"] += "yy";
    var hash2 = hash(fileNames);
    read.dirty("a.js");
    var hash3 = hash(fileNames);
    files["b.js"] += "ee";
    read.dirty("b.js");
    var hash4 = hash(fileNames);

    assert.strictEqual(hash1, hash2);
    assert.notStrictEqual(hash1, hash3);
    assert.notStrictEqual(hash1, hash4);
    assert.notStrictEqual(hash3, hash4);
  });

  it("works with subscription functions", function () {
    var dirty;
    var sep = ",";
    var unsubscribed = Object.create(null);
    var test = wrap(function (x) {
      return [x, x, x].join(sep);
    }, {
      max: 1,
      subscribe: function (x) {
        dirty = function () {
          test.dirty(x);
        };

        delete unsubscribed[x];

        return function () {
          unsubscribed[x] = true;
        };
      }
    });

    assert.strictEqual(test("a"), "a,a,a");

    assert.strictEqual(test("b"), "b,b,b");
    assert.deepEqual(unsubscribed, { a: true });

    assert.strictEqual(test("c"), "c,c,c");
    assert.deepEqual(unsubscribed, {
      a: true,
      b: true
    });

    sep = ":";

    assert.strictEqual(test("c"), "c,c,c");
    assert.deepEqual(unsubscribed, {
      a: true,
      b: true
    });

    dirty();

    assert.strictEqual(test("c"), "c:c:c");
    assert.deepEqual(unsubscribed, {
      a: true,
      b: true
    });

    assert.strictEqual(test("d"), "d:d:d");
    assert.deepEqual(unsubscribed, {
      a: true,
      b: true,
      c: true
    });
  });

  it("is not confused by fibers", function () {
    var Fiber = require("fibers");
    var order = [];
    var result1 = "one";
    var result2 = "two";

    var f1 = new Fiber(function () {
      order.push(1);

      var o1 = wrap(function () {
        Fiber.yield();
        return result1;
      });

      order.push(2);
      assert.strictEqual(o1(), "one");
      order.push(3);
      result1 += ":dirty";
      assert.strictEqual(o1(), "one");
      order.push(4);
      Fiber.yield();
      order.push(5);
      assert.strictEqual(o1(), "one");
      order.push(6);
      o1.dirty();
      order.push(7);
      assert.strictEqual(o1(), "one:dirty");
      order.push(8);
      assert.strictEqual(o2(), "two:dirty");
      order.push(9);
    });

    var result2 = "two"
    var o2 = wrap(function () {
      return result2;
    });

    order.push(0);

    f1.run();
    assert.deepEqual(order, [0, 1, 2]);

    // The primary goal of this test is to make sure this call to o2()
    // does not register a dirty-chain dependency for o1.
    assert.strictEqual(o2(), "two");

    f1.run();
    assert.deepEqual(order, [0, 1, 2, 3, 4]);

    // If the call to o2() captured o1() as a parent, then this o2.dirty()
    // call will report the o1() call dirty, which is not what we want.
    result2 += ":dirty";
    o2.dirty();

    f1.run();
    // The call to o1() between order.push(5) and order.push(6) should not
    // yield, because it should still be cached, because it should not be
    // dirty. However, the call to o1() between order.push(7) and
    // order.push(8) should yield, because we call o1.dirty() explicitly,
    // which is why this assertion stops at 7.
    assert.deepEqual(order, [0, 1, 2, 3, 4, 5, 6, 7]);

    f1.run();
    assert.deepEqual(order, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("marks evicted cache entries dirty", function () {
    var childSalt = "*";
    var child = wrap(function (x) {
      return x + childSalt;
    }, { max: 1 });

    var parentSalt = "^";
    var parent = wrap(function (x) {
      return child(x) + parentSalt;
    });

    assert.strictEqual(parent("asdf"), "asdf*^");

    childSalt = "&";
    parentSalt = "%";

    assert.strictEqual(parent("asdf"), "asdf*^");
    assert.strictEqual(child("zxcv"), "zxcv&");
    assert.strictEqual(parent("asdf"), "asdf&%");
  });

  it("handles children throwing exceptions", function () {
    var expected = new Error("oyez");

    var child = wrap(function () {
      throw expected;
    });

    var parent = wrap(function () {
      try {
        child();
      } catch (e) {
        return e;
      }
    });

    assert.strictEqual(parent(), expected);
    assert.strictEqual(parent(), expected);

    child.dirty();
    assert.strictEqual(parent(), expected);

    parent.dirty();
    assert.strictEqual(parent(), expected);
  });

  it("reports clean children to correct parents", function () {
    var childResult = "a";
    var child = wrap(function () {
      return childResult;
    });

    var parent = wrap(function (x) {
      return child() + x;
    });

    assert.strictEqual(parent(1), "a1");
    assert.strictEqual(parent(2), "a2");

    childResult = "b";
    child.dirty();

    // If this call to parent(1) mistakenly reports child() as clean to
    // parent(2), then the second assertion will fail by returning "a2".
    assert.strictEqual(parent(1), "b1");
    assert.strictEqual(parent(2), "b2");
  });

  it("supports object cache keys", function () {
    var counter = 0;
    var wrapped = wrap(function () {
      return counter++;
    });

    var a = {};
    var b = {};

    // Different combinations of distinct object references should
    // increment the counter.
    assert.strictEqual(wrapped(a, a), 0);
    assert.strictEqual(wrapped(a, b), 1);
    assert.strictEqual(wrapped(b, a), 2);
    assert.strictEqual(wrapped(b, b), 3);

    // But the same combinations of arguments should return the same
    // cached values when passed again.
    assert.strictEqual(wrapped(a, a), 0);
    assert.strictEqual(wrapped(a, b), 1);
    assert.strictEqual(wrapped(b, a), 2);
    assert.strictEqual(wrapped(b, b), 3);
  });

  it("detects problematic cycles", function () {
    var self = wrap(function () {
      return self() + 1;
    });

    var mutualA = wrap(function () {
      return mutualB() + 1;
    });

    var mutualB = wrap(function () {
      return mutualA() + 1;
    });

    function check(fn) {
      try {
        fn();
        throw new Error("should not get here");
      } catch (e) {
        assert.strictEqual(e.message, "already recomputing");
      }

      // Try dirtying the function, now that there's a cycle in the Entry
      // graph. This should succeed.
      fn.dirty();
    }

    check(self);
    check(mutualA);
    check(mutualB);

    var returnZero = true;
    var fn = wrap(function () {
      if (returnZero) {
        returnZero = false;
        return 0;
      }
      returnZero = true;
      return fn() + 1;
    });

    assert.strictEqual(fn(), 0);
    assert.strictEqual(returnZero, false);

    returnZero = true;
    assert.strictEqual(fn(), 0);
    assert.strictEqual(returnZero, true);

    fn.dirty();

    returnZero = false;
    check(fn);
  });
});

describe("least-recently-used cache", function () {
  var Cache = require("../lib/cache.js").Cache;

  it("can hold lots of elements", function () {
    var cache = new Cache;
    var count = 1000000;

    for (var i = 0; i < count; ++i) {
      cache.set(i, String(i));
    }

    assert.strictEqual(cache.map.size, count);
    assert(cache.has(0));
    assert(cache.has(count - 1));
    assert.strictEqual(cache.get(43), "43");
  });

  it("evicts excess old elements", function () {
    var max = 10;
    var evicted = [];
    var cache = new Cache({
      max: max,
      dispose(key, value) {
        assert.strictEqual(String(key), value);
        evicted.push(key);
      }
    });

    var count = 100;
    var keys = [];
    for (var i = 0; i < count; ++i) {
      cache.set(i, String(i));
      keys.push(i);
    }

    assert.strictEqual(cache.map.size, max);
    assert.strictEqual(evicted.length, count - max);

    for (var i = count - max; i < count; ++i) {
      assert(cache.has(i));
    }
  });

  it("can cope with small max values", function () {
    var cache = new Cache({ max: 2 });

    function check() {
      var sequence = Array.prototype.slice.call(arguments);
      var entry = cache.newest;
      var forwards = [];
      while (entry) {
        forwards.push(entry.key);
        entry = entry.older;
      }
      assert.deepEqual(forwards, sequence);

      var backwards = [];
      entry = cache.oldest;
      while (entry) {
        backwards.push(entry.key);
        entry = entry.newer;
      }
      backwards.reverse();
      assert.deepEqual(backwards, sequence);

      sequence.forEach(function (n) {
        assert.strictEqual(cache.map.get(n).value, n + 1);
      });

      if (sequence.length > 0) {
        assert.strictEqual(cache.newest.key, sequence[0]);
        assert.strictEqual(cache.oldest.key,
                           sequence[sequence.length - 1]);
      }
    }

    cache.set(1, 2);
    check(1);

    cache.set(2, 3);
    check(2, 1);

    cache.set(3, 4);
    check(3, 2);

    cache.get(2);
    check(2, 3);

    cache.set(4, 5);
    check(4, 2);

    assert.strictEqual(cache.has(1), false);
    assert.strictEqual(cache.get(2), 3);
    assert.strictEqual(cache.has(3), false);
    assert.strictEqual(cache.get(4), 5);

    cache.delete(2);
    check(4);
    cache.delete(4);
    check();

    assert.strictEqual(cache.newest, null);
    assert.strictEqual(cache.oldest, null);
  });
});
