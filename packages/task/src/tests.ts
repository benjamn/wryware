import assert from "assert";
import { Task, bindHistory } from "./task";

describe("Task", function () {
  it("should be importable", function () {
    assert.strictEqual(typeof Task, "function");
  });

  it("tracks history correctly", function () {
    let parentTask: Task<any>;
    return new Task(task => {
      parentTask = task;
      task.resolve(123);
    }).then(oneTwoThree => new Task(child => {
      assert.strictEqual(child.history.parent, parentTask.history);
      setTimeout(bindHistory(() => {
        child.resolve(new Task(grandchild => {
          assert.strictEqual(grandchild.history.parent, child.history);
          assert.strictEqual(grandchild.history.parent!.parent, parentTask.history);
          grandchild.resolve(oneTwoThree);
        }));
      }), 10);
    })).then(result => {
      assert.strictEqual(result, 123);
    });
  });
});
