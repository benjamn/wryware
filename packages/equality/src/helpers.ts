import { DeepChecker } from "./checker";

export type DeepEqualsHelper = DeepChecker["check"];

export interface Equatable<T = any> {
  deepEquals(that: T, helper: DeepChecker["check"]): boolean;
}

export function isEquatable(checker: DeepChecker, obj: any): obj is Equatable {
  return (
    isNonNullObject(obj) &&
    typeof obj.deepEquals === "function" &&
    // Verify reflexivity. This should be cheap as long as obj.deepEquals(obj)
    // checks obj === obj first.
    obj.deepEquals(obj, checker.boundCheck)
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

export function definedKeys<TObject extends object>(obj: TObject) {
  // Remember that the second argument to Array.prototype.filter will be
  // used as `this` within the callback function.
  return Object.keys(obj).filter(isDefinedKey, obj);
}
function isDefinedKey<TObject extends object>(
  this: TObject,
  key: keyof TObject,
) {
  return this[key] !== void 0;
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
