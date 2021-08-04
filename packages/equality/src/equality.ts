import { DeepChecker } from "./checker";

/**
 * Performs a deep equality check on two JavaScript values, tolerating cycles.
 */
export function equal(a: any, b: any): boolean {
  return new DeepChecker().check(a, b);
}

// Allow default imports as well.
export default equal;
