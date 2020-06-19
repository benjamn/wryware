# @wry/tuple

Immutable finite list objects with constant-time equality testing (`===`)
and no hidden memory leaks.

## Installation &amp; Usage

First install the package from npm:

```sh
npm install @wry/tuple
```

This package has a default export that can be imported using any name, but
is typically named `tuple`:

```js
import assert from "assert";
import tuple from "@wry/tuple";

// Tuples are array-like:
assert(tuple(1, 2, 3).length === 3);
assert(tuple("a", "b")[1] === "b");

// Deeply equal tuples are also === equal!
assert.strictEqual(
  tuple(1, tuple(2, 3), 4),
  tuple(1, tuple(2, 3), 4),
);
```

In addition to the default export, `@wry/tuple` exports the `Tuple` class,
whose `Tuple.from` function provides the default export; and the
`WeakTrie` class, which you can learn more about by reading its
[code](/packages/tuple/src/weak-trie.ts).
You probably will not need to use these exports directly:

```
import tuple, { Tuple, WeakTrie } from "@wry/tuple";

assert(tuple === Tuple.from);
```

### Constructing tuples

The `tuple` function takes any number of arguments and returns a unique,
immutable object that inherits from `Tuple.prototype` and is guaranteed to
be `===` any other `Tuple` object created from the same sequence of
arguments:

```js
const obj = { asdf: 1234 };
const t1 = tuple(1, "asdf", obj);
const t2 = tuple(1, "asdf", obj);

assert.strictEqual(t1 === t2, true);
assert.strictEqual(t1, t2);
```

### Own properties

A tuple has a fixed numeric `length` property, and its elements may
be accessed using array index notation:

```js
assert.strictEqual(t1.length, 3);

t1.forEach((x, i) => {
  assert.strictEqual(x, t2[i]);
});
```

### Nested tuples

Since `Tuple` objects are just another kind of JavaScript object,
naturally tuples can contain other tuples:

```js
assert.strictEqual(
  tuple(t1, t2),
  tuple(t2, t1)
);

assert.strictEqual(
  tuple(1, t2, 3)[1][2],
  obj
);
```

However, because tuples are immutable and always distinct from any of
their arguments, it is not possible for a tuple to contain itself, nor to
contain another tuple that contains the original tuple, and so forth.

### Constant time `===` equality

Since `Tuple` objects are identical when (and only when) their elements
are identical, any two tuples can be compared for equality in constant
time, regardless of how many elements they contain.

This behavior also makes `Tuple` objects useful as keys in a `Map`, or
elements in a `Set`, without any extra hashing or equality logic:

```js
const map = new Map;

map.set(tuple(1, 12, 3), {
  author: tuple("Ben", "Newman"),
  releaseDate: Date.now()
});

const version = "1.12.3";
const info = map.get(tuple(...version.split(".").map(Number)));
if (info) {
  console.log(info.author[1]); // "Newman"
}
```

### Shallow immutability

While the identity, number, and order of elements in a `tuple` is fixed,
please note that the contents of the individual elements are not frozen in
any way:

```js
const obj = { asdf: 1234 };
tuple(1, "asdf", obj)[2].asdf = "oyez";
assert.strictEqual(obj.asdf, "oyez");
```

### Iterability

Every `Tuple` object is array-like and iterable, so `...` spreading and
destructuring work as they should:

```js
func(...tuple(a, b));
func.apply(this, tuple(c, d, e));

assert.deepEqual(
  [1, ...tuple(2, 3), 4],
  [1, 2, 3, 4]
);

assert.strictEqual(
  tuple(1, ...tuple(2, 3), 4),
  tuple(1, 2, 3, 4)
);

const [a, [_, b]] = tuple(1, tuple(2, 3), 4);
assert.strictEqual(a, 1);
assert.strictEqual(b, 3);
```

### Instance pooling (internalization)

Any data structure that guarantees `===` equality based on structural equality must maintain some sort of internal pool of previously encountered instances.

Implementing such a pool for `tuple`s is fairly straightforward (though feel free to give it some thought before reading this code, if you like figuring things out for yourself):

```js
const pool = new Map;

function tuple(...items) {
  let node = pool;

  items.forEach(item => {
    let child = node.get(item);
    if (!child) node.set(item, child = new Map);
    node = child;
  });

  // If we've created a tuple instance for this sequence of elements before,
  // return that instance again. Otherwise create a new immutable tuple instance
  // with the same (frozen) elements as the items array.
  return node.tuple || (node.tuple = Object.create(
    tuple.prototype,
    Object.getOwnPropertyDescriptors(Object.freeze(items))
  ));
}
```

This implementation is pretty good, because it requires only linear time (_O_(`items.length`)) to determine if a `tuple` has been created previously for the given `items`, and you can't do better than linear time (asymptotically speaking) because you have to look at all the items.

This code is also useful as an illustration of exactly how the `tuple` constructor behaves, in case you weren't satisfied by my examples in the previous section.

### Garbage collection

The simple implementation above has a serious problem: in a
garbage-collected language like JavaScript, the `pool` itself will retain
references to all `Tuple` objects ever created, which prevents `Tuple`
objects and their elements (which can be arbitrarily large) from ever
being reclaimed by the garbage collector, even after they become
unreachable by any other means. In other words, storing objects in this
kind of `Tuple` would inevitably cause **memory leaks**.

To solve this problem, it's tempting to try changing `Map` to
[`WeakMap`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap)
here:

```js
const pool = new WeakMap;
```

and here:

```js
if (!child) node.set(item, child = new WeakMap);
```

This approach is appealing because a `WeakMap` should allow its keys to be
reclaimed by the garbage collector. That's the whole point of a `WeakMap`,
after all. Once a `tuple` becomes unreachable because the program has
stopped using it anywhere else, its elements are free to disappear from
the pool of `WeakMap`s whenever they too become unreachable. In other
words, something like a `WeakMap` is exactly what we need here.

Unfortunately, this strategy stumbles because a `tuple` can contain
primitive values as well as object references, whereas a `WeakMap` only
allows keys that are object references.

In other words, `node.set(item, ...)` would fail whenever `item` is not an
object, if `node` is a `WeakMap`. To see how the `@wry/tuple` library
cleverly gets around this `WeakMap` limitation, have a look at
[this module](https://github.com/benjamn/wryware/blob/main/packages/tuple/src/weak-trie.ts).
