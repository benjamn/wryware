import { Component } from "./components";

export interface Info {
  order: number;
  // Set of all objects the same strongly connected component.
  component: Component;
  known?: object;
}

export interface Node {
  traceArray?: any[];
  traceObject?: object;
  known?: object;
}

export const {
  toString: objToStr,
} = Object.prototype;

export function last<T>(array: ArrayLike<T>): T {
  return array[array.length - 1];
}

export function isObjectOrArray(value: any): value is object {
  return value && typeof value === "object";
}

const numRefs: Number[] = [];
export function numRef(n: number): Number {
  return numRefs[n] || (numRefs[n] = new Number(n));
}

export function shallowClone<T extends object>(object: T): T {
  switch (objToStr.call(object)) {
    case "[object Array]":
      return (object as any[]).slice(0) as T;
    case "[object Object]":
      return Object.assign(
        Object.create(Object.getPrototypeOf(object)),
        object,
      );
  }
  return object;
}
