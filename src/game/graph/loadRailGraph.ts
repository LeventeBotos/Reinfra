import { CITY_CONFIG_BY_ID, type CityConfig } from "@/src/game/graph/cityConfig";
import { idbGet, idbSet } from "@/src/lib/idb";
import type { RailGraph } from "@/src/types/rail";

type PreprocessWorkerRequest = {
  type: "fetch-city";
  city: CityConfig;
};

type PreprocessWorkerResponse =
  | { type: "graph"; graph: RailGraph }
  | { type: "error"; message: string };

const GRAPH_CACHE_PREFIX = "rail-graph";
const GRAPH_CACHE_VERSION = 3;

function cacheKey(cityId: string) {
  return `${GRAPH_CACHE_PREFIX}:${cityId}:v${GRAPH_CACHE_VERSION}`;
}

async function fetchSeedGraph(city: CityConfig): Promise<RailGraph | undefined> {
  const response = await fetch(`${city.dataUrl}?v=${GRAPH_CACHE_VERSION}`, {
    cache: "no-store",
  });
  if (!response.ok) return undefined;
  return (await response.json()) as RailGraph;
}

function fetchOverpassGraph(city: CityConfig): Promise<RailGraph> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../../workers/railPreprocess.worker.ts", import.meta.url),
      { type: "module" },
    );

    worker.onmessage = (event: MessageEvent<PreprocessWorkerResponse>) => {
      worker.terminate();
      if (event.data.type === "graph") {
        resolve(event.data.graph);
      } else {
        reject(new Error(event.data.message));
      }
    };

    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message));
    };

    const message: PreprocessWorkerRequest = { type: "fetch-city", city };
    worker.postMessage(message);
  });
}

export async function loadRailGraph(cityId: CityConfig["id"]): Promise<RailGraph> {
  const city = CITY_CONFIG_BY_ID[cityId];
  const key = cacheKey(city.id);
  const cached = await idbGet<RailGraph>(key);
  if (cached) return cached;

  const seeded = await fetchSeedGraph(city);
  if (seeded) {
    await idbSet(key, seeded);
    return seeded;
  }

  const generated = await fetchOverpassGraph(city);
  await idbSet(key, generated);
  return generated;
}
