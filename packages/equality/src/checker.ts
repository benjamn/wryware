import { Trie } from "@wry/trie";

import {
  definedKeys,
  fnToStr,
  hasOwn,
  isEquatable,
  isNativeCode,
  isNonNullObject,
  isPlainObject,
  objToStr,
  deepEqualsMethod,
  DeepEqualsHelper,
} from "./helpers";

type Checker<T> = (
  checker: DeepChecker,
  a: T,
  b: T,
  tag: string,
) => boolean;

const CHECKERS_BY_TAG = new Map<string, Checker<any>>()
  .set('[object Array]', checkArrays)
  .set('[object Object]', checkObjects)
  .set('[object Error]', checkErrors)

  .set('[object Number]', checkNumbers)
  .set('[object Boolean]', checkNumbers)
  .set('[object Date]', checkNumbers)

  .set('[object RegExp]', checkStringsOrRegExps)
  .set('[object String]', checkStringsOrRegExps)

  .set('[object Map]', checkMapsOrSets)
  .set('[object Set]', checkMapsOrSets)

  .set('[object Uint16Array]', checkArrayBuffers)
  .set('[object Uint8Array]', checkArrayBuffers)
  .set('[object Uint32Array]', checkArrayBuffers)
  .set('[object Int32Array]', checkArrayBuffers)
  .set('[object Int8Array]', checkArrayBuffers)
  .set('[object Int16Array]', checkArrayBuffers)
  .set('[object ArrayBuffer]', checkArrayBuffers)
  // DataView doesn't need the checkArrayBuffers conversions, but the equality
  // check is otherwise the same.
  .set('[object DataView]', checkBytes)

  .set('[object AsyncFunction]', checkFunctions)
  .set('[object GeneratorFunction]', checkFunctions)
  .set('[object AsyncGeneratorFunction]', checkFunctions)
  .set('[object Function]', checkFunctions);

type ComparisonTrie = Trie<{
  equal?: boolean;
}>;

// Initializing checker.comparisons and checker.boundCheck as proper members of
// the DeepChecker class makes creating DeepChecker objects considerably more
// expensive in some environments, even if we initialize them to null and then
// upgrade them lazily, when needed. Instead, we store these two items of state
// in a separate Map, which gets cleaned up in the DeepChecker#release method.
const privateStateMap = new Map<DeepChecker, {
  comparisons?: ComparisonTrie;
  boundCheck?: DeepEqualsHelper;
}>();

function getPrivateState(checker: DeepChecker) {
  let state = privateStateMap.get(checker)!;
  if (!state) privateStateMap.set(checker, state = Object.create(null));
  return state;
}

function getComparisons(checker: DeepChecker): ComparisonTrie {
  const state = getPrivateState(checker);
  return state.comparisons || (state.comparisons = new Trie(false));
}

function getBoundCheck(checker: DeepChecker): DeepEqualsHelper {
  const state = getPrivateState(checker);
  return state.boundCheck || (
    state.boundCheck = (a, b) => checker.check(a, b)
  );
}

const checkerPool: DeepChecker[] = [];
const CHECKER_POOL_TARGET_SIZE = 5;

export class DeepChecker {
  // Use DeepChecker.acquire() instead of new DeepChecker.
  protected constructor() {}

  static acquire() {
    return checkerPool.pop() || new DeepChecker();
  }

  public release() {
    // If privateStateMap was a WeakMap, we wouldn't necessarily need to perform
    // this cleanup, but not all environments have a (performant) implementation
    // of WeakMap, and the cleanup is easy enough:
    privateStateMap.delete(this);

    if (checkerPool.length < CHECKER_POOL_TARGET_SIZE) {
      checkerPool.push(this);
    }
  }

  public check(a: any, b: any): boolean {
    // If the two values are strictly equal, our job is easy.
    if (a === b) {
      return true;
    }

    // Object.prototype.toString returns a representation of the runtime type of
    // the given value that is considerably more precise than typeof.
    const aTag = objToStr.call(a);
    const bTag = objToStr.call(b);

    // If the runtime types of a and b are different, they could maybe be equal
    // under some interpretation of equality, but for simplicity and performance
    // we just return false instead.
    if (aTag !== bTag) {
      return false;
    }

    const bothNonNullObjects =
      isNonNullObject(a) &&
      isNonNullObject(b);

    const found =
      bothNonNullObjects &&
      getComparisons(this).lookup(a, b);

    // Though cyclic references can make an object graph appear infinite from
    // the perspective of a depth-first traversal, the graph still contains a
    // finite number of distinct object references. We use this.comparisons as a
    // cache to avoid comparing the same pair of object references more than
    // once, which guarantees termination (even if we end up comparing every
    // object in one graph to every object in the other graph, which is
    // extremely unlikely), while still allowing weird isomorphic structures
    // (like rings with different lengths) a chance to pass the equality test.
    if (found) {
      if (typeof found.equal === "boolean") {
        return found.equal;
      }
      // Although we don't know the actual answer yet, we are about to find out,
      // so we can cheat by telling anyone else who asks that a equals b. This
      // provisional found.equal trick is important to prevent infinite cycle
      // traversals, but does not affect the final answer, since only one
      // traversal should be necessary to visit/examine all comparable parts of
      // the input objects and determine the correct result.
      found.equal = true;
    }

    const checker = CHECKERS_BY_TAG.get(aTag);

    const result: boolean =
      checker ? checker(this, a, b, aTag) :
      bothNonNullObjects ? tryEqualsMethod(this, a, b) :
      false;

    if (found) {
      found.equal = result;
    }

    return result;
  }
}

function tryEqualsMethod(checker: DeepChecker, a: any, b: any): boolean {
  return (
    isEquatable(checker, a) &&
    isEquatable(checker, b) &&
    a[deepEqualsMethod](b, getBoundCheck(checker)) &&
    // Verify symmetry. If a[deepEqualsMethod] is not exactly the same function
    // as b[deepEqualsMethod], b[deepEqualsMethod](a) can legitimately disagree
    // with a[deepEqualsMethod](b), so we must check both. However, in the
    // common case where a[deepEqualsMethod] === b[deepEqualsMethod], the
    // additional check should be redundant, unless that method is itself
    // somehow non-commutative/asymmetric.
    (a[deepEqualsMethod] === b[deepEqualsMethod] ||
     b[deepEqualsMethod](a, getBoundCheck(checker)))
  );
}

function checkArrays(checker: DeepChecker, a: any[], b: any[]): boolean {
  const aLen = a.length;
  if (aLen !== b.length) return false;

  for (let i = 0; i < aLen; ++i) {
    if (!checker.check(a[i], b[i])) {
      return false;
    }
  }

  return true;
}

function checkObjects(checker: DeepChecker, a: object, b: object): boolean {
  if (!isPlainObject(a) ||
      !isPlainObject(b)) {
    return tryEqualsMethod(checker, a, b);
  }

  const aKeys = definedKeys(a);
  const bKeys = definedKeys(b);

  // If `a` and `b` have a different number of enumerable keys, they
  // must be different.
  const keyCount = aKeys.length;
  if (keyCount !== bKeys.length) return false;

  // Now make sure they have the same keys.
  for (let k = 0; k < keyCount; ++k) {
    if (!hasOwn.call(b, aKeys[k])) {
      return false;
    }
  }

  // Finally, check deep equality of all child properties.
  for (let k = 0; k < keyCount; ++k) {
    const key = aKeys[k];
    if (!checker.check(a[key], b[key])) {
      return false;
    }
  }

  return true;
}

function checkErrors(_: DeepChecker, a: Error, b: Error): boolean {
  return a.name === b.name && a.message === b.message;
}

function checkNumbers(_: DeepChecker, a: number, b: number): boolean {
  return a !== a
    ? b !== b // Handle NaN, which is !== itself.
    : +a === +b;
}

function checkStringsOrRegExps<T extends string | RegExp>(
  _: DeepChecker,
  a: T,
  b: T,
): boolean {
  return a == `${b}`;
}

function checkMapsOrSets<T extends Map<any, any> | Set<any>>(
  checker: DeepChecker,
  a: T,
  b: T,
  tag: string,
): boolean {
  if (a.size !== b.size) return false;

  const aIterator = a.entries();
  const isMap = tag === '[object Map]';

  while (true) {
    const info = aIterator.next();
    if (info.done) break;

    // If a instanceof Set, aValue === aKey.
    const [aKey, aValue] = info.value;

    // So this works the same way for both Set and Map.
    if (!b.has(aKey)) {
      return false;
    }

    // However, we care about deep equality of values only when dealing
    // with Map structures.
    if (isMap && !checker.check(aValue, (b as Map<any, any>).get(aKey))) {
      return false;
    }
  }

  return true;
}

function checkArrayBuffers(checker: DeepChecker, a: ArrayBuffer, b: ArrayBuffer): boolean {
  return checkBytes(
    checker,
    new Uint8Array(a),
    new Uint8Array(b),
  );
}

function checkBytes(_: DeepChecker, a: Uint8Array, b: Uint8Array): boolean {
  let len = a.byteLength;
  if (len === b.byteLength) {
    while (len-- && a[len] === b[len]) {
      // Keep looping as long as the bytes are equal.
    }
  }
  return len === -1;
}

function checkFunctions(_: DeepChecker, a: any, b: any): boolean  {
  const aCode = fnToStr.call(a);
  if (aCode !== fnToStr.call(b)) {
    return false;
  }

  // We consider non-native functions equal if they have the same code (native
  // functions require === because their code is censored). Note that this
  // behavior is not entirely sound, since !== function objects with the same
  // code can behave differently depending on their closure scope. However, any
  // function can behave differently depending on the values of its input
  // arguments (including this) and its calling context (including its closure
  // scope), even though the function object is === to itself; and it is
  // entirely possible for functions that are not === to behave exactly the same
  // under all conceivable circumstances. Because none of these factors are
  // statically decidable in JavaScript, JS function equality is not
  // well-defined. This ambiguity allows us to consider the best possible
  // heuristic among various imperfect options, and equating non-native
  // functions that have the same code has enormous practical benefits, such as
  // when comparing functions that are repeatedly passed as fresh function
  // expressions within objects that are otherwise deeply equal. Since any
  // function created from the same syntactic expression (in the same code
  // location) will always stringify to the same code according to fnToStr.call,
  // we can reasonably expect these repeatedly passed function expressions to
  // have the same code, and thus behave "the same" (with all the caveats
  // mentioned above), even though the runtime function objects are !== to one
  // another.
  return !isNativeCode(aCode);
}
