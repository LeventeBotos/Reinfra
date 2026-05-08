import type { CameraState } from "@/src/types/rail";

export type CityConfig = {
  id: "budapest" | "vienna" | "berlin";
  name: string;
  country: string;
  bbox: [south: number, west: number, north: number, east: number];
  center: [lon: number, lat: number];
  dataUrl: string;
  initialCamera: CameraState;
};

export const CITY_CONFIGS: CityConfig[] = [
  {
    id: "budapest",
    name: "Budapest",
    country: "Hungary",
    bbox: [47.35, 18.82, 47.62, 19.27],
    center: [19.0402, 47.4979],
    dataUrl: "/data/budapest.graph.json",
    initialCamera: { x: 0, y: 0, zoom: 0.024 },
  },
  {
    id: "vienna",
    name: "Vienna",
    country: "Austria",
    bbox: [48.1, 16.18, 48.32, 16.58],
    center: [16.3738, 48.2082],
    dataUrl: "/data/vienna.graph.json",
    initialCamera: { x: 0, y: 0, zoom: 0.032 },
  },
  {
    id: "berlin",
    name: "Berlin",
    country: "Germany",
    bbox: [52.34, 13.08, 52.68, 13.76],
    center: [13.405, 52.52],
    dataUrl: "/data/berlin.graph.json",
    initialCamera: { x: 0, y: 0, zoom: 0.019 },
  },
];

export const CITY_CONFIG_BY_ID = Object.fromEntries(
  CITY_CONFIGS.map((city) => [city.id, city]),
) as Record<CityConfig["id"], CityConfig>;
