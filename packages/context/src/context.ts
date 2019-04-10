type Context = {
  parent: Context | null;
  slots: { [slotId: string]: any };
}

let currentContext: Context | null = null;

// This unique internal object is used to denote the absence of a value
// for a given Slot, and is never exposed to outside code.
const MISSING_VALUE: any = {};

let idCounter = 1;

export class Slot<TValue> {
  // If you have a Slot object, you can find out its slot.id by circumventing
  // TypeScript's privacy restrictions, but you can't guess the slot.id of a
  // Slot you don't have access to, thanks to the randomized suffix.
  private readonly id = [
    "slot",
    idCounter++,
    Date.now(),
    Math.random().toString(36).slice(2),
  ].join(":");

  public hasValue() {
    const { id } = this;
    for (let context = currentContext; context; context = context.parent) {
      // We use the Slot object iself as a key to its value, which means the
      // value cannot be obtained without a reference to the Slot object.
      if (id in context.slots) {
        const value = context.slots[id];
        if (value === MISSING_VALUE) break;
        if (context !== currentContext) {
          // Cache the value in currentContext.slots so the next lookup will
          // be faster. This caching is safe because the tree of contexts and
          // the values of the slots are logically immutable.
          currentContext!.slots[id] = value;
        }
        return true;
      }
    }
    if (currentContext) {
      // If a value was not found for this Slot, it's never going to be found
      // no matter how many times we look it up, so we might as well cache
      // the absence of the value, too.
      currentContext.slots[id] = MISSING_VALUE;
    }
    return false;
  }

  public getValue(): TValue | undefined {
    if (this.hasValue()) {
      return currentContext!.slots[this.id] as TValue;
    }
  }

  public withValue<TResult, TArgs extends any[], TThis = any>(
    value: TValue,
    callback: (this: TThis, ...args: TArgs) => TResult,
    // Given the prevalence of arrow functions, specifying arguments is likely
    // to be much more common than specifying `this`, hence this ordering:
    args?: TArgs,
    thisArg?: TThis,
  ): TResult {
    const slots = {
      __proto__: null,
      [this.id]: value,
    };
    const parent = currentContext;
    currentContext = { parent, slots };
    try {
      // Function.prototype.apply allows the arguments array argument to be
      // omitted or undefined, so args! is fine here.
      return callback.apply(thisArg!, args!);
    } finally {
      currentContext = parent;
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
export function noContext<TResult, TArgs extends any[], TThis = any>(
  callback: (this: TThis, ...args: TArgs) => TResult,
  // Given the prevalence of arrow functions, specifying arguments is likely
  // to be much more common than specifying `this`, hence this ordering:
  args?: TArgs,
  thisArg?: TThis,
) {
  if (currentContext) {
    const saved = currentContext;
    try {
      currentContext = null;
      // Function.prototype.apply allows the arguments array argument to be
      // omitted or undefined, so args! is fine here.
      return callback.apply(thisArg!, args!);
    } finally {
      currentContext = saved;
    }
  } else {
    return callback.apply(thisArg!, args!);
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
    const gen = genFn.apply(this, arguments as any);
    const next = bind(gen.next);

    return new Promise((resolve, reject) => {
      function pump(valueToSend?: any) {
        try {
          var result = next.call(gen, valueToSend);
        } catch (error) {
          return reject(error);
        }
        const step = result.done ? resolve : pump;
        if (isPromiseLike(result.value)) {
          result.value.then(step, reject);
        } else {
          step(result.value);
        }
      }
      pump();
    });
  } as (...args: TArgs) => Promise<TResult>;
}

function isPromiseLike(value: any): value is PromiseLike<any> {
  return value && typeof value.then === "function";
}

// If you use the fibers npm package to implement coroutines in Node.js,
// you should call this function at least once to ensure context management
// remains coherent across any yields.
export function wrapYieldingFiberMethods(Fiber: any) {
  function wrap(obj: any, method: string) {
    const fn = obj[method];
    obj[method] = function () {
      return noContext(fn, arguments as any, this);
    };
  }
  // These methods can yield, according to
  // https://github.com/laverdet/node-fibers/blob/ddebed9b8ae3883e57f822e2108e6943e5c8d2a8/fibers.js#L97-L100
  wrap(Fiber, "yield");
  wrap(Fiber.prototype, "run");
  wrap(Fiber.prototype, "throwInto");
}
