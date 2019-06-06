const { toString, hasOwnProperty } = Object.prototype;

/**
 * Performs a deep equality check on two JavaScript values, tolerating cycles.
 */
export function equal(a: any, b: any): boolean {
  // Emptying aStack and bStack should never really be necessary, since pushing
  // and popping is always balanced in withCycleGuard, but it never hurts to
  // make absolutely sure.
  aStack.length = bStack.length = 0;
  return check(a, b);
}

// Allow default imports as well.
export default equal;

// These stacks are used to detect cyclic references while traversing objects.
// They can be declared here because they always end up empty again after the
// traversal is complete (even if an exception was thrown).
const aStack: any[] = [];
const bStack: any[] = [];

function check(a: any, b: any): boolean {
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
      if (a.length !== b.length) return false;
      // Fall through to object case...
    case '[object Object]':
      return withCycleGuard(a, b, checkObject);

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
      return withCycleGuard(a, b, checkMapOrSet);
    }
  }

  // Otherwise the values are not equal.
  return false;
}

function withCycleGuard<A, B>(
  a: A,
  b: B,
  callback: (a: A, b: B) => boolean,
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
  const aIndex = aStack.lastIndexOf(a);
  if (aIndex >= 0) {
    const bIndex = bStack.lastIndexOf(b);
    if (bIndex >= 0) {
      return aIndex === bIndex;
    }
  }

  aStack.push(a);
  bStack.push(b);

  try {
    return callback(a, b);
  } finally {
    aStack.pop();
    bStack.pop();
  }
}

function checkObject<T extends { [key: string]: any }>(a: T, b: T) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);

  // If `a` and `b` have a different number of enumerable keys, they
  // must be different.
  const keyCount = aKeys.length;
  if (keyCount !== bKeys.length) return false;

  // Now make sure they have the same keys.
  for (let k = 0; k < keyCount; ++k) {
    if (!hasOwnProperty.call(b, aKeys[k])) {
      return false;
    }
  }

  // Finally, check deep equality of all child properties.
  for (let k = 0; k < keyCount; ++k) {
    const key = aKeys[k];
    if (!check(a[key], b[key])) {
      return false;
    }
  }

  return true;
}

function checkMapOrSet<T extends Set<any> | Map<any, any>>(a: T, b: T) {
  const aIterator = a.entries();
  const isMap = b instanceof Map;

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
    if (isMap && !check(aValue, (b as Map<any, any>).get(aKey))) {
      return false;
    }
  }

  return true;
}
