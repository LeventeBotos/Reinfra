"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CITY_CONFIGS, CITY_CONFIG_BY_ID } from "@/src/game/graph/cityConfig";
import {
  createGraphIndex,
  getStationGroups,
  platformLabel,
  type RailGraphIndex,
} from "@/src/game/graph/graphIndex";
import { loadRailGraph } from "@/src/game/graph/loadRailGraph";
import { findShortestPath } from "@/src/game/pathfinding/dijkstra";
import { RailCanvas } from "@/src/components/RailCanvas";
import { getInitialCamera, useGameStore } from "@/src/store/gameStore";
import type { PendingRoute, StationGroup } from "@/src/types/rail";

const ROUTE_COLORS = [
  "#5eead4",
  "#f3c969",
  "#f472b6",
  "#60a5fa",
  "#a7f36b",
  "#fb7185",
];

function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function findBestPlatformPath(
  index: RailGraphIndex,
  origin: StationGroup,
  destination: StationGroup,
  originPlatformId?: number,
  destinationPlatformId?: number,
): PendingRoute | undefined {
  const originPlatformIds =
    originPlatformId === undefined ? origin.platformNodeIds : [originPlatformId];
  const destinationPlatformIds =
    destinationPlatformId === undefined
      ? destination.platformNodeIds
      : [destinationPlatformId];
  let best: PendingRoute | undefined;

  for (const from of originPlatformIds) {
    for (const to of destinationPlatformIds) {
      if (from === to) continue;
      const path = findShortestPath(index, from, to);
      if (!path) continue;
      if (best && best.distance <= path.distance) continue;

      best = {
        originId: origin.id,
        destinationId: destination.id,
        originPlatformId: from,
        destinationPlatformId: to,
        nodeIds: path.nodeIds,
        edgeIds: path.edgeIds,
        distance: path.distance,
      };
    }
  }

  return best;
}

export function ReinfraApp() {
  const selectedCityId = useGameStore((state) => state.selectedCityId);
  const graph = useGameStore((state) => state.graph);
  const setGraph = useGameStore((state) => state.setGraph);
  const setSelectedCity = useGameStore((state) => state.setSelectedCity);
  const hydratePersistedState = useGameStore((state) => state.hydratePersistedState);
  const selectedStationId = useGameStore((state) => state.selectedStationId);
  const draftOriginId = useGameStore((state) => state.draftOriginId);
  const pendingRoute = useGameStore((state) => state.pendingRoute);
  const allRoutes = useGameStore((state) => state.routes);
  const selectStation = useGameStore((state) => state.selectStation);
  const setDraftOrigin = useGameStore((state) => state.setDraftOrigin);
  const setPendingRoute = useGameStore((state) => state.setPendingRoute);
  const savePendingRoute = useGameStore((state) => state.savePendingRoute);
  const removeRoute = useGameStore((state) => state.removeRoute);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [routeName, setRouteName] = useState("");
  const [routeColor, setRouteColor] = useState(ROUTE_COLORS[0]);

  useEffect(() => {
    hydratePersistedState();
  }, [hydratePersistedState]);

  const index = useMemo(() => (graph ? createGraphIndex(graph) : undefined), [graph]);
  const stations = useMemo(() => (index ? getStationGroups(index) : []), [index]);
  const routes = useMemo(
    () => allRoutes.filter((route) => route.cityId === selectedCityId),
    [allRoutes, selectedCityId],
  );
  const initialCamera = useMemo(
    () => getInitialCamera(selectedCityId),
    [selectedCityId],
  );
  const selectedStation = selectedStationId
    ? index?.stationGroupsById.get(selectedStationId)
    : undefined;
  const originStation = draftOriginId
    ? index?.stationGroupsById.get(draftOriginId)
    : undefined;
  const destinationStation = pendingRoute
    ? index?.stationGroupsById.get(pendingRoute.destinationId)
    : undefined;

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;
      setLoadState("loading");
      setErrorMessage("");
    });

    loadRailGraph(selectedCityId)
      .then((nextGraph) => {
        if (cancelled) return;
        setGraph(nextGraph);
        setLoadState("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadState("error");
        setErrorMessage(
          error instanceof Error ? error.message : "Unable to load rail graph",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCityId, setGraph]);

  const handleStationClick = useCallback(
    (stationId: string) => {
      if (!index) return;
      const station = index.stationGroupsById.get(stationId);
      if (!station) return;

      selectStation(stationId);

      if (!draftOriginId) {
        setDraftOrigin(stationId);
        setPendingRoute(undefined);
        return;
      }

      if (draftOriginId === stationId) {
        setDraftOrigin(undefined);
        setPendingRoute(undefined);
        return;
      }

      const origin = index.stationGroupsById.get(draftOriginId);
      if (!origin) return;

      const nextPendingRoute = findBestPlatformPath(index, origin, station);
      if (!nextPendingRoute) return;

      setPendingRoute(nextPendingRoute);
      setRouteName(`${origin.name} - ${station.name}`);
    },
    [draftOriginId, index, selectStation, setDraftOrigin, setPendingRoute],
  );

  const updateRoutePlatform = (
    side: "origin" | "destination",
    platformId: number,
  ) => {
    if (!index || !pendingRoute) return;
    const origin = index.stationGroupsById.get(pendingRoute.originId);
    const destination = index.stationGroupsById.get(pendingRoute.destinationId);
    if (!origin || !destination) return;

    const nextPendingRoute = findBestPlatformPath(
      index,
      origin,
      destination,
      side === "origin" ? platformId : pendingRoute.originPlatformId,
      side === "destination" ? platformId : pendingRoute.destinationPlatformId,
    );

    if (nextPendingRoute) {
      setPendingRoute(nextPendingRoute);
    }
  };

  const saveRoute = () => {
    if (!pendingRoute) return;
    savePendingRoute(routeName || `Route ${routes.length + 1}`, routeColor);
    setRouteColor(ROUTE_COLORS[(routes.length + 1) % ROUTE_COLORS.length]);
  };

  const routeNodeCount = graph?.nodes.length ?? 0;
  const routeEdgeCount = graph?.edges.length ?? 0;

  return (
    <main className="min-h-screen bg-[#090d12] text-slate-100">
      <div className="grid h-screen grid-cols-[340px_1fr] max-lg:grid-cols-1 max-lg:grid-rows-[auto_1fr]">
        <aside className="z-10 flex min-h-0 flex-col border-r border-white/10 bg-[#101720]/95 shadow-2xl shadow-black/30 backdrop-blur max-lg:max-h-[46vh] max-lg:border-b max-lg:border-r-0">
          <div className="border-b border-white/10 px-5 py-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-white">
                  Reinfra
                </h1>
                <p className="mt-1 text-xs uppercase tracking-[0.26em] text-cyan-200/70">
                  Railway planning sandbox
                </p>
              </div>
              <div className="rounded border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 font-mono text-[11px] text-cyan-100">
                MVP
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <section className="space-y-3">
              <label className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                City
              </label>
              <div className="grid grid-cols-3 gap-2">
                {CITY_CONFIGS.map((city) => (
                  <button
                    key={city.id}
                    type="button"
                    onClick={() => setSelectedCity(city.id)}
                    className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                      city.id === selectedCityId
                        ? "border-cyan-300/70 bg-cyan-300/15 text-cyan-50"
                        : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25 hover:bg-white/[0.06]"
                    }`}
                  >
                    {city.name}
                  </button>
                ))}
              </div>
            </section>

            <section className="mt-6 grid grid-cols-3 gap-2">
              <Metric label="Nodes" value={routeNodeCount.toLocaleString()} />
              <Metric label="Edges" value={routeEdgeCount.toLocaleString()} />
              <Metric label="Stations" value={stations.length.toLocaleString()} />
            </section>

            {graph?.source ? (
              <section className="mt-3 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-[11px] leading-5 text-slate-400">
                <div className="text-cyan-100">OpenStreetMap / Overpass extract</div>
                <div>
                  Base timestamp:{" "}
                  {graph.source.osmBaseTimestamp
                    ? new Date(graph.source.osmBaseTimestamp).toLocaleString()
                    : "recorded in graph file"}
                </div>
              </section>
            ) : null}

            <section className="mt-6 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
                  Route creation
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setDraftOrigin(undefined);
                    setPendingRoute(undefined);
                  }}
                  className="text-xs text-slate-400 transition hover:text-slate-100"
                >
                  Clear
                </button>
              </div>

              <div className="rounded-md border border-white/10 bg-black/20 p-3">
                <StationLine
                  label="Origin"
                  station={originStation}
                  platformId={pendingRoute?.originPlatformId}
                />
                <StationLine
                  label="Destination"
                  station={destinationStation}
                  platformId={pendingRoute?.destinationPlatformId}
                />
                <div className="mt-3 border-t border-white/10 pt-3 text-xs leading-5 text-slate-400">
                  Click a station to set the origin, then click another station to
                  calculate the shortest path on the loaded rail graph.
                </div>
              </div>

              {pendingRoute ? (
                <div className="space-y-3 rounded-md border border-cyan-300/20 bg-cyan-300/10 p-3">
                  <input
                    value={routeName}
                    onChange={(event) => setRouteName(event.target.value)}
                    className="h-9 w-full rounded border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/60"
                  />
                  <PlatformSelect
                    label="Origin platform"
                    station={originStation}
                    value={pendingRoute.originPlatformId}
                    onChange={(platformId) => updateRoutePlatform("origin", platformId)}
                  />
                  <PlatformSelect
                    label="Destination platform"
                    station={destinationStation}
                    value={pendingRoute.destinationPlatformId}
                    onChange={(platformId) =>
                      updateRoutePlatform("destination", platformId)
                    }
                  />
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex gap-1.5">
                      {ROUTE_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          aria-label={`Use route color ${color}`}
                          onClick={() => setRouteColor(color)}
                          className={`h-6 w-6 rounded-full border ${
                            routeColor === color
                              ? "border-white"
                              : "border-white/20"
                          }`}
                          style={{ background: color }}
                        />
                      ))}
                    </div>
                    <span className="font-mono text-xs text-cyan-100">
                      {formatDistance(pendingRoute.distance)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={saveRoute}
                    className="h-9 w-full rounded-md bg-cyan-300 px-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
                  >
                    Save route
                  </button>
                </div>
              ) : null}
            </section>

            <section className="mt-6 space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
                Active routes
              </h2>
              {routes.length === 0 ? (
                <div className="rounded-md border border-dashed border-white/10 px-3 py-5 text-center text-sm text-slate-500">
                  No routes saved for {CITY_CONFIG_BY_ID[selectedCityId].name}.
                </div>
              ) : (
                <div className="space-y-2">
                  {routes.map((route) => (
                    <div
                      key={route.id}
                      className="rounded-md border border-white/10 bg-white/[0.035] p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ background: route.color }}
                          />
                          <span className="truncate text-sm font-medium text-slate-100">
                            {route.name}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeRoute(route.id)}
                          className="text-xs text-slate-500 transition hover:text-rose-200"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="mt-2 font-mono text-[11px] text-slate-500">
                        {route.nodeIds.length} nodes / {formatDistance(route.distance)}
                      </div>
                      {index && route.originStationId && route.destinationStationId ? (
                        <div className="mt-1 font-mono text-[11px] text-slate-500">
                          {platformLabel(
                            index.stationGroupsById.get(route.originStationId),
                            route.originPlatformId,
                          )}{" "}
                          -{" "}
                          {platformLabel(
                            index.stationGroupsById.get(route.destinationStationId),
                            route.destinationPlatformId,
                          )}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </aside>

        <section className="relative min-h-0 overflow-hidden">
          {graph && loadState === "ready" ? (
            <RailCanvas
              key={graph.cityId}
              graph={graph}
              initialCamera={initialCamera}
              onStationClick={handleStationClick}
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-[#090d12]">
              <div className="rounded-md border border-white/10 bg-[#101720] px-5 py-4 text-sm text-slate-300">
                {loadState === "error"
                  ? `Rail graph load failed: ${errorMessage}`
                  : "Loading rail graph..."}
              </div>
            </div>
          )}

          <div className="pointer-events-none absolute right-4 top-4 rounded-md border border-white/10 bg-[#101720]/85 px-3 py-2 font-mono text-[11px] text-slate-400 backdrop-blur">
            Wheel zoom / drag pan / station click pathfind
          </div>

          <div className="pointer-events-none absolute bottom-4 right-4 rounded-md border border-white/10 bg-[#101720]/85 px-3 py-2 font-mono text-[10px] text-slate-500 backdrop-blur">
            Map tiles © OpenStreetMap contributors © CARTO
          </div>

          {selectedStation ? (
            <div className="absolute bottom-4 left-4 max-w-xs rounded-md border border-white/10 bg-[#101720]/90 p-3 shadow-xl shadow-black/30 backdrop-blur">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Selected station
              </div>
              <div className="mt-1 text-sm font-semibold text-white">
                {selectedStation.name}
              </div>
              <div className="mt-2 font-mono text-[11px] text-slate-500">
                {selectedStation.platformNodeIds.length} platform
                {selectedStation.platformNodeIds.length === 1 ? "" : "s"} / x{" "}
                {Math.round(selectedStation.x)} / y {Math.round(selectedStation.y)}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] px-3 py-2">
      <div className="font-mono text-lg text-slate-100">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-500">
        {label}
      </div>
    </div>
  );
}

function StationLine({
  label,
  station,
  platformId,
}: {
  label: string;
  station?: StationGroup;
  platformId?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="min-w-0 truncate text-right text-slate-100">
        {station
          ? `${station.name} · ${platformLabel(station, platformId)}`
          : "Click station"}
      </span>
    </div>
  );
}

function PlatformSelect({
  label,
  station,
  value,
  onChange,
}: {
  label: string;
  station?: StationGroup;
  value: number;
  onChange: (platformId: number) => void;
}) {
  if (!station) return null;

  return (
    <label className="grid grid-cols-[1fr_auto] items-center gap-3 text-xs text-slate-400">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-8 max-w-[170px] rounded border border-white/10 bg-black/30 px-2 text-xs text-slate-100 outline-none transition focus:border-cyan-300/60"
      >
        {station.platformNodeIds.map((platformNodeId) => (
          <option key={platformNodeId} value={platformNodeId}>
            {platformLabel(station, platformNodeId)} · node {platformNodeId}
          </option>
        ))}
      </select>
    </label>
  );
}
