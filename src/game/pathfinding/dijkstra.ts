import type { RailGraphIndex } from "@/src/game/graph/graphIndex";

export type PathResult = {
  nodeIds: number[];
  edgeIds: number[];
  distance: number;
};

type QueueItem = {
  nodeId: number;
  priority: number;
};

class MinQueue {
  private heap: QueueItem[] = [];

  get size() {
    return this.heap.length;
  }

  push(item: QueueItem) {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): QueueItem | undefined {
    const first = this.heap[0];
    const last = this.heap.pop();
    if (!first || !last) return first;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return first;
  }

  private bubbleUp(index: number) {
    const item = this.heap[index];
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      const parent = this.heap[parentIndex];
      if (item.priority >= parent.priority) break;
      this.heap[parentIndex] = item;
      this.heap[index] = parent;
      index = parentIndex;
    }
  }

  private sinkDown(index: number) {
    const length = this.heap.length;
    const item = this.heap[index];

    while (true) {
      const leftIndex = index * 2 + 1;
      const rightIndex = leftIndex + 1;
      let swapIndex = -1;

      if (leftIndex < length) {
        const left = this.heap[leftIndex];
        if (left.priority < item.priority) {
          swapIndex = leftIndex;
        }
      }

      if (rightIndex < length) {
        const right = this.heap[rightIndex];
        const comparePriority =
          swapIndex === -1 ? item.priority : this.heap[leftIndex].priority;
        if (right.priority < comparePriority) {
          swapIndex = rightIndex;
        }
      }

      if (swapIndex === -1) break;
      this.heap[index] = this.heap[swapIndex];
      this.heap[swapIndex] = item;
      index = swapIndex;
    }
  }
}

export function findShortestPath(
  index: RailGraphIndex,
  originId: number,
  destinationId: number,
): PathResult | undefined {
  if (originId === destinationId) {
    return { nodeIds: [originId], edgeIds: [], distance: 0 };
  }

  const distances = new Map<number, number>();
  const previous = new Map<number, number>();
  const previousEdge = new Map<number, number>();
  const queue = new MinQueue();

  distances.set(originId, 0);
  queue.push({ nodeId: originId, priority: 0 });

  while (queue.size > 0) {
    const current = queue.pop();
    if (!current) break;

    if (current.nodeId === destinationId) {
      break;
    }

    const knownDistance = distances.get(current.nodeId);
    if (knownDistance === undefined || current.priority > knownDistance) {
      continue;
    }

    const adjacentEdges = index.adjacency.get(current.nodeId) ?? [];
    for (const edge of adjacentEdges) {
      const nextDistance = knownDistance + edge.length;
      const existingDistance = distances.get(edge.nodeId);
      if (existingDistance !== undefined && existingDistance <= nextDistance) {
        continue;
      }

      distances.set(edge.nodeId, nextDistance);
      previous.set(edge.nodeId, current.nodeId);
      previousEdge.set(edge.nodeId, edge.edgeId);
      queue.push({ nodeId: edge.nodeId, priority: nextDistance });
    }
  }

  const distance = distances.get(destinationId);
  if (distance === undefined) return undefined;

  const nodeIds = [destinationId];
  const edgeIds: number[] = [];
  let cursor = destinationId;
  while (cursor !== originId) {
    const next = previous.get(cursor);
    const edgeId = previousEdge.get(cursor);
    if (next === undefined) return undefined;
    if (edgeId === undefined) return undefined;
    edgeIds.push(edgeId);
    nodeIds.push(next);
    cursor = next;
  }

  nodeIds.reverse();
  edgeIds.reverse();
  return { nodeIds, edgeIds, distance };
}
