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
});
