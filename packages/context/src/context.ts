type Context = {
  parent: Context | null;
  slots: WeakMap<Slot<any>, any>;
}

let currentContext: Context | null = null;

export class Slot<TValue> {
  public hasValue(): boolean {
    for (let context = currentContext; context; context = context.parent) {
      // We use the Slot object iself as a key to its value, which means the
      // value cannot be obtained without a reference to the Slot object.
      if (context.slots.has(this)) {
        if (context !== currentContext) {
          // Cache the value in currentContext.slots so the next lookup will
          // be faster. This caching is safe because the tree of contexts and
          // the values of the slots are logically immutable.
          currentContext!.slots.set(this, context.slots.get(this));
        }
        return true;
      }
    }
    return false;
  }

  public getValue(): TValue | undefined {
    if (this.hasValue()) {
      return currentContext!.slots.get(this) as TValue;
    }
  }

  public withValue<TResult>(
    value: TValue,
    callback: () => TResult,
  ): TResult {
    const parent = currentContext;
    const slots = new WeakMap<Slot<any>, any>();
    slots.set(this, value);
    currentContext = { parent, slots };
    try {
      return callback();
    } finally {
      currentContext = parent;
    }
  }
}

// Capture the current context and wrap a callback function so that it
// reestablishes the captured context when called.
export function bind<TArgs extends any[], TResult>(
  callback: (...args: TArgs) => TResult,
) {
  const context = currentContext;
  return function bound(this: any) {
    const saved = currentContext;
    try {
      currentContext = context;
      return callback.apply(this, arguments as any);
    } finally {
      currentContext = saved;
    }
  } as typeof callback;
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
