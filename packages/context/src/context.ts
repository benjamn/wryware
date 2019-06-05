import { Slot } from "./slot";
export { Slot }
export const { bind, noContext } = Slot;

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
    const boundNext = bind(gen.next);
    const boundThrow = bind(gen.throw!);
    type Method = typeof boundNext | typeof boundThrow;

    return new Promise<TResult>((resolve, reject) => {
      function invoke(method: Method, argument: any) {
        try {
          var result = method.call(gen, argument);
        } catch (error) {
          return reject(error);
        }
        const next = result.done ? resolve : invokeNext;
        if (isPromiseLike(result.value)) {
          result.value.then(next, result.done ? reject : invokeThrow);
        } else {
          next(result.value);
        }
      }
      const invokeNext = (value?: any) => invoke(boundNext, value);
      const invokeThrow = (error: any) => invoke(boundThrow, error);
      invokeNext();
    });
  } as (...args: TArgs) => Promise<TResult>;
}

function isPromiseLike(value: any): value is PromiseLike<any> {
  return value && typeof value.then === "function";
}

// If you use the fibers npm package to implement coroutines in Node.js,
// you should call this function at least once to ensure context management
// remains coherent across any yields.
const wrappedFibers: Function[] = [];
export function wrapYieldingFiberMethods<F extends Function>(Fiber: F): F {
  // There can be only one implementation of Fiber per process, so this array
  // should never grow longer than one element.
  if (wrappedFibers.indexOf(Fiber) < 0) {
    const wrap = (obj: any, method: string) => {
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
    wrappedFibers.push(Fiber);
  }
  return Fiber;
}