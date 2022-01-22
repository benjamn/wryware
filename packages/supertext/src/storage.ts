import type { Supertext } from "./supertext";

interface SupertextStorage {
  getCurrentSupertext: () => Supertext | undefined;
  runWithSupertext: <TCb extends () => any>(
    supertext: Supertext,
    callback: TCb,
  ) => ReturnType<TCb>;
}

export function makeSupertextStorage(): SupertextStorage {
  // As soon as AsyncContext becomes available, we can upgrade to using it here.
  // @ts-ignore
  if (typeof AsyncContext === "function") {
    // @ts-ignore
    const context = new AsyncContext<Supertext>();
    return {
      getCurrentSupertext() {
        return context.get();
      },
      runWithSupertext(supertext, callback) {
        return context.run(supertext, callback);
      },
    };
  }

  // This stack should be persisted or snapshotted somehow across asynchronous
  // jobs in order to support native async/await and idiomatic Promise usage
  // (that is, .then(cb, eb) chaining without extra callback wrapping). If this
  // property is satisfied, then the rest of the Supertext implementation should
  // work seamlessly with all kinds of asynchronous (and synchronous) code.
  const currentSupertextStack: Supertext[] = [];
  return {
    getCurrentSupertext() {
      return currentSupertextStack[currentSupertextStack.length - 1];
    },
    runWithSupertext(supertext, callback) {
      const stackIndex = currentSupertextStack.length;
      try {
        currentSupertextStack[stackIndex] = supertext;
        return callback();
      } finally {
        const popped = currentSupertextStack[stackIndex];
        currentSupertextStack.length = stackIndex;
        if (popped !== supertext) {
          throw new Error("Corrupted Supertext stack");
        }
      }
    }
  };
}