import assert from "assert";
import { Supertext } from "./supertext.js";
import { MergeSubtext, Subtext } from "./subtext.js";

describe("subtext", function () {
  it("should be importable", () => {
    assert.strictEqual(typeof Supertext, "function");
    assert.strictEqual(typeof Subtext, "function");
  });

  it("should support multiple branching", () => {
    const sNum = new Subtext(1);
    const sBool = new Subtext(true);
    const sStr = new Subtext("asdf");

    function checkDefaults() {
      assert.strictEqual(sNum.get(), 1);
      assert.strictEqual(sBool.get(), true);
      assert.strictEqual(sStr.get(), "asdf");
    }

    const supertext = Supertext.EMPTY.branch(
      sNum, 2,
      sBool, false,
      sStr, "qwer"
    );

    checkDefaults();

    supertext.run(() => {
      assert.strictEqual(sNum.get(), 2);
      assert.strictEqual(sBool.get(), false);
      assert.strictEqual(sStr.get(), "qwer");
    });

    checkDefaults();

    assert.strictEqual(supertext.read(sNum), 2);
    assert.strictEqual(supertext.read(sBool), false);
    assert.strictEqual(supertext.read(sStr), "qwer");

    assert.strictEqual(supertext.branch(sNum, 3).read(sNum), 3);
    assert.strictEqual(supertext.read(sNum), 2);

    assert.strictEqual(Supertext.EMPTY.read(sNum), 1);
    assert.strictEqual(Supertext.EMPTY.read(sBool), true);
    assert.strictEqual(Supertext.EMPTY.read(sStr), "asdf");
  });

  it("should merge !== Subtext values along divergent branches", () => {
    const sNum = new Subtext(1);
    const sBool = new Subtext(true);
    const sStr = new MergeSubtext("asdf", (older, newer) => older + "." + newer);

    const supertext1 = Supertext.EMPTY.branch(
      sNum, 2,
      sBool, false,
      sStr, "qwer"
    );

    const supertext2 = Supertext.EMPTY.branch(
      sNum, 3,
      sBool, true,
      sStr, "zxcv"
    );

    assert.strictEqual(supertext1.read(sStr), "qwer");
    assert.strictEqual(supertext2.read(sStr), "zxcv");

    const supertext3 = supertext1.merge(supertext2);
    assert.strictEqual(supertext3.read(sStr), "qwer.zxcv");
  });
});
