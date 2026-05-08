import * as turf from "@turf/turf";
import type { CityConfig } from "@/src/game/graph/cityConfig";
import type { RailEdge, RailGraph, RailNode } from "@/src/types/rail";

type OsmNode = {
  type: "node";
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
};

type OsmWay = {
  type: "way";
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
};

type OsmElement = OsmNode | OsmWay;

type OverpassResponse = {
  osm3s?: {
    timestamp_osm_base?: string;
  };
  elements: OsmElement[];
};

type WorkerRequest = {
  type: "fetch-city";
  city: CityConfig;
};

function project(lon: number, lat: number, center: [number, number]) {
  const metersPerDegree = 111_320;
  const latScale = Math.cos((center[1] * Math.PI) / 180);

  return {
    x: (lon - center[0]) * metersPerDegree * latScale,
    y: -(lat - center[1]) * metersPerDegree,
  };
}

function isStationElement(node: OsmNode) {
  const railway = node.tags?.railway;
  const publicTransport = node.tags?.public_transport;
  return (
    railway === "station" ||
    railway === "halt" ||
    railway === "stop" ||
    publicTransport === "station" ||
    publicTransport === "stop_position"
  );
}

function edgeLengthMeters(a: OsmNode, b: OsmNode) {
  return (
    turf.length(
      turf.lineString([
        [a.lon, a.lat],
        [b.lon, b.lat],
      ]),
      { units: "kilometers" },
    ) * 1000
  );
}

function compactPoints(points: number[]) {
  return points.map((point) => Math.round(point));
}

function findNearestNodeId(
  station: OsmNode,
  railNodes: Map<number, OsmNode>,
  projectedNodes: Map<number, { x: number; y: number }>,
  center: [number, number],
) {
  const projectedStation = project(station.lon, station.lat, center);
  let bestId: number | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const [id] of railNodes) {
    const projected = projectedNodes.get(id);
    if (!projected) continue;
    const dx = projected.x - projectedStation.x;
    const dy = projected.y - projectedStation.y;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = id;
    }
  }

  return bestId;
}

function preprocess(city: CityConfig, osm: OverpassResponse): RailGraph {
  const osmNodes = new Map<number, OsmNode>();
  const railNodeSource = new Map<number, OsmNode>();
  const degree = new Map<number, number>();
  const projectedNodes = new Map<number, { x: number; y: number }>();
  const edges: RailEdge[] = [];
  let nextEdgeId = 1;

  for (const element of osm.elements) {
    if (element.type === "node") osmNodes.set(element.id, element);
  }

  const ways = osm.elements.filter(
    (element): element is OsmWay =>
      element.type === "way" &&
      Boolean(element.tags?.railway) &&
      !["abandoned", "razed", "proposed", "construction"].includes(
        element.tags?.railway ?? "",
      ),
  );

  for (const way of ways) {
    for (let index = 1; index < way.nodes.length; index += 1) {
      const from = osmNodes.get(way.nodes[index - 1]);
      const to = osmNodes.get(way.nodes[index]);
      if (!from || !to) continue;

      railNodeSource.set(from.id, from);
      railNodeSource.set(to.id, to);
      degree.set(from.id, (degree.get(from.id) ?? 0) + 1);
      degree.set(to.id, (degree.get(to.id) ?? 0) + 1);

      edges.push({
        id: nextEdgeId++,
        from: from.id,
        to: to.id,
        length: edgeLengthMeters(from, to),
        points: compactPoints([
          project(from.lon, from.lat, city.center).x,
          project(from.lon, from.lat, city.center).y,
          project(to.lon, to.lat, city.center).x,
          project(to.lon, to.lat, city.center).y,
        ]),
        maxSpeed: Number(way.tags?.maxspeed) || undefined,
        electrified: way.tags?.electrified === "yes",
        railway: way.tags?.railway,
        service: way.tags?.service,
        usage: way.tags?.usage,
      });
    }
  }

  for (const [id, node] of railNodeSource) {
    projectedNodes.set(id, project(node.lon, node.lat, city.center));
  }

  const stationIds = new Set<number>();
  for (const element of osm.elements) {
    if (element.type !== "node" || !isStationElement(element)) continue;
    const nearestId = railNodeSource.has(element.id)
      ? element.id
      : findNearestNodeId(element, railNodeSource, projectedNodes, city.center);
    if (nearestId !== undefined) {
      stationIds.add(nearestId);
      const source = railNodeSource.get(nearestId);
      if (source) {
        const stationName = source.tags?.name ?? element.tags?.name;
        source.tags = {
          ...source.tags,
          ...(stationName ? { name: stationName } : {}),
        };
      }
    }
  }

  const nodes: RailNode[] = Array.from(railNodeSource.values()).map((node) => {
    const projected = projectedNodes.get(node.id) ?? project(node.lon, node.lat, city.center);
    const nodeDegree = degree.get(node.id) ?? 0;
    return {
      id: node.id,
      x: Math.round(projected.x),
      y: Math.round(projected.y),
      type: stationIds.has(node.id)
        ? "station"
        : nodeDegree > 2
          ? "junction"
          : "track",
      name: stationIds.has(node.id) ? node.tags?.name : undefined,
    };
  });

  const bounds = nodes.reduce(
    (acc, node) => ({
      minX: Math.min(acc.minX, node.x),
      minY: Math.min(acc.minY, node.y),
      maxX: Math.max(acc.maxX, node.x),
      maxY: Math.max(acc.maxY, node.y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  );

  return {
    cityId: city.id,
    version: 2,
    generatedAt: new Date().toISOString(),
    source: {
      provider: "openstreetmap-overpass",
      attribution:
        "Railway infrastructure data © OpenStreetMap contributors, available under ODbL. OpenRailwayMap renders this OSM railway data.",
      osmBaseTimestamp: osm.osm3s?.timestamp_osm_base,
    },
    nodes,
    edges,
    stationIds: Array.from(stationIds),
    bounds,
  };
}

async function fetchCity(city: CityConfig) {
  const [south, west, north, east] = city.bbox;
  const query = `
    [out:json][timeout:60];
    (
      way["railway"~"^(rail|light_rail|subway|narrow_gauge)$"](${south},${west},${north},${east});
      node["railway"~"^(station|halt|stop)$"](${south},${west},${north},${east});
      node["public_transport"="station"](${south},${west},${north},${east});
    );
    (._;>;);
    out body;
  `;

  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data: query }),
  });

  if (!response.ok) {
    throw new Error(`Overpass request failed with ${response.status}`);
  }

  const osm = (await response.json()) as OverpassResponse;
  return preprocess(city, osm);
}

self.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type !== "fetch-city") return;

  try {
    const graph = await fetchCity(event.data.city);
    self.postMessage({ type: "graph", graph });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "Unknown worker error",
    });
  }
});
