import { Trie } from "@wry/trie";
import { buildComponentInfoMap, ComponentInfoMap } from "./components";
import { isObjectOrArray, numRef } from "./helpers";
import { PrototypeHandlerMap } from "./handlers";

export class Canon {
  public readonly handlers = new PrototypeHandlerMap;

  private known = new WeakSet<object>();
  private pool = new Trie<{
    trace?: any[];
    known?: object;
  }>(true);

  public isCanonical(value: any): boolean {
    return !isObjectOrArray(value) ||
      this.known.has(value) ||
      !this.handlers.lookup(value);
  }

  public admit<T>(value: T): T;
  public admit(value: any) {
    if (this.isCanonical(value)) {
      return value;
    }
    return this.scanComponents(
      buildComponentInfoMap(value, this),
    )(value);
  }

  private scanComponents(map: ComponentInfoMap) {
    const gotten = new Set<object>();
    const getKnown = (input: object): object => {
      if (this.isCanonical(input)) return input;
      const info = map.infoMap.get(input);
      const known = info && info.known;
      if (known) {
        if (gotten.has(known)) return known;
        gotten.add(known);
        if (!this.isCanonical(known)) {
          // Finish reconstructing the empty known object by translating any
          // unknown object children to their known canonical forms.
          this.handlers.lookup(input)!.refill.call(
            known,
            info!.children.map(getKnown),
          );
          // Freeze the repaired known object and officially admit it into
          // the canon of known canonical objects.
          try {
            Object.freeze(known);
          } finally {
            this.known.add(known);
            return known;
          }
        }
        return known;
      }
      return input;
    };

    // TODO Make sure this array is actually sorted in topological order.
    map.components.forEach(component => {
      const newlyAdmitted: Record<string, unknown>[] = [];

      // Although we might like to use component.forEach here, there's no
      // way to terminate a Set.prototype.forEach loop early without
      // throwing an exception, so we use component.asArray.some instead.
      component.asArray.some(inputObject => {
        if (this.isCanonical(this.scan(inputObject, map.infoMap))) {
          // This implies the entire component has already been canonized,
          // so we can terminate the component.asArray.some loop early.
          return true;
        }
        // This object still needs to be repaired and frozen before it can
        // be admitted into this.known.
        newlyAdmitted.push(inputObject as any);
        // Continue the component.asArray.some loop.
        return false;
      });

      newlyAdmitted.forEach(getKnown);
    });

    return getKnown;
  }

  private scan<Root extends object>(
    root: Root,
    infoMap: ComponentInfoMap["infoMap"],
  ): Root {
    if (this.isCanonical(root)) return root;
    const rootInfo = infoMap.get(root);
    if (!rootInfo) return root;
    if (rootInfo.known) return rootInfo.known as Root;

    // The capital N in Number is not a typo (see numRef comments below).
    const seen = new Map<object, Number>();
    const traces: object[] = [];

    const scan = (input: object) => {
      if (this.known.has(input)) return input;

      const info = infoMap.get(input);
      if (!info) return input;

      if (seen.has(input)) return seen.get(input)!;
      const nextTraceIndex = traces.length;
      seen.set(input, numRef(nextTraceIndex));

      const handlers = this.handlers.lookup(input);
      if (!handlers) return input;

      const trace = [Object.getPrototypeOf(input)];
      info.children.forEach(child => {
        if (this.isCanonical(child)) {
          trace.push(child);
        } else if (rootInfo.component.has(child)) {
          trace.push(scan(child));
        } else {
          trace.push(this.scan(child, infoMap));
        }
      });

      const node = this.pool.lookupArray(trace);
      return traces[nextTraceIndex] = node.trace || (node.trace = trace);
    };

    if (scan(root) === root) return root;

    const node = this.pool.lookupArray(traces);
    if (!node.known) {
      const handlers = this.handlers.lookup(root)!;
      // If handlers.empty is defined, use it to create a new empty
      // instance of the desired type, to be filled in later. Any type of
      // object that can contain references back to itself must define
      // handlers.empty, because the only way to (re)create a structure
      // containing cycles is to start with an acyclic mutable object, and
      // then modify it to refer (perhaps indirectly) back to itself. If
      // handlers.empty is not defined, we instead call handlers.refill to
      // construct the instance immediately, under the assumption that
      // none of the children in rootInfo.children are in a cycle with the
      // root object. This style of construction is necessary for types
      // like Buffer that are immutable upon construction, and thus cannot
      // ever contain references back to themselves.
      node.known = handlers.empty
        ? handlers.empty()
        : handlers.refill(rootInfo.children.map(
          // The children of immediately-constructible objects should
          // never be in a cycle with the object itself, because that
          // would imply the object must have existed before its children
          // were created, even though the children are required to create
          // the object. Because scanComponents processes components in
          // topological order, starting with the leaves of the component
          // graph (which is acylic by construction), and child is assumed
          // to be in a separate component from rootInfo.component, we
          // must already have processed the component that contains
          // child, so the result of this.scan(child, infoMap) should
          // always be a fully canonized value.
          child => this.scan(child, infoMap),
        )) as object;
    }

    return rootInfo.known = node.known as Root;
  }
}
