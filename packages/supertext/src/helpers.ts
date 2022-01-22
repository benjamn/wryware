export const MISSING: unique symbol = Symbol();

export const {
  isArray,
  prototype: {
    slice,
  },
} = Array

export const {
  assign,
  freeze,
  defineProperty,
} = Object;

export type AnyFunction = (this: any, ...args: any[]) => any;

// Get an array of unique elements, preserving the order of the *final*
// appearance of each element in the original array. For example, [a, b, a]
// becomes [b, a], and [a, b, c, b, b, a] becomes [c, b, a]. Notice this is not
// the same order as the elements in the set, because the Set constructor
// prefers the *first* appearance of each element. However, the set is still
// useful for populating the parents array in the desired order.
export function deduplicateArrayPreferringRightmost<T>(
  array: T[] | IArguments,
): T[] {
  const { length } = array;
  const set = new Set<T>(array);
  // If the array has no duplicates, return a cheap copy.
  if (set.size === length) return slice.call(array);
  const result = new Array<T>(set.size);
  let nextResultIndex = set.size - 1;
  for (let i = length - 1; i >= 0; --i) {
    const value = array[i];
    if (set.has(value)) {
      set.delete(value);
      if (nextResultIndex >= 0) {
        result[nextResultIndex--] = value;
      } else break;
    }
  }
  return result;
}

const safeWeakMapMethods = {
  has: WeakMap.prototype.has,
  get: WeakMap.prototype.get,
  set: WeakMap.prototype.set,
  delete: WeakMap.prototype.delete,
  getDefault(this: WeakMap<object, any>, key: object, defaultValue: any) {
    return this.has(key) ? this.get(key) : defaultValue;
  },
};

export interface SafeWeakMap<TKey extends object, TValue>
extends WeakMap<TKey, TValue> {
  getDefault(key: TKey, defaultValue: TValue): TValue;
}

// These WeakMap objects are "safe" in the sense that messing with
// WeakMap.prototype cannot interfere with the behavior of Supertext maps,
// because all available methods (has, get, set, delete, getDefault) are hosted
// directly on the frozen map object, not inherited from WeakMap.prototype.
export function makeSafeWeakMap<
  TKey extends object,
  TValue,
>(): SafeWeakMap<TKey, TValue> {
  return freeze(assign(new WeakMap, safeWeakMapMethods));
}
