export const arrayForEach = Array.prototype.forEach;

export const {
  prototype: {
    hasOwnProperty,
    toString: objectToString,
  },
} = Object;

// If no makeData function is supplied, the looked-up data will be an empty,
// null-prototype Object.
export function defaultMakeData(): any {
  return Object.create(null);
}

export function isObjRef(value: any): value is object {
  if (value) {
    switch (typeof value) {
      case "object":
      case "function":
        return true;
    }
  }
  return false;
}

const SET_TO_STRING_TAG = objectToString.call(new Set);

export function assertSet(set: any): asserts set is Set<any> {
  const toStringTag = objectToString.call(set);
  if (toStringTag !== SET_TO_STRING_TAG) {
    throw new TypeError(`Not a Set: ${toStringTag}`);
  }
}

const KNOWN: unique symbol = Symbol("KeySetMap.KNOWN");

export function makeKnownWeakRef<T extends object>(key: T): WeakRef<T> {
  return Object.assign(new WeakRef(key), { [KNOWN]: true });
}

export function isKnownWeakRef(ref: unknown): ref is WeakRef<object> {
  return (
    ref instanceof WeakRef &&
    KNOWN in ref &&
    ref[KNOWN] === true
  );
}
