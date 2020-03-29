import { WeakTrie } from "./weak-trie";
export { WeakTrie }

const trie = new WeakTrie<{
  tuple: Tuple<any>;
}>();

export class Tuple<T extends any[]>
  implements ArrayLike<T[number]>, Iterable<T[number]>
{
  // ArrayLike<T[number]>:
  [i: number]: T[number];
  public readonly length: number;

  // Iterable<T[number]>:
  public [Symbol.iterator]: () => Iterator<T[number]>;

  // Tuple objects created by Tuple.from are guaranteed to be === each
  // other if (and only if) they have identical (===) elements, which
  // allows checking deep equality in constant time.
  public static from<E extends any[]>(...elements: E): Tuple<E> {
    const node = trie.lookupArray(elements);
    return node.tuple || (node.tuple = new Tuple(elements));
  }

  public static isTuple(that: any): that is Tuple<any> {
    return that instanceof Tuple;
  }

  // The constructor must be private to require using Tuple.from(...)
  // instead of new Tuple([...]).
  private constructor(elements: T) {
    this.length = elements.length;
    Object.setPrototypeOf(elements, Tuple.prototype);
    return Object.freeze(elements);
  }
}

[ // Borrow some reusable properties from Array.prototype.
  Symbol.iterator,
].forEach((borrowed: any) => {
  const desc = Object.getOwnPropertyDescriptor(Array.prototype, borrowed);
  if (desc) Object.defineProperty(Tuple.prototype, borrowed, desc);
});

export default Tuple.from;
