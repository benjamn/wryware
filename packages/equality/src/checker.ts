import {
  definedKeys,
  fnToStr,
  hasOwn,
  isNativeCode,
  isNonNullObject,
  isPlainObject,
  objToStr,
} from "./helpers";

export interface Equatable<T = any> {
  equals(that: T, helper: DeepChecker["check"]): boolean;
}

export class DeepChecker {
  private comparisons: Map<object, Set<object>> | undefined;
  private boundCheck: DeepChecker["check"] = (a, b) => this.check(a, b);

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

    switch (aTag) {
      case '[object Array]':
        return this.checkArrays(a, b);

      case '[object Object]':
        return this.checkObjects(a, b);

      case '[object Error]':
        return a.name === b.name && a.message === b.message;

      case '[object Number]':
        // Handle NaN, which is !== itself.
        if (a !== a) return b !== b;
        // Fall through to shared +a === +b case...
      case '[object Boolean]':
      case '[object Date]':
        return +a === +b;

      case '[object RegExp]':
      case '[object String]':
        return a == `${b}`;

      case '[object Map]':
      case '[object Set]':
        return this.checkMapsOrSets(a, b, aTag);

      case '[object Uint16Array]':
      case '[object Uint8Array]': // Buffer, in Node.js.
      case '[object Uint32Array]':
      case '[object Int32Array]':
      case '[object Int8Array]':
      case '[object Int16Array]':
      case '[object ArrayBuffer]':
        return this.checkBytes(
          // DataView doesn't need these conversions, but the equality check is
          // otherwise the same.
          new Uint8Array(a),
          new Uint8Array(b),
        );

      case '[object DataView]':
        return this.checkBytes(a, b);

      case '[object AsyncFunction]':
      case '[object GeneratorFunction]':
      case '[object AsyncGeneratorFunction]':
      case '[object Function]':
        return this.checkFunctions(a, b);
    }

    if (isNonNullObject(a) && isNonNullObject(b)) {
      return this.tryEqualsMethod(a, b);
    }

    // Otherwise the values are not equal.
    return false;
  }

  private checkArrays(a: any[], b: any[]): boolean {
    return this.previouslyCompared(a, b) || (
      a.length === b.length &&
      a.every((child, i) => this.check(child, b[i]))
    );
  }

  private checkObjects(a: any, b: any): boolean {
    if (!isPlainObject(a) ||
        !isPlainObject(b)) {
      return this.tryEqualsMethod(a, b);
    }

    if (this.previouslyCompared(a, b)) return true;

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
      if (!this.check(a[key], b[key])) {
        return false;
      }
    }

    return true;
  }

  private checkMapsOrSets(a: any, b: any, tag: string): boolean {
    if (a.size !== b.size) return false;
    if (this.previouslyCompared(a, b)) return true;

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
      if (isMap && !this.check(aValue, b.get(aKey))) {
        return false;
      }
    }

    return true;
  }

  private checkBytes(a: Uint8Array, b: Uint8Array): boolean {
    let len = a.byteLength;
    if (len === b.byteLength) {
      while (len-- && a[len] === b[len]) {
        // Keep looping as long as the bytes are equal.
      }
    }
    return len === -1;
  }

  private checkFunctions(a: any, b: any): boolean  {
    const aCode = fnToStr.call(a);
    if (aCode !== fnToStr.call(b)) {
      return false;
    }

    // We consider non-native functions equal if they have the same code
    // (native functions require === because their code is censored). Note
    // that this behavior is not entirely sound, since !== function objects
    // with the same code can behave differently depending on their closure
    // scope. However, any function can behave differently depending on the
    // values of its input arguments (including this) and its calling
    // context (including its closure scope), even though the function
    // object is === to itself; and it is entirely possible for functions
    // that are not === to behave exactly the same under all conceivable
    // circumstances. Because none of these factors are statically decidable
    // in JavaScript, JS function equality is not well-defined. This
    // ambiguity allows us to consider the best possible heuristic among
    // various imperfect options, and equating non-native functions that
    // have the same code has enormous practical benefits, such as when
    // comparing functions that are repeatedly passed as fresh function
    // expressions within objects that are otherwise deeply equal. Since any
    // function created from the same syntactic expression (in the same code
    // location) will always stringify to the same code according to
    // fnToStr.call, we can reasonably expect these repeatedly passed
    // function expressions to have the same code, and thus behave "the
    // same" (with all the caveats mentioned above), even though the runtime
    // function objects are !== to one another.
    return !isNativeCode(aCode);
  }

  private previouslyCompared(a: any, b: any): boolean {
    this.comparisons = this.comparisons || new Map;
    // Though cyclic references can make an object graph appear infinite from
    // the perspective of a depth-first traversal, the graph still contains a
    // finite number of distinct object references. We use the cache to avoid
    // comparing the same pair of object references more than once, which
    // guarantees termination (even if we end up comparing every object in one
    // graph to every object in the other graph, which is extremely unlikely),
    // while still allowing weird isomorphic structures (like rings with
    // different lengths) a chance to pass the equality test.
    let bSet = this.comparisons.get(a);
    if (bSet) {
      // Return true here because we can be sure false will be returned
      // somewhere else if the objects are not equivalent.
      if (bSet.has(b)) return true;
    } else {
      this.comparisons.set(a, bSet = new Set);
    }
    bSet.add(b);
    return false;
  }

  private isEquatable(obj: any): obj is Equatable {
    return (
      isNonNullObject(obj) &&
      typeof obj.equals === "function" &&
      // Verify reflexivity. This should be cheap as long as obj.equals(obj)
      // checks obj === obj first.
      obj.equals(obj, this.boundCheck)
    );
  }

  private tryEqualsMethod(a: any, b: any): boolean {
    return (
      this.isEquatable(a) &&
      this.isEquatable(b) &&
      a.equals(b, this.boundCheck) &&
      // Verify symmetry. If a.equals is not exactly the same function as
      // b.equals, b.equals(a) can legitimately disagree with a.equals(b), so we
      // must check both. When a.equals === b.equals, the additional check should
      // be redundant, unless that .equals method is somehow asymmetric.
      (a.equals === b.equals || b.equals(a, this.boundCheck))
    );
  }
}
