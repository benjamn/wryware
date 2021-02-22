export interface Info {
  order: number;
  handlers: import("./handlers").Handlers;
  children: any[];
  // Set of all objects the same strongly connected component.
  component: import("./components").Component;
  known?: object;
}

export const { getPrototypeOf } = Object;

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
