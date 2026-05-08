export type RailNodeType = "station" | "junction" | "track";

export type RailNode = {
  id: number;
  x: number;
  y: number;
  type: RailNodeType;
  name?: string;
};

export type RailEdge = {
  id: number;
  from: number;
  to: number;
  length: number;
  points?: number[];
  maxSpeed?: number;
  electrified?: boolean;
  railway?: string;
  service?: string;
  usage?: string;
};

export type RailGraph = {
  cityId: string;
  version: number;
  generatedAt: string;
  source?: {
    provider: "openstreetmap-overpass";
    attribution: string;
    query?: string;
    osmBaseTimestamp?: string;
  };
  nodes: RailNode[];
  edges: RailEdge[];
  stationIds: number[];
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
};

export type CameraState = {
  x: number;
  y: number;
  zoom: number;
};

export type StationGroup = {
  id: string;
  name: string;
  x: number;
  y: number;
  platformNodeIds: number[];
};

export type TrainRoute = {
  id: string;
  name: string;
  color: string;
  nodeIds: number[];
  edgeIds?: number[];
  originStationId?: string;
  destinationStationId?: string;
  originPlatformId?: number;
  destinationPlatformId?: number;
  cityId: string;
  distance: number;
  createdAt: string;
};

export type PendingRoute = {
  originId: string;
  destinationId: string;
  originPlatformId: number;
  destinationPlatformId: number;
  nodeIds: number[];
  edgeIds: number[];
  distance: number;
};
