# @wry/key-set-map

Whereas the `@wry/trie` package associates values with _sequences_ of keys, the
`@wry/key-set-map` package and its `KeySetMap` class provide a similar
capability for _sets_ of keys, so the order of the input keys is no longer
important.

As with a traditional [Trie](https://en.wikipedia.org/wiki/Trie), lookups and
insertions take linear time in the size of the input set, and peek-like
operations can often bail out much more quickly, without having to look at all
the input set elements.

Since JavaScript `Set` and `Map` containers maintain insertion order, two
equivalent sets (containing identical elements) can nevertheless be detectably
different if their keys were inserted in a different order. Deciding which of
the orders is "correct" or "canonical" is a fool's errand, possible only when
there is an inherent total ordering among the elements, suggesting a
sorting-based strategy.

Because sorting is tempting as a strategy for turning sets into
canonically-ordered sequences, it's important to stress: this implementation
works without sorting set elements, and without requiring the elements to be
comparable. In fact, the lookup algorithm is asymptotically faster than it would
be if the keys had to be sorted before lookup.

Finally, to avoid taking any position on which ordering of elements is
canonical, this implementation never grants direct access to any previously
provided sets. Instead of attempting to return a canonical `Set`, the keys of
the set are associated with an arbitrary `TData` value, which is all you get
when you look up a set of keys.

## Memory management

When `WeakRef` and `FinalizationRegistry` are available, the `KeySetMap` class
automatically reclaims internal memory associated with sets containing keys that
have been garbage collected.

To that end, when keys can be garbage collected, the `KeySetMap` takes care not
to retain them strongly, acting like a `WeakMap` for object keys and like a
`Map` for non-object keys. In other words, `KeySetMap` does not prevent its
(object) keys from being garbage collected, if they are otherwise eligible.

By passing `false` for the `weakness` parameter to the `KeySetMap` constructor,
you can disable weak-key-related functionality, so the `KeySetMap` will behave
like a `Map` for all keys, regardless of whether they are objects or primitive.
This mode is not encouraged for production, but may be useful for testing,
debugging, or other diagnostic purposes.

Any `TData` objects allocated by the `KeySetMap` may outlive their associated
sets of keys, and retaining a strong reference to the `TData` object by itself
does not prevent garbage collection and removal of object keys. However, as long
as all keys remain reachable and are not removed from the `KeySetMap` with
`remove` or `removeSet`, the set of keys will remain in the `KeySetMap` and thus
retain a reference to the associated `TData`.
