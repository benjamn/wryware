import assert from "assert";
import { Task } from "./task";
import { Slot, setTimeout } from "@wry/context";

describe("Task", function () {
  it("should be importable", function () {
    assert.strictEqual(typeof Task, "function");
  });

  it("supports .then as well as .catch", function () {
    return new Task<string>(task => {
      setTimeout(() => task.resolve("oyez"), 10);
    }).then(result => {
      assert.strictEqual(result, "oyez");
      throw "catch me if you can";
    }).catch(reason => {
      assert.strictEqual(reason, "catch me if you can");
    });
  });

  it("supports Task.resolve and Task.reject", function () {
    const resolved = Task.resolve(Promise.resolve(1234));
    assert.ok(resolved instanceof Task);

    const rejected = Task.reject(new Error("oyez"));
    assert.ok(rejected instanceof Task);

    return resolved.then(result => {
      assert.strictEqual(result, 1234);
      return rejected;
    }).then(() => {
      throw new Error("not reached");
    }, error => {
      assert.strictEqual(error.message, "oyez");
    });
  });

  it("works with @wry/context", function () {
    const nameSlot = new Slot<string>();
    function withName<T = any>(name: string, exec: (task: Task<T>) => void) {
      return new Task<T>(task => nameSlot.withValue(name, () => exec(task)));
    }

    return withName("parent", task => {
      assert.strictEqual(nameSlot.getValue(), "parent");
      task.resolve(123);
    }).then(oneTwoThree => withName("child", child => {
      assert.strictEqual(nameSlot.getValue(), "child");

      const sibling = withName("sibling", task => {
        task.resolve(nameSlot.getValue());
      }).then(result => {
        assert.strictEqual(result, "sibling");
        assert.strictEqual(nameSlot.getValue(), "child");
      });

      setTimeout(() => {
        assert.strictEqual(nameSlot.getValue(), "child");
        child.resolve(withName("grandchild", grandchild => {
          assert.strictEqual(nameSlot.getValue(), "grandchild");
          sibling.then(() => {
            assert.strictEqual(nameSlot.getValue(), "grandchild");
            grandchild.resolve(oneTwoThree);
          }, grandchild.reject);
        }));
      }, 10);

    })).then(result => {
      assert.strictEqual(nameSlot.hasValue(), false);
      assert.strictEqual(result, 123);
    });
  });

  it("works with Promise.all", function () {
    return Promise.all([
      Task.VOID,
      new Task<number>(task => setTimeout(() => task.resolve(123), 10)),
      new Task<string>(task => task.resolve("oyez")),
      "not a task",
    ]).then(([a, b, c, d]) => {
      assert.strictEqual(a, void 0);
      assert.strictEqual(b * 2, 123 * 2);
      assert.strictEqual(c.slice(0, 2), "oy");
      assert.strictEqual(d, "not a task");
    })
  });

  it("should deliver synchronous results consistently", function () {
    const syncTask = new Task(task => {
      return Task.resolve("oyez").then(result => {
        task.resolve(result.toUpperCase());
      });
    });

    let delivered = false;
    syncTask.then(result => {
      assert.strictEqual(result, "OYEZ");
      assert.strictEqual(delivered, false);
      delivered = true;
    });
    assert.strictEqual(delivered, true);

    const promise = syncTask.toPromise();

    let deliveredAgain = false;
    syncTask.then(result => {
      assert.strictEqual(result, "OYEZ");
      assert.strictEqual(deliveredAgain, false);
      deliveredAgain = true;
    });
    assert.strictEqual(deliveredAgain, true);

    return promise.then(result => {
      assert.strictEqual(result, "OYEZ");
    });
  });

  it("should deliver asynchronous results consistently", function () {
    let delivered = false;
    const asyncTask = new Task<number>(task => {
      Promise.resolve(1234).then(result => {
        task.resolve(result);
      });
    }).then(result => {
      assert.strictEqual(result, 1234);
      assert.strictEqual(delivered, false);
      delivered = true;
      return result + 1111;
    });
    assert.strictEqual(delivered, false);

    return asyncTask.then(() => {
      let deliveredAgain = false;
      const task2 = asyncTask.then(result => {
        assert.strictEqual(result, 2345);
        assert.strictEqual(deliveredAgain, false);
        deliveredAgain = true;
        return result + 1111;
      });
      assert.strictEqual(deliveredAgain, false);

      return task2.then(result => {
        assert.strictEqual(deliveredAgain, true);
        assert.strictEqual(result, 3456);
      });
    });
  });

  it("task.toPromise() always returns the same promise", function () {
    const syncTask = Task.resolve("whatever");
    const promise1 = syncTask.toPromise();

    const asyncTask = Task.resolve(Promise.resolve("whenever"));
    const promise2 = asyncTask.toPromise();

    return promise1.then(() => {
      return promise2.then(() => {
        assert.strictEqual(promise1, syncTask.toPromise());
        assert.strictEqual(promise2, asyncTask.toPromise());
      });
    });
  });
});
