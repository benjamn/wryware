type Context = {
  parent: Context | null;
  slots: { [slotId: number]: any };
}

let currentContext: Context | null = null;

const slotIdMap = new WeakMap<Slot<any>, number>();
// Pull down the prototype methods that we use onto the slotIdMap instance
// so that they can't be tampered with by malicious code.
slotIdMap.set = slotIdMap.set;
slotIdMap.get = slotIdMap.get;
let nextSlotId = 1;

// This unique internal object is used to denote the absence of a value
// for a given Slot, and is never exposed to outside code.
const MISSING_VALUE: any = {};

// Returns the ID of the given slot if the slot has a value defined.
// Caches the result in currentContext.slots for faster future lookups.
function lookup(slot: Slot<any>): number | undefined {
  const slotId = slotIdMap.get(slot)!;
  for (let context = currentContext; context; context = context.parent) {
    // We use the Slot object iself as a key to its value, which means the
    // value cannot be obtained without a reference to the Slot object.
    if (slotId in context.slots) {
      const value = context.slots[slotId];
      if (value === MISSING_VALUE) break;
      if (context !== currentContext) {
        // Cache the value in currentContext.slots so the next lookup will
        // be faster. This caching is safe because the tree of contexts and
        // the values of the slots are logically immutable.
        currentContext!.slots[slotId] = value;
      }
      return slotId;
    }
  }
  if (currentContext) {
    // If a value was not found for this Slot, it's never going to be found
    // no matter how many times we look it up, so we might as well cache
    // the absence of the value, too.
    currentContext.slots[slotId] = MISSING_VALUE;
  }
}

export class Slot<TValue> {
  constructor() {
    slotIdMap.set(this, nextSlotId++);
  }

  public hasValue = (): boolean => !!lookup(this);

  public getValue = (): TValue | undefined => {
    const slotId = lookup(this);
    if (slotId) {
      return currentContext!.slots[slotId] as TValue;
    }
  }

  public withValue = <TResult>(
    value: TValue,
    callback: () => TResult,
  ): TResult => {
    const slots = {
      __proto__: null,
      [slotIdMap.get(this)!]: value,
    };
    currentContext = { parent: currentContext, slots };
    try {
      return callback();
    } finally {
      currentContext = currentContext.parent;
    }
  }
}

const boundBrand: unique symbol = Symbol();

// Capture the current context and wrap a callback function so that it
// reestablishes the captured context when called.
export function bind<TArgs extends any[], TResult>(
  callback: (...args: TArgs) => TResult,
) {
  if ((callback as any)[boundBrand] === bind) {
    return callback;
  }
  const context = currentContext;
  const bound = function (this: any) {
    const saved = currentContext;
    try {
      currentContext = context;
      return callback.apply(this, arguments as any);
    } finally {
      currentContext = saved;
    }
  };
  (bound as any)[boundBrand] = bind;
  return bound as typeof callback;
}

// Immediately run a callback function without any captured context.
export function noContext<TResult>(callback: () => TResult) {
  const saved = currentContext;
  try {
    currentContext = null;
    return callback();
  } finally {
    currentContext = saved;
  }
}

// Like global.setTimeout, except the callback runs with captured context.
export { setTimeoutWithContext as setTimeout };
function setTimeoutWithContext(callback: () => any, delay: number) {
  return setTimeout(bind(callback), delay);
}

// Turn any generator function into an async function (using yield instead
// of await), with context automatically preserved across yields.
export function asyncFromGen<TArgs extends any[], TResult>(
  genFn: (...args: TArgs) => IterableIterator<TResult>,
) {
  return function (this: any) {
    const context = currentContext;
    const gen = genFn.apply(this, arguments as any);

    return new Promise((resolve, reject) => {
      function pump(valueToSend?: any) {
        const saved = currentContext;
        let result: IteratorResult<TResult | PromiseLike<TResult>>;
        try {
          currentContext = context;
          result = gen.next(valueToSend);
          currentContext = saved;
        } catch (error) {
          currentContext = saved;
          return reject(error);
        }
        const next = result.done ? resolve : pump;
        if (isPromiseLike(result.value)) {
          result.value.then(next, reject);
        } else {
          next(result.value);
        }
      }
      pump();
    });
  } as (...args: TArgs) => Promise<TResult>;
}

function isPromiseLike(value: any): value is PromiseLike<any> {
  return value && typeof value.then === "function";
}
