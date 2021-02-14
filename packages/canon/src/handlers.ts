type Handlers = Parameters<PrototypeHandlerMap["enable"]>[1];

export class PrototypeHandlerMap {
  private map = new Map<object | null, Handlers>();

  constructor() {
    this.enable(Array.prototype, {
      toArray: array => array,
      empty: () => [],
      refill(array) {
        this.push.apply(this, array);
      },
    });

    const objectProtos = [null, Object.prototype];
    objectProtos.forEach(proto => this.enable(proto, {
      toArray(obj) {
        const keys = Object.keys(obj).sort();
        const array = [JSON.stringify(keys)];
        keys.forEach(key => array.push((obj as any)[key]));
        return array;
      },
      empty: () => Object.create(proto),
      refill(array) {
        const keys = JSON.parse(array[0]) as string[];
        keys.forEach((key, i) => {
          (this as any)[key] = array[i + 1];
        });
      },
    }));
  }

  public enable<P extends object, C extends any[]>(
    prototype: P | null,
    handlers: {
      toArray: (instance: P) => C;
      empty?: () => P,
      refill: (this: P, array: C) => P | void;
    },
  ) {
    // TODO Disallow this if anything has already been admitted?
    this.map.set(prototype, Object.freeze(handlers) as any);
  }

  public lookup(instance: object) {
    return this.map.get(Object.getPrototypeOf(instance));
  }
}
