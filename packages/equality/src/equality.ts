import { DeepChecker } from "./checker";

/**
 * Performs a deep equality check on two JavaScript values, tolerating cycles.
 */
export function equal(a: any, b: any): boolean {
  if (a === b) return true;
  const checker = DeepChecker.acquire();
  try {
    return checker.check(a, b);
  } finally {
    checker.release();
  }
}

// Allow default imports as well.
export default equal;
