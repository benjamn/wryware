import { Trie } from "@wry/trie";

type Handlers =
  | TwoStepHandlers
  | ThreeStepHandlers;

type TwoStepHandlers<
  Object extends object = object,
  Children extends any[] = any[],
> = {
  deconstruct(instance: Object): Children;
  reconstruct(array: Children): Object;
};

type ThreeStepHandlers<
  Object extends object = object,
  Children extends any[] = any[],
> = {
  deconstruct(instance: Object): Children;
  allocate(instance: Object): Object;
  repair(empty: Object, array: Children): void;
};

export function isTwoStep(
  handlers: Handlers | undefined,
): handlers is TwoStepHandlers {
  const reconstruct = handlers && (handlers as TwoStepHandlers).reconstruct;
  return typeof reconstruct === "function";
};

export function isThreeStep(
  handlers: Handlers | undefined,
): handlers is ThreeStepHandlers {
  const allocate = handlers && (handlers as ThreeStepHandlers).allocate;
  return typeof allocate === "function";
};

export class PrototypeHandlerMap {
  private map = new Map<object | null, Handlers>();
  private usedPrototypes = new Set<object | null>();
  private keyTrie = new Trie<{
    keys?: SortedKeysInfo;
  }>(false);

  constructor() {
    this.enable(Array.prototype, {
      deconstruct(array) {
        return array;
      },
      allocate() {
        return [];
      },
      repair(empty, children) {
        empty.length = children.length;
        children.forEach((child, i) => empty[i] = child);
      },
    });

    const self = this;
    const objectProtos = [null, Object.prototype];
    objectProtos.forEach(proto => this.enable(proto, {
      deconstruct(obj: Record<string, any>) {
        const keys = self.sortedKeys(obj);
        const children = [keys.json];
        keys.sorted.forEach(key => children.push(obj[key]));
        return children;
      },
      allocate() {
        return Object.create(proto);
      },
      repair(empty: Record<string, any>, children) {
        self.keysByJSON.get(children[0])!.sorted.forEach((key, i) => {
          empty[key] = children[i + 1];
        });
      },
    }));
  }

  public enable<Object extends object, Children extends any[]>(
    prototype: Object | null,
    handlers: TwoStepHandlers<Object, Children>,
  ): void;

  public enable<Object extends object, Children extends any[]>(
    prototype: Object | null,
    handlers: ThreeStepHandlers<Object, Children>,
  ): void;

  public enable(prototype: object, handlers: Handlers) {
    if (this.usedPrototypes.has(prototype)) {
      throw new Error("Cannot enable prototype that has already been looked up");
    }
    this.map.set(prototype, Object.freeze(handlers) as any);
  }

  public lookup(instance: object) {
    const proto = Object.getPrototypeOf(instance);
    this.usedPrototypes.add(proto);
    return this.map.get(proto);
  }

  // It's worthwhile to cache the sorting of arrays of strings, since the
  // same initial unsorted arrays tend to be encountered many times.
  // Fortunately, we can reuse the Trie machinery to look up the sorted
  // arrays in linear time (which is faster than sorting large arrays).
  private sortedKeys(obj: object) {
    const keys = Object.keys(obj);
    const node = this.keyTrie.lookupArray(keys);
    if (!node.keys) {
      keys.sort();
      const json = JSON.stringify(keys);
      if (!(node.keys = this.keysByJSON.get(json))) {
        this.keysByJSON.set(json, node.keys = { sorted: keys, json });
      }
    }
    return node.keys;
  }
  // Arrays that contain the same elements in a different order can share
  // the same SortedKeysInfo object, to save memory.
  private keysByJSON = new Map<string, SortedKeysInfo>();
}

type SortedKeysInfo = {
  sorted: string[];
  json: string;
};
