"use client";

import { create } from "zustand";
import { CITY_CONFIG_BY_ID, type CityConfig } from "@/src/game/graph/cityConfig";
import type {
  CameraState,
  PendingRoute,
  RailGraph,
  TrainRoute,
} from "@/src/types/rail";

type PersistedGameState = {
  selectedCityId: CityConfig["id"];
  cameraByCity: Partial<Record<CityConfig["id"], CameraState>>;
  routes: TrainRoute[];
};

type GameState = PersistedGameState & {
  graph?: RailGraph;
  hasHydrated: boolean;
  selectedStationId?: string;
  draftOriginId?: string;
  pendingRoute?: PendingRoute;
  hydratePersistedState: () => void;
  setSelectedCity: (cityId: CityConfig["id"]) => void;
  setGraph: (graph: RailGraph) => void;
  setCamera: (cityId: CityConfig["id"], camera: CameraState) => void;
  selectStation: (stationId: string) => void;
  setDraftOrigin: (stationId?: string) => void;
  setPendingRoute: (pendingRoute?: PendingRoute) => void;
  savePendingRoute: (name: string, color: string) => void;
  removeRoute: (routeId: string) => void;
};

const STORAGE_KEY = "reinfra-game-state-v1";

function readPersistedState(): PersistedGameState {
  const fallback: PersistedGameState = {
    selectedCityId: "budapest",
    cameraByCity: {},
    routes: [],
  };

  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as PersistedGameState) };
  } catch {
    return fallback;
  }
}

function persist(state: PersistedGameState) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      selectedCityId: state.selectedCityId,
      cameraByCity: state.cameraByCity,
      routes: state.routes,
    }),
  );
}

const initialState: PersistedGameState = {
  selectedCityId: "budapest",
  cameraByCity: {},
  routes: [],
};

export const useGameStore = create<GameState>((set, get) => ({
  ...initialState,
  hasHydrated: false,
  hydratePersistedState: () => {
    if (get().hasHydrated) return;
    set({ ...readPersistedState(), hasHydrated: true });
  },
  setSelectedCity: (selectedCityId) => {
    set({
      selectedCityId,
      graph: undefined,
      selectedStationId: undefined,
      draftOriginId: undefined,
      pendingRoute: undefined,
    });
    persist(get());
  },
  setGraph: (graph) => set({ graph }),
  setCamera: (cityId, camera) => {
    set((state) => ({
      cameraByCity: {
        ...state.cameraByCity,
        [cityId]: camera,
      },
    }));
    persist(get());
  },
  selectStation: (selectedStationId) => set({ selectedStationId }),
  setDraftOrigin: (draftOriginId) =>
    set({ draftOriginId, pendingRoute: undefined }),
  setPendingRoute: (pendingRoute) => set({ pendingRoute }),
  savePendingRoute: (name, color) => {
    const state = get();
    if (!state.pendingRoute) return;

    const route: TrainRoute = {
      id: crypto.randomUUID(),
      name,
      color,
      nodeIds: state.pendingRoute.nodeIds,
      edgeIds: state.pendingRoute.edgeIds,
      originStationId: state.pendingRoute.originId,
      destinationStationId: state.pendingRoute.destinationId,
      originPlatformId: state.pendingRoute.originPlatformId,
      destinationPlatformId: state.pendingRoute.destinationPlatformId,
      cityId: state.selectedCityId,
      distance: state.pendingRoute.distance,
      createdAt: new Date().toISOString(),
    };

    set((current) => ({
      routes: [...current.routes, route],
      draftOriginId: undefined,
      pendingRoute: undefined,
    }));
    persist(get());
  },
  removeRoute: (routeId) => {
    set((state) => ({
      routes: state.routes.filter((route) => route.id !== routeId),
    }));
    persist(get());
  },
}));

export function getInitialCamera(cityId: CityConfig["id"]) {
  const state = useGameStore.getState();
  return state.cameraByCity[cityId] ?? CITY_CONFIG_BY_ID[cityId].initialCamera;
}
