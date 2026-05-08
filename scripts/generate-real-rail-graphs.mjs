import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const CITIES = [
  {
    id: "budapest",
    name: "Budapest",
    bbox: [47.35, 18.82, 47.62, 19.27],
    center: [19.0402, 47.4979],
  },
  {
    id: "vienna",
    name: "Vienna",
    bbox: [48.1, 16.18, 48.32, 16.58],
    center: [16.3738, 48.2082],
  },
  {
    id: "berlin",
    name: "Berlin",
    bbox: [52.34, 13.08, 52.68, 13.76],
    center: [13.405, 52.52],
  },
];

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

function buildQuery(city) {
  const [south, west, north, east] = city.bbox;
  return `
    [out:json][timeout:180];
    (
      way["railway"~"^(rail|light_rail|subway|narrow_gauge)$"](${south},${west},${north},${east});
      node["railway"~"^(station|halt|stop)$"](${south},${west},${north},${east});
      node["public_transport"="station"](${south},${west},${north},${east});
    );
    (._;>;);
    out body qt;
  `;
}

function project(lon, lat, center) {
  const metersPerDegree = 111_320;
  const latScale = Math.cos((center[1] * Math.PI) / 180);

  return {
    x: (lon - center[0]) * metersPerDegree * latScale,
    y: -(lat - center[1]) * metersPerDegree,
  };
}

function haversineMeters(a, b) {
  const radius = 6_371_000;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function isStationElement(node) {
  const railway = node.tags?.railway;
  return (
    railway === "station" ||
    railway === "halt" ||
    railway === "stop" ||
    railway === "tram_stop" ||
    node.tags?.public_transport === "station"
  );
}

function findNearestRailNode(station, railNodes, projectedNodes, center) {
  const projectedStation = project(station.lon, station.lat, center);
  let bestId;
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

  return bestDistance <= 600 * 600 ? bestId : undefined;
}

function parseMaxSpeed(value) {
  if (!value) return undefined;
  const match = String(value).match(/\d+/);
  return match ? Number(match[0]) : undefined;
}

function preprocess(city, osm, query) {
  const osmNodes = new Map();
  const railNodeSource = new Map();
  const projectedNodes = new Map();
  const degree = new Map();
  const edges = [];
  let nextEdgeId = 1;

  for (const element of osm.elements) {
    if (element.type === "node") osmNodes.set(element.id, element);
  }

  const ways = osm.elements.filter(
    (element) =>
      element.type === "way" &&
      element.tags?.railway &&
      !["abandoned", "razed", "proposed", "construction", "disused"].includes(
        element.tags.railway,
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

      const fromProjected = project(from.lon, from.lat, city.center);
      const toProjected = project(to.lon, to.lat, city.center);
      edges.push({
        id: nextEdgeId++,
        from: from.id,
        to: to.id,
        length: Math.round(haversineMeters(from, to)),
        points: [
          Math.round(fromProjected.x),
          Math.round(fromProjected.y),
          Math.round(toProjected.x),
          Math.round(toProjected.y),
        ],
        maxSpeed: parseMaxSpeed(way.tags.maxspeed),
        electrified:
          way.tags.electrified === "yes" || way.tags.electrified === "contact_line",
        railway: way.tags.railway,
        service: way.tags.service,
        usage: way.tags.usage,
      });
    }
  }

  for (const [id, node] of railNodeSource) {
    projectedNodes.set(id, project(node.lon, node.lat, city.center));
  }

  const stationIds = new Set();
  for (const element of osm.elements) {
    if (element.type !== "node" || !isStationElement(element)) continue;
    const nearestId = railNodeSource.has(element.id)
      ? element.id
      : findNearestRailNode(element, railNodeSource, projectedNodes, city.center);

    if (nearestId === undefined) continue;
    stationIds.add(nearestId);
    const source = railNodeSource.get(nearestId);
    if (source) {
      source.tags = {
        ...source.tags,
        name: source.tags?.name ?? element.tags?.name,
      };
    }
  }

  const nodes = Array.from(railNodeSource.values()).map((node) => {
    const projected = projectedNodes.get(node.id);
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
      query: query.trim().replace(/\s+/g, " "),
      osmBaseTimestamp: osm.osm3s?.timestamp_osm_base,
    },
    nodes,
    edges,
    stationIds: Array.from(stationIds),
    bounds,
  };
}

async function fetchOverpass(city) {
  const query = buildQuery(city);
  let lastError;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "user-agent": "Reinfra MVP railway graph generator (local development)",
        },
        body: new URLSearchParams({ data: query }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `${endpoint} returned ${response.status}: ${body.slice(0, 240)}`,
        );
      }

      const osm = await response.json();
      return { osm, query, endpoint };
    } catch (error) {
      lastError = error;
      console.warn(`Overpass fetch failed for ${city.name}: ${error.message}`);
    }
  }

  throw lastError;
}

async function main() {
  const outDir = path.join(process.cwd(), "public", "data");
  await mkdir(outDir, { recursive: true });

  for (const city of CITIES) {
    console.log(`Fetching ${city.name} railway infrastructure...`);
    const { osm, query, endpoint } = await fetchOverpass(city);
    const graph = preprocess(city, osm, query);
    const outPath = path.join(outDir, `${city.id}.graph.json`);
    await writeFile(outPath, `${JSON.stringify(graph)}\n`);
    console.log(
      `${city.name}: ${graph.nodes.length.toLocaleString()} nodes, ${graph.edges.length.toLocaleString()} edges, ${graph.stationIds.length.toLocaleString()} stations from ${endpoint}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
