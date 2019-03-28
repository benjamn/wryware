import assert from "assert";
import { Task, setTimeout } from "./task";

describe("Task", function () {
  it("should be importable", function () {
    assert.strictEqual(typeof Task, "function");
  });

  it("tracks context correctly", function () {
    let parentTask: Task<any>;
    return new Task(task => {
      parentTask = task;
      task.resolve(123);
    }).then(oneTwoThree => new Task(child => {
      assert.strictEqual(child.context.parent, parentTask.context);
      setTimeout(() => {
        child.resolve(new Task(grandchild => {
          assert.strictEqual(grandchild.context.parent, child.context);
          assert.strictEqual(grandchild.context.parent!.parent, parentTask.context);
          grandchild.resolve(oneTwoThree);
        }));
      }, 10);
    })).then(result => {
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
