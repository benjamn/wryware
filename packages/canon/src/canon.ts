import { Trie } from "@wry/trie";
import { buildComponentInfoMap, Component, ComponentInfoMap } from "./components";
import { Info, isObjectOrArray, numRef } from "./helpers";
import {
  PrototypeHandlerMap,
  ThreeStepHandlers,
  isTwoStep,
  isThreeStep,
} from "./handlers";

export class Canon {
  public readonly handlers = new PrototypeHandlerMap;

  private known = new WeakSet<object>();
  private pool = new Trie<{
    trace?: any[];
    known?: object;
  }>(true);

  public admit<T>(value: T): T;
  public admit(value: any) {
    if (this.isCanonical(value)) {
      return value;
    }
    const map = buildComponentInfoMap(value, this);
    // TODO Make sure the map.components array is really sorted in
    // topological order, leaves first.
    map.components.forEach(component => {
      this.scanComponent(component, map.infoMap);
    });
    return this.scan(value, map.infoMap);
  }

  public isCanonical(value: any): boolean {
    return !isObjectOrArray(value) ||
      this.known.has(value) ||
      !this.handlers.lookup(value);
  }

  private scanComponent(
    component: Component,
    infoMap: ComponentInfoMap["infoMap"],
  ) {
    const toBeRepaired: Info[] = [];
    const notThreeSteps: object[] = [];

    // Handle all three-step objects first, so we have those references
    // in hand before reconstructing any immutable two-step objects.
    const alreadyCanonized = component.asArray.some(input => {
      const info = infoMap.get(input)!;
      if (isThreeStep(info.handlers)) {
        if (this.known.has(this.scan(input, infoMap))) {
          // This implies the entire component has already been canonized,
          // so we can terminate the component.asArray.some loop early.
          return true;
        }
        toBeRepaired.push(info);
      } else {
        notThreeSteps.push(input);
      }
      return false;
    });

    // Now scan any two-step objects.
    if (!alreadyCanonized && notThreeSteps.length) {
      notThreeSteps.some(input => {
        const known = this.scan(input, infoMap);
        if (this.known.has(known)) return true;
        this.known.add(known);
        return false;
      });
    }

    if (toBeRepaired.length) {
      const repaired = new Set<object>();

      toBeRepaired.forEach(info => {
        // Multiple input objects (and thus multiple Info objects) can end
        // up with the same info.known reference, so it's important to
        // store known references in the repaired set, rather than input
        // references, to prevent reconstructing the same known object
        // more than once. Idempotence matters not only for performance,
        // but also to avoid attempting to modify reconstructed objects
        // after they've been canonized and frozen.
        if (!info.known || repaired.has(info.known)) return;
        repaired.add(info.known);

        (info.handlers as ThreeStepHandlers).repair(
          info.known,
          info.children.map(child => this.scan(child, infoMap)),
        );

        // Freeze the known object and officially admit it into the Canon.
        this.known.add(Object.freeze(info.known));
      });
    }
  }

  // Returns the canonical object corresponding to the structure of the given
  // root object. This canonical object may still need further modifications,
  // but the reference itself will be the final reference.
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

      // To avoid endlessly traversing cycles, and also to avoid
      // re-traversing nodes reachable by more than one path, we return a
      // Number object representing the index of previously seen input
      // objects. We use Number references instead of primitive numbers
      // because references cannot be mistaken for ordinary values found
      // in the input graph. Unfortunately, depth-first scans starting
      // from different root objects will encounter previously seen
      // objects in different places, along different paths, so these
      // numeric references are only meaningful within the traces array of
      // this particular root object. This sensitivity of depth-first
      // traversals to their starting points is the fundamental reason we
      // have to do a separate O(|component|) scan starting from each
      // object in a given strongly connected component. If there was some
      // cheap way to reuse/adapt the traces array of one object as the
      // traces arrays of other objects within the same component, the
      // canonization algorithm could perhaps take closer to linear time,
      // rather than taking time proportional to the sum of the squares of
      // the sizes of the strongly connected components (which is linear
      // for acyclic graphs, but quadratic for highly interconnected
      // graphs with a small number of large components).
      if (seen.has(input)) return seen.get(input)!;
      const nextTraceIndex = traces.length;
      seen.set(input, numRef(nextTraceIndex));

      // Each object we encounter during the scan is identified by a trace
      // array starting with the object's prototype (whose identity is
      // handled like a Map key, never canonized), followed by the scanned
      // children returned by handlers.deconstruct(input). Children that
      // are already canonical, or that belong to components other than
      // rootInfo.component, can be included directly in the trace array,
      // but children in the same rootInfo.component must be recursively
      // scanned, so they can be identified by their canonical structures
      // rather than by their referential identities (since those
      // identities cannot be computed without first computing the
      // identities of every other object in the component, a paradox).
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

      // If we've seen an object with this exact structure before, append
      // the existing node.trace array onto traces. Otherwise append the
      // trace array we just created.
      const node = this.pool.lookupArray(trace);
      return traces[nextTraceIndex] = node.trace || (node.trace = trace);
    };

    // If scan(root) returns the input object unmodified, it must already
    // be canonical, so we can return it immediately. This should never
    // happen, but, if it did happen, the traces array would not be fully
    // populated, so we definitely don't want to proceed any further.
    if (scan(root) === root) return root;

    // Look up the traces array, which represents a canonical depth-first
    // scan of the root object (canonical in the sense that it does not
    // depend on any references in the current rootInfo.component, but
    // merely on the structures of those objects).
    const node = this.pool.lookupArray(traces);

    // If we've ever seen an object with the same structure before,
    // node.known will already be populated with the canonical form of
    // that object. Otherwise, we use handlers.allocate (step 2/3) or
    // handlers.reconstruct (step 2/2) to produce a new canonical
    // reference to serve as node.known.
    if (!node.known) {
      const { handlers } = rootInfo;

      if (isThreeStep(handlers)) {
        // Use handlers.allocate to allocate the canonical node.known
        // reference for the root object, likely still empty/incomplete,
        // to be patched up later, once we have the known references for
        // every object in this component. Any type of object that can
        // contain references back to itself must support allocation,
        // because the only way to (re)create a structure containing
        // cycles is to start with an acyclic mutable object, then modify
        // it to refer back to itself (handlers.repair).
        node.known = handlers.allocate(root);

      } else if (isTwoStep(handlers)) {
        // Two-step handlers are used for types like Buffer that are
        // immutable upon construction, and thus cannot be patched up
        // later using handlers.repair.
        node.known = handlers.reconstruct(rootInfo.children.map(
          // The direct children of an immutable-upon-construction object
          // should never include the object itself, because that would
          // imply the object existed before it was constructed. Under
          // this assumption, this.scan(child, infoMap) should always be
          // able to return a canonical reference for the child, since the
          // child reference never refers directly to the parent object.
          // If the child is not in a cycle with root (likely), and thus
          // belongs to a different component than rootInfo.component,
          // this.scan(child, infoMap) will immediately return a fully
          // canonized object. In the unlikely event that the child is in
          // a cycle with root (and thus belongs to rootInfo.component),
          // the scanned reference may still be incomplete, and will be
          // patched up later.
          child => this.scan(child, infoMap),
        ));
      }
    }

    return rootInfo.known = node.known as Root;
  }
}
