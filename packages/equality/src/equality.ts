const { toString, hasOwnProperty } = Object.prototype;

class Checker {
  private aStack: any[] = [];
  private bStack: any[] = [];

  public reset() {
    this.aStack.length = 0;
    this.bStack.length = 0;
    return this;
  }

  public check(a: any, b: any): boolean {
    // If the two values are strictly equal, our job is easy.
    if (a === b) {
      return true;
    }

    // Object.prototype.toString returns a representation of the runtime type of
    // the given value that is considerably more precise than typeof.
    const aTag = toString.call(a);
    const bTag = toString.call(b);

    // If the runtime types of a and b are different, they could maybe be equal
    // under some interpretation of equality, but for simplicity and performance
    // we just return false instead.
    if (aTag !== bTag) {
      return false;
    }

    switch (aTag) {
      case '[object Array]':
        // Arrays are a lot like other objects, but we can cheaply compare their
        // lengths as a short-cut before comparing their elements.
        if (a.length !== b.length) {
          return false;
        }
        // Fall through to object case...
      case '[object Object]':
        return this.withCycleGuard(a, b, this.checkObject);

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
      case '[object Set]': {
        if (a.size !== b.size) return false;
        return this.withCycleGuard(a, b, this.checkMapOrSet);
      }
    }

    // Otherwise the values are not equal.
    return false;
  }

  private withCycleGuard<A, B>(
    a: A,
    b: B,
    callback: (this: Checker, a: A, b: B) => boolean,
  ): boolean {
    // Although we may detect cycles at different depths along the same
    // path, once the first object enters a cycle of length N, every nested
    // child of that object will also be identical to its Nth ancestor, so
    // we can safely keep recursing until the other object enters a cycle of
    // length M. If the other object does not have a cycle in this subtree,
    // the recursion will terminate normally, and equal(a, b) will return
    // false. If the other object has a cycle, and N === M, we consider the
    // cycles equivalent. If N !== M, there's a chance the cycles are
    // somehow isomorphic, but as a matter of policy we say they are not the
    // same because their structures are, in fact, different.
    const aIndex = this.aStack.lastIndexOf(a);
    if (aIndex >= 0) {
      const bIndex = this.bStack.lastIndexOf(b);
      if (bIndex >= 0) {
        return aIndex === bIndex;
      }
    }

    this.aStack.push(a);
    this.bStack.push(b);

    try {
      return callback.call(this, a, b);
    } finally {
      this.aStack.pop();
      this.bStack.pop();
    }
  }

  private checkObject<T extends { [key: string]: any }>(a: T, b: T) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    return (
      // If `a` and `b` have a different number of enumerable keys, they
      // must be different.
      aKeys.length === bKeys.length &&
      // Now make sure they have the same keys.
      bKeys.every(key => hasOwnProperty.call(a, key)) &&
      // Finally, check deep equality of all child properties.
      aKeys.every(key => this.check(a[key], b[key]))
    );
  }

  private checkMapOrSet<T extends Set<any> | Map<any, any>>(a: T, b: T) {
    const aIterator = a.entries();

    while (true) {
      const info = aIterator.next();
      if (info.done) break;

      // If a instanceof Set, aValue === aKey.
      const [aKey, aValue] = info.value;

      // So this works the same way for both Set and Map.
      if (!b.has(aKey)) {
        return false;
      }

      if (
        // However, we care about deep equality of values only when dealing
        // with Map structures.
        b instanceof Map &&
        !this.check(aValue, b.get(aKey))
      ) {
        return false;
      }
    }

    return true;
  }
}

const checker = new Checker();

/**
 * Performs a deep equality check on two JavaScript values, tolerating cycles.
 */
export function equal(a: any, b: any): boolean {
  return checker.reset().check(a, b);
}

// Allow default imports as well.
export default equal;
