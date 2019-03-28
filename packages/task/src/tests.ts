import assert from "assert";
import { Task } from "./task";

describe("Task", function () {
  it("should be importable", function () {
    assert.strictEqual(typeof Task, "function");
  });
});
