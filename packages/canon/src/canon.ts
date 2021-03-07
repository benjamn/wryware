import { Trie } from "@wry/trie";

import {
  Node,
  getPrototypeOf,
  isObjectOrArray,
  numRef,
} from "./helpers";

import {
  Info,
  Component,
  ComponentInfoMap,
  buildComponentInfoMap,
} from "./components";

import {
  PrototypeHandlers,
  ThreeStepHandlers,
  isTwoStep,
  isThreeStep,
  TwoStepHandlers,
} from "./handlers";

export class Canon {
  public readonly handlers = new PrototypeHandlers;

  private known = new WeakSet<object>();
  private pool = new Trie<Node>(true);

  public pass<T>(value: T): T {
    if (isObjectOrArray(value) && !this.known.has(value)) {
      this.handlers.ignore(value);
    }
    return value;
  }

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
    return this.getKnown(
      value,
      buildComponentInfoMap(value, this),
    );
  }

  private getKnown(
    input: object,
    infoMap: ComponentInfoMap,
  ): object {
    const info = infoMap.get(input);
    if (!info) return input;
    if (!info.known) {
      const node = this.lookupNode(input, infoMap);
      if (node.known) {
        return info.known = node.known;
      }

      const {
        twoSteps,
        threeSteps,
      } = this.partitionBySteps(info.component, infoMap);

      if (twoSteps && twoSteps.length) {
        this.reconstruct(twoSteps, infoMap);
      }

      if (threeSteps && threeSteps.length) {
        this.repair(threeSteps, infoMap);
      }

      if (!info.known) {
        throw new Error("could not resolve known value");
      }
    }

    return info.known;
  }

  private partitionBySteps(
    component: Component,
    infoMap: ComponentInfoMap,
  ): {
    twoSteps?: object[];
    threeSteps?: object[];
  } {
    // Only the first caller of partitionBySteps gets back actual twoSteps
    // and threeSteps arrays.
    if (component.partitioned) return {};
    if (component.partitioned === false) {
      throw new Error("already partitioning");
    }
    // Marking this property false indicates that we've started partitioning
    // the component but have not yet finished.
    component.partitioned = false;

    const twoSteps: object[] = [];
    const threeSteps: object[] = [];

    const nodesByInput = new Map<object, Node>();
    let expectedNodeCount = component.size;

    while (true) {
      const seenNodes = new Set<Node>();
      const nextNodesByInput = new Map<object, Node>();
      const alreadyCanonized = component.asArray.some(input => {
        const node = this.lookupNode(input, infoMap, nodesByInput);
        // What does this tell us about the rest of the component?
        if (node.known) return true;
        seenNodes.add(node);
        if (nodesByInput.get(input) !== node) {
          nextNodesByInput.set(input, node);
        }
      });

      if (
        alreadyCanonized ||
        (seenNodes.size === expectedNodeCount && !nextNodesByInput.size)
      ) {
        break;
      }

      expectedNodeCount = seenNodes.size;

      // If we saw fewer Node objects than input objects, that means we
      // found some symmetries within this component, and we must perform
      // the lookup loop again with new labels.
      nextNodesByInput.forEach((label, input) => {
        nodesByInput.set(input, label);
      });
    }

    forEachUnknown(component.asArray, infoMap, (info, input) => {
      if (isThreeStep(info.handlers)) {
        // Use handlers.allocate to allocate the canonical node.known
        // reference for the input object, likely still empty/incomplete,
        // to be patched up later, once we have the known references for
        // every object in this component. Any type of object that can
        // contain references back to itself must support allocation,
        // because the only way to (re)create a structure containing
        // cycles is to start with an acyclic mutable object, then modify
        // it to refer back to itself (handlers.repair).
        info.known = info.handlers.allocate(input);
        threeSteps.push(input);
      } else if (isTwoStep(info.handlers)) {
        twoSteps.push(input);
      }
    });

    // Having now finished partitioning, update component.partitioned from
    // false to true, allowing future callers to return {} immediately.
    component.partitioned = true;

    return { twoSteps, threeSteps };
  }

  private reconstruct(
    twoSteps: object[],
    infoMap: ComponentInfoMap,
  ) {
    forEachUnknown(twoSteps, infoMap, info => {
      // TODO What keeps this code from reconstructing the same object
      // more than once? Need to use node.known to deduplicate too?
      info.known = (info.handlers as TwoStepHandlers).reconstruct(
        info.children.map(child => this.getKnown(child, infoMap)),
      );
      this.known.add(info.known);
    });
  }

  private repair(
    threeSteps: object[],
    infoMap: ComponentInfoMap,
  ) {
    const repaired = new Set<object>();

    // Unfortunately we can't reuse forEachUnknown here, because we need to
    // repair existing info.known objects, not skip them.
    threeSteps.forEach(input => {
      const info = infoMap.get(input);
      if (info && info.known) {
        // Multiple input objects (and thus multiple Info objects) can end
        // up with the same info.known reference, so it's important to
        // store known references in the repaired set (rather than input
        // references), to prevent repairing the same known object more
        // than once. This idempotence matters not only for performance
        // but also to avoid attempting to modify objects after they've
        // been frozen and canonized.
        if (repaired.has(info.known)) return;
        repaired.add(info.known);

        (info.handlers as ThreeStepHandlers).repair(
          info.known,
          info.children.map(child => this.getKnown(child, infoMap)),
        );

        // Freeze the known object and officially admit it into the Canon.
        this.known.add(Object.freeze(info.known));
      }
    });
  }

  private lookupNode(
    root: object,
    infoMap: ComponentInfoMap,
    labels?: Map<object, object>,
  ): Node {
    const rootInfo = infoMap.get(root)!;
    // The capital N in Number is not a typo (see comments below).
    const seenLabels = new Map<object, Number>();
    const traces: object[] = [];

    const scan = (input: object) => {
      if (this.known.has(input)) return input;

      const info = infoMap.get(input);
      if (!info) return input;

      // To avoid endlessly re-traversing cycles, and also to avoid
      // re-traversing nodes reachable by more than one path, we return a
      // Number object representing the index of any previously seen input
      // object. We use Number references instead of primitive numbers
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
      const label = labels && labels.get(input) || input;
      if (seenLabels.has(label)) return seenLabels.get(label)!;
      const nextTraceIndex = traces.length;
      seenLabels.set(label, numRef(nextTraceIndex));

      const trace = [getPrototypeOf(input)];
      traces[nextTraceIndex] = null as any;

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
      info.children.forEach(child => {
        if (this.isCanonical(child)) {
          trace.push(child);
        } else if (rootInfo.component.has(child)) {
          trace.push(scan(child));
        } else {
          // It's safe to call getKnown for children outside this component,
          // because the child's canonical identity does not depend on the
          // identity of any objects in the component, so we can compute (or
          // retrieve) the child's identity immediately.
          trace.push(this.getKnown(child, infoMap));
        }
      });

      // If we've seen an object with this exact structure before, append
      // the existing node.trace array onto traces. Otherwise append the
      // trace array we just created.
      const node = this.pool.lookupArray(trace);
      return traces[nextTraceIndex] = node.trace || (node.trace = trace);
    };

    // If scan(root) returns the input object unmodified, it must already
    // be canonical. This should never happen, but, if it did happen, the
    // traces array would not be fully populated, so we definitely don't
    // want to proceed any further.
    if (scan(root) === root) {
      throw new Error("root already canonical");
    }

    // Look up the traces array, which represents a canonical depth-first
    // scan of the root object (canonical in the sense that it does not
    // depend on any references in the current rootInfo.component, but
    // merely on the structures of those objects).
    const node = this.pool.lookupArray(traces);
    const rootNodes = rootInfo.nodes || (rootInfo.nodes = new Set);
    rootNodes.add(node);

    return node;
  }
}

function forEachUnknown(
  objects: object[],
  infoMap: ComponentInfoMap,
  callback: (info: Info, input: object) => any,
) {
  objects.forEach(input => {
    const info = infoMap.get(input)!;
    if (!info || info.known) return;

    let known: object | undefined;
    const unknownNodes: Node[] = [];

    info.nodes!.forEach(node => {
      if (node.known) {
        known = known || node.known;
      } else {
        unknownNodes.push(node);
      }
    });

    if (known) {
      info.known = known;
    } else {
      callback(info, input);
      known = info.known;
    }

    if (known) {
      unknownNodes.forEach(node => node.known = known);
    }
  });
}
