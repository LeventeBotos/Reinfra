import type { RailEdge, RailGraph, RailNode, StationGroup } from "@/src/types/rail";

export type AdjacentEdge = {
  nodeId: number;
  edgeId: number;
  length: number;
};

export type RailGraphIndex = {
  graph: RailGraph;
  nodesById: Map<number, RailNode>;
  edgesById: Map<number, RailEdge>;
  adjacency: Map<number, AdjacentEdge[]>;
  stationGroups: StationGroup[];
  stationGroupsById: Map<string, StationGroup>;
  stationGroupIdByNodeId: Map<number, string>;
};

function normalizeStationName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(platform|peron|vagany|track|gleis|bahnsteig)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildStationGroups(
  graph: RailGraph,
  nodesById: Map<number, RailNode>,
): {
  stationGroups: StationGroup[];
  stationGroupsById: Map<string, StationGroup>;
  stationGroupIdByNodeId: Map<number, string>;
} {
  const buckets = new Map<string, RailNode[]>();

  for (const nodeId of graph.stationIds) {
    const node = nodesById.get(nodeId);
    if (!node) continue;

    const key = node.name
      ? `name:${normalizeStationName(node.name)}`
      : `node:${node.id}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(node);
    buckets.set(key, bucket);
  }

  const stationGroups = Array.from(buckets.entries()).map(([key, nodes]) => {
    const namedNodes = nodes.filter((node) => node.name);
    const displayName =
      namedNodes
        .map((node) => node.name as string)
        .sort((a, b) => a.length - b.length)[0] ?? `Station ${nodes[0].id}`;
    const x = nodes.reduce((sum, node) => sum + node.x, 0) / nodes.length;
    const y = nodes.reduce((sum, node) => sum + node.y, 0) / nodes.length;

    return {
      id: key,
      name: displayName,
      x,
      y,
      platformNodeIds: nodes
        .map((node) => node.id)
        .sort((a, b) => {
          const nodeA = nodesById.get(a);
          const nodeB = nodesById.get(b);
          if (!nodeA || !nodeB) return a - b;
          return nodeA.x === nodeB.x ? nodeA.y - nodeB.y : nodeA.x - nodeB.x;
        }),
    };
  });

  stationGroups.sort((a, b) => a.name.localeCompare(b.name));

  const stationGroupsById = new Map<string, StationGroup>();
  const stationGroupIdByNodeId = new Map<number, string>();
  for (const group of stationGroups) {
    stationGroupsById.set(group.id, group);
    for (const platformId of group.platformNodeIds) {
      stationGroupIdByNodeId.set(platformId, group.id);
    }
  }

  return { stationGroups, stationGroupsById, stationGroupIdByNodeId };
}

export function createGraphIndex(graph: RailGraph): RailGraphIndex {
  const nodesById = new Map<number, RailNode>();
  const edgesById = new Map<number, RailEdge>();
  const adjacency = new Map<number, AdjacentEdge[]>();

  for (const node of graph.nodes) {
    nodesById.set(node.id, node);
    adjacency.set(node.id, []);
  }

  for (const edge of graph.edges) {
    edgesById.set(edge.id, edge);
    adjacency.get(edge.from)?.push({
      nodeId: edge.to,
      edgeId: edge.id,
      length: edge.length,
    });
    adjacency.get(edge.to)?.push({
      nodeId: edge.from,
      edgeId: edge.id,
      length: edge.length,
    });
  }

  const stationIndex = buildStationGroups(graph, nodesById);

  return {
    graph,
    nodesById,
    edgesById,
    adjacency,
    ...stationIndex,
  };
}

export function getStationNodes(index: RailGraphIndex): RailNode[] {
  return index.graph.stationIds
    .map((id) => index.nodesById.get(id))
    .filter((node): node is RailNode => Boolean(node));
}

export function getStationGroups(index: RailGraphIndex): StationGroup[] {
  return index.stationGroups;
}

export function platformLabel(
  group: StationGroup | undefined,
  platformNodeId: number | undefined,
) {
  if (!group || platformNodeId === undefined) return "Auto";
  const index = group.platformNodeIds.indexOf(platformNodeId);
  return index === -1 ? `Node ${platformNodeId}` : `Platform ${index + 1}`;
}
