import { DeepChecker } from "./checker";

export type DeepEqualsHelper = DeepChecker["check"];

export const deepEquals =
  Symbol.for("@wry/equality:deepEquals");

export interface Equatable<T = any> {
  [deepEquals](that: T, helper: DeepChecker["check"]): boolean;
}

export function isEquatable(obj: any): obj is Equatable {
  return (
    isNonNullObject(obj) &&
    // Using `in` instead of `hasOwn` because the method could be inherited from
    // the prototype chain.
    deepEquals in obj
  );
}

export const fnToStr = Function.prototype.toString;

export const {
  getPrototypeOf,
  prototype: {
    toString: objToStr,
    hasOwnProperty: hasOwn,
  },
} = Object;

export function isNonNullObject(obj: any): obj is Record<string, any> {
  return obj !== null && typeof obj === "object";
}

export function isPlainObject(obj: any): obj is Record<string, any> {
  if (isNonNullObject(obj)) {
    const proto = getPrototypeOf(obj);
    return proto === null || proto === Object.prototype;
  }
  return false;
}

export function definedKeys<TObject extends Record<string, any>>(obj: TObject) {
  const keys = Object.keys(obj);
  const { length } = keys;
  let definedCount = 0;
  for (let k = 0; k < length; ++k) {
    const key = keys[k];
    if (obj[key] !== void 0) {
      keys[definedCount++] = key;
    }
  }
  keys.length = definedCount;
  return keys;
}

const nativeCodeSuffix = "{ [native code] }";

export function isNativeCode(code: string): boolean {
  return endsWith(code, nativeCodeSuffix);
}

export function endsWith(full: string, suffix: string) {
  const fromIndex = full.length - suffix.length;
  return fromIndex >= 0 &&
    full.indexOf(suffix, fromIndex) === fromIndex;
}
