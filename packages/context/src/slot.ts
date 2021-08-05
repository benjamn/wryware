type Context = {
  parent: Context | null;
  slots: { [slotId: string]: any };
}

// This currentContext variable will only be used if the makeSlotClass
// function is called, which happens only if this is the first copy of the
// @wry/context package to be imported.
let currentContext: Context | null = null;

// This unique internal object is used to denote the absence of a value
// for a given Slot, and is never exposed to outside code.
const MISSING_VALUE: any = {};

let idCounter = 1;

// Although we can't do anything about the cost of duplicated code from
// accidentally bundling multiple copies of the @wry/context package, we can
// avoid creating the Slot class more than once using makeSlotClass.
const makeSlotClass = () => class Slot<TValue> {
  // If you have a Slot object, you can find out its slot.id, but you cannot
  // guess the slot.id of a Slot you don't have access to, thanks to the
  // randomized suffix.
  public readonly id = [
    "slot",
    idCounter++,
    Date.now(),
    Math.random().toString(36).slice(2),
  ].join(":");

  public hasValue() {
    for (let context = currentContext; context; context = context.parent) {
      // We use the Slot object iself as a key to its value, which means the
      // value cannot be obtained without a reference to the Slot object.
      if (this.id in context.slots) {
        const value = context.slots[this.id];
        if (value === MISSING_VALUE) break;
        if (context !== currentContext) {
          // Cache the value in currentContext.slots so the next lookup will
          // be faster. This caching is safe because the tree of contexts and
          // the values of the slots are logically immutable.
          currentContext!.slots[this.id] = value;
        }
        return true;
      }
    }
    if (currentContext) {
      // If a value was not found for this Slot, it's never going to be found
      // no matter how many times we look it up, so we might as well cache
      // the absence of the value, too.
      currentContext.slots[this.id] = MISSING_VALUE;
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

  // Capture the current context and wrap a callback function so that it
  // reestablishes the captured context when called.
  static bind<TArgs extends any[], TResult, TThis = any>(
    callback: (this: TThis, ...args: TArgs) => TResult,
  ) {
    const context = currentContext;
    return function (this: TThis) {
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
  static noContext<TResult, TArgs extends any[], TThis = any>(
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
};

// We store a single global implementation of the Slot class as a permanent
// non-enumerable symbol property of the Array constructor. This obfuscation
// does nothing to prevent access to the Slot class, but at least it ensures
// the implementation (i.e. currentContext) cannot be tampered with, and all
// copies of the @wry/context package (hopefully just one) will share the
// same Slot implementation. Since the first copy of the @wry/context package
// to be imported wins, this technique imposes a very high cost for any
// future breaking changes to the Slot class.
const globalKey = "@wry/context:Slot";
const host = Array as any;

export const Slot: ReturnType<typeof makeSlotClass> = host[globalKey] || function () {
  const Slot = makeSlotClass();
  try {
    Object.defineProperty(host, globalKey, {
      value: host[globalKey] = Slot,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  } finally {
    return Slot;
  }
}();
