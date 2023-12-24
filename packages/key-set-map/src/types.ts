export interface CanonicalKeys<TData, TKey = any> {
  // Number of unique keys in the set, equal to the sum of the lengths of the
  // sKeys and wKeys arrays.
  size: number;
  // A mixture of strongly-held keys and WeakRef objects wrapping weakly-held
  // keys.
  keysOrRefs: Set<TKey | WeakRef<object>>;
  // User-typed/configurable data associated with this set of keys.
  data?: TData;
}

// The numeric Map<number, ...> keys correspond to the sizes of the
// CanonicalKeys entries.
export type SizeIndexedSetsOfCanonicalKeys<TData, TKey> =
  Map<number, Set<CanonicalKeys<TData, TKey>>>;
