import { Trie } from "@wry/trie";

import { Subtext } from "./subtext.js";
import {
  freeze,
  deduplicateArrayPreferringRightmost,
  makeSafeWeakMap,
  SafeWeakMap,
  AnyFunction,
  MISSING,
} from "./helpers.js";

import { makeSupertextStorage } from "./storage.js";
const {
  getCurrentSupertext,
  runWithSupertext,
} = makeSupertextStorage();

// An important property of the Supertext class is that merging the same
// sequence of Supertext parents always produces the same (===) Supertext object
// reference, substantially reducing the number of distinct Supertext objects
// that end up being created. This supertextMergeTrie is used to store reusable
// Supertext objects for sequences of parents that have already been seen.
const supertextMergeTrie = new Trie<{
  supertext?: Supertext;
}>();

// The internal state of a Supertext object consists of a WeakMap of Subtext
// values defined directly by this Supertext object, along with an array of
// Supertext parents, from which additional Subtext values are inherited. The
// map will be used as a cache for parent lookups, so we don't have to traverse
// the ancestry hierarchy repeatedly for the same Subtext keys. However, this
// caching is safe only if Supertext objects remain logically immutable, so it's
// important that the parents array never changes, and that the map is only
// modified in the branch method, when a new Supertext object is first created,
// or when caching lookups to amortize the cost of parent traversal.
interface SupertextInternalState {
  map: SafeWeakMap<Subtext<any>, any>;
  parents?: readonly Supertext[];
}

// To enforce privacy and prevent tampering, SupertextInternalState objects are
// associated with Supertext objects using a WeakMap, rather than using
// Supertext class fields. Truly #private class fields could work, but I believe
// they are mostly isomorphic to this pattern, and doing it this way does not
// require any transpilation.
const weakMapOfInternalStates =
  makeSafeWeakMap<Supertext, SupertextInternalState>();

function internalStateFor(supertext: Supertext): SupertextInternalState {
  return weakMapOfInternalStates.get(supertext) ||
    weakMapOfInternalStates.set(supertext, {
      // The parents array is always populated in the Supertext constructor.
      map: makeSafeWeakMap(),
    }).get(supertext)!;
}

// See comment below about Object.setPrototypeOf(Subtext.prototype, null) for an
// explanation of why `extends null` does not work in practice here.
export class Supertext /* extends null */ {
  static get current(): Supertext {
    return getCurrentSupertext() || Supertext.EMPTY;
  }

  // This immutable Supertext.EMPTY object can be obtained via Supertext.merge()
  // at any time, but Supertext.EMPTY is a more expressive shorthand.
  static readonly EMPTY = Supertext.merge();

  // A Supertext object represents the merged contents of its Supertext parents,
  // plus any local/cached entries in the internalStateFor(this). If multiple
  // parents define !== values for the same Subtext, the rightmost parent's
  // value is taken by default (thanks to preferNewer), though this behavior is
  // highly configurable by defining custom subtext.merge functions. This
  // constructor is private so we can enforce the uniqueness of the
  // uniqueParents array.
  private constructor(uniqueParents: Supertext[]) {
    freeze(internalStateFor(this).parents = uniqueParents);
    freeze(this);
  }

  // Return the value associated with the given Subtext in the current
  // Supertext, or subtext.defaultValue if no value is currently associated with
  // this Subtext. The subtext.get() method is a convenient shorthand for
  // Supertext.current.read(subtext). Note that subtext.defaultValue resides on
  // the subtext object, not in any Supertext map. Instead, MISSING serves as a
  // unique placeholder for missing values in Supertext maps.
  read<T>(subtext: Subtext<T>): T {
    const value = lookup(this, subtext);
    return value === MISSING ? subtext.defaultValue : value;
  }

  // We want to support immutable branching not only for single Subtext keys and
  // values, like Supertext.current.branch(subtext, value), but also for
  // multiple keys at once, as in
  //
  //   Supertext.current.branch(
  //     subtext1, value1,
  //     subtext2, value2,
  //     ...
  //   ).run(...)
  //
  // This second style is convenient because it allows creating only a single
  // Supertext branch object for multiple new Subtext values, rather than
  // creating a chain of Supertext branch objects, one for each value updated.
  // Both styles are supported by this branch method.
  //
  // For a good TypeScript experience, we declare branch signature overloads for
  // up to five supertexts at once. While the branch method will work with any
  // number of arguments, more overloads can be added here if needed.
  branch<T1>(
    s1: Subtext<T1>, v1: T1,
  ): Supertext;
  branch<T1, T2>(
    s1: Subtext<T1>, v1: T1,
    s2: Subtext<T2>, v2: T2,
  ): Supertext;
  branch<T1, T2, T3>(
    s1: Subtext<T1>, v1: T1,
    s2: Subtext<T2>, v2: T2,
    s3: Subtext<T3>, v3: T3,
  ): Supertext;
  branch<T1, T2, T3, T4>(
    s1: Subtext<T1>, v1: T1,
    s2: Subtext<T2>, v2: T2,
    s3: Subtext<T3>, v3: T3,
    s4: Subtext<T4>, v4: T4,
  ): Supertext;
  branch<T1, T2, T3, T4, T5>(
    s1: Subtext<T1>, v1: T1,
    s2: Subtext<T2>, v2: T2,
    s3: Subtext<T3>, v3: T3,
    s4: Subtext<T4>, v4: T4,
    s5: Subtext<T5>, v5: T5,
  ): Supertext;

  // This version of the branch method provides the concrete implementation.
  branch(...args: any[]): Supertext {
    // Calling supertext.branch with one or more arguments always creates a new
    // Supertext object, so Supertext objects are not interned or reused at this
    // stage (as they are when merging the same parents repeatedly).
    const branched = new Supertext([this]);
    const { map } = internalStateFor(branched);

    // This is the only place where we modify map with entries that are not just
    // cached lookups from ancestor Supertext objects.
    for (let i = 0; i + 1 < args.length; i += 2) {
      const subtext: Subtext<any> = args[i];
      if (Subtext.is(subtext)) {
        map.set(subtext, subtext.guard(args[i + 1]));
      }
    }

    // Once we return the branched Supertext object, its map should be
    // considered final, except for any cached parent lookups, which is an
    // optimization that preserves logical immutability of the hierarchy.
    return branched;
  }

  // There is both a static Supertext.merge method (this one) and a per-instance
  // supertext.merge method (below). Both use deduplication and trie interning
  // to ensure the same sequence of parent Supertext objects results in the same
  // (===) merged Supertext object every time, so
  //
  //   Supertext.merge(a, b, c) === Supertext.merge(a, b, c)
  //
  // is always true. There are other places where we create Supertext instances
  // (such as the branch method) where we do not want the interning behavior, so
  // it does not make sense to hard-code this logic into the constructor.
  // Instead, the constructor remains as simple as possible, and private.
  static merge(...parents: Supertext[]): Supertext {
    const uniqueParents = deduplicateArrayPreferringRightmost(parents);
    const reusable = supertextMergeTrie.lookupArray(uniqueParents);
    return reusable.supertext || (reusable.supertext = new Supertext(uniqueParents));
  }

  // A non-static merge method that's especially convenient for binary merges,
  // such as bound.merge(Supertext.current).
  merge(...others: Supertext[]): Supertext {
    return Supertext.merge(this, ...others);
  }

  // Run a given callback function with this Supertext temporarily in effect,
  // and return whatever the callback function returns. Although arguments can
  // be provided via lexical scope (so technically a zero-argument callback is
  // all you ever need), it's often convenient to pass an array of callback
  // arguments, as well as an optional self parameter for specifying `this`.
  run<F extends AnyFunction>(
    callback: F,
    args: Parameters<F> | IArguments | [] = [],
    self: ThisParameterType<F> | null = null,
  ): ReturnType<F> {
    return runWithSupertext(
      this,
      () => callback.apply(self, args as Parameters<F>),
    );
  }

  bind<F extends AnyFunction>(callback: F): F {
    const bound = this;
    return function () {
      // This bind method demonstrates the power of automatic merge conflict
      // resolution, which works by delegating all merge decisions back to
      // individual subtext.merge functions.
      //
      // When bound and Supertext.current are stable object references (as they
      // would be in a loop that does not change Supertext.current), the
      // Supertext object reference returned by bound.merge(Supertext.current)
      // or (equivalently) Supertext.merge(bound, Supertext.current) will also
      // be stable, so all the supertext.lookup caching that has happened
      // previously continues to benefit performance.
      //
      // Note also that bound.merge(Supertext.current) is a constant-time
      // operation, because the Supertext class makes no effort to merge the
      // contents of the parent maps eagerly. Instead, all merge conflict
      // resolution happens lazily, when a particular subtext is read for the
      // first time, and only when there are multiple unequal (!==) values to
      // reconcile into one final value.
      return Supertext.merge(
        bound,
        Supertext.current,
      ).run(callback, arguments, this);
    } as F;
  }

  // If you really want your callback function to run with only the originally
  // bound Supertext and not also Supertext.current, use bindOnly.
  bindOnly<F extends AnyFunction>(callback: F): F {
    const bound = this;
    return function () {
      return bound.run(callback, arguments, this);
    } as F;
  }
}

// Recursive helper function for Supertext.prototype.read, which powers
// Subtext.prototype.get. Handles conflicting Subtext values by delegating to
// subtext.merge. Caches the final result, even if it's MISSING, so future
// lookups for the same subtext will take constant time.
function lookup<T>(
  supertext: Supertext,
  subtext: Subtext<T>,
): T | (typeof MISSING) {
  const {
    map,
    parents,
  } = internalStateFor(supertext);

  if (map.has(subtext)) {
    // Once the value associated with a particular Subtext has been determined
    // for this Supertext, it will never change, and in the future the cached
    // value can be returned on this line in constant time.
    return map.get(subtext);
  }

  if (!parents || !parents.length) {
    // If there are no parents (e.g. Supertext.EMPTY), then this Supertext
    // should always report MISSING, so there is little point caching the
    // absence of a value.
    return MISSING;
  }

  // In case there is ever a loop in the traversal of the ancestral hierarchy,
  // setting the anticipated final value initially to MISSING ensures we don't
  // get stuck in a loop when/if we encounter this Subtext again.
  map.set(subtext, MISSING);

  // Look up values for this Subtext from all the (unique) parents.
  const inherited: T[] = [];
  for (let p = 0, pLen = parents.length; p < pLen; ++p) {
    const value = lookup(parents[p], subtext);
    if (value !== MISSING) {
      inherited[inherited.length] = value;
    }
  }

  // If all parents reported MISSING, then this Supertext should also report
  // MISSING. Note that we called map.set(subtext, MISSING) above, so we don't
  // need to do it again here.
  if (inherited.length === 0) {
    return MISSING;
  }

  // Deduplicate the array of inherited values, preferring the rightmost
  // occurrence of any duplicated values. This allows subtext.merge to be called
  // a minimum number of times, seeing only !== values. Thanks to the semantics
  // of Array.prototype.reduce, preferNewer works as a default subtext.merge
  // function, returning the rightmost element of the deduplicated inherited
  // array by default.
  const result = deduplicateArrayPreferringRightmost(
    inherited
  ).reduce(subtext.merge);

  // Cache the final immutable result for faster future lookup. Even though this
  // modifies the map, the result is always the same no matter whether it comes
  // from map immediately or has to be looked up. For this reason, the contents
  // of any given Subtext should still be considered logically immutable,
  // despite this internal modification.
  map.set(subtext, result);

  return result;
}

// We would prefer to use `class Supertext extends null`, but that leads to
// several TypeScript compilation problems, involving whether or not super()
// should/can be called in the constructor, and whether Function.prototype.apply
// is safe to use for the super() invocation (instead of Reflect.construct).
// Retroactively setting the prototype of Supertext.prototype to null works in
// all cases (as long as Object.setPrototypeOf is available).
Object.setPrototypeOf(Supertext.prototype, null);
freeze(Supertext.prototype);
freeze(Supertext);
