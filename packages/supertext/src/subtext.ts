import { AnyFunction, freeze, defineProperty } from './helpers.js';
import { Supertext } from './supertext.js';

// A Subtext is like an AsyncContext except it has a default value, and allows
// specifying merge semantics for conflicting values for the same Subtext, as
// well as guard semantics for enforcing expectations about new values. To
// specify merge or guard semantics, declare a subclass of Supertext.Subtext
// that overrides the default merge and/or guard methods.
export class Subtext<T> {
  constructor(public readonly defaultValue: T) {}

  static is(candidate: any): candidate is Subtext<any> {
    return candidate instanceof Subtext;
  }

  get(): T {
    return Supertext.current.read(this);
  }

  // This method can be overridden to specify how to reconcile !== values for
  // this Subtext along divergent Supertext branches.
  merge(older: T, newer: T): T {
    return newer;
  }

  // This method can be overridden to throw an error (upon branching) if the
  // incoming value is not acceptable in some way, or needs to be normalized.
  guard(value: T): T {
    return value;
  }

  run<F extends AnyFunction>(
    value: T,
    callback: F,
    args: Parameters<F> | IArguments | [] = [],
    self: ThisParameterType<F> | null = null,
  ): ReturnType<F> {
    return Supertext.current
      .branch(this, value)
      .run(callback, args, self);
  }
}

// Compensate for `class Subtext<T> extends null` working differently depending
// on the ECMAScript target (native classes or constructor functions).
Object.setPrototypeOf(Subtext.prototype, null);
freeze(Subtext.prototype);
freeze(Subtext);

// Because we freeze Subtext.prototype, we can't simply assign to this.merge or
// this.guard in the constructor, since that throws an error about the inherited
// property being immutable. Instead, we use Object.defineProperty since it does
// not trigger this error.
function def<T>(
  instance: Subtext<T>,
  name: string,
  value: Subtext<T>["merge"] | Subtext<T>["guard"],
): void {
  defineProperty(instance, name, {
    value,
    writable: false,
    enumerable: true,
    configurable: false,
  });
}

export class MergeSubtext<T> extends Subtext<T> {
  constructor(
    defaultValue: T,
    merge: (older: T, newer: T) => T,
  ) {
    super(defaultValue);
    def(this, "merge", merge);
  }
}

export class GuardSubtext<T> extends Subtext<T> {
  constructor(
    defaultValue: T,
    guard: (value: T) => T,
  ) {
    super(defaultValue);
    def(this, "guard", guard);
  }
}

export class MergeGuardSubtext<T> extends MergeSubtext<T> {
  constructor(
    defaultValue: T,
    merge: (older: T, newer: T) => T,
    guard: (value: T) => T,
  ) {
    super(defaultValue, merge);
    def(this, "guard", guard);
  }
}
