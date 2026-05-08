"use client";

import { useEffect, useMemo, useRef } from "react";
import { CITY_CONFIG_BY_ID } from "@/src/game/graph/cityConfig";
import { createGraphIndex } from "@/src/game/graph/graphIndex";
import { RailRenderer } from "@/src/game/rendering/RailRenderer";
import { useGameStore } from "@/src/store/gameStore";
import type { CameraState, RailGraph } from "@/src/types/rail";

type RailCanvasProps = {
  graph: RailGraph;
  initialCamera: CameraState;
  onStationClick: (stationId: string) => void;
};

export function RailCanvas({
  graph,
  initialCamera,
  onStationClick,
}: RailCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<RailRenderer | null>(null);
  const clickRef = useRef(onStationClick);
  const selectedCityId = useGameStore((state) => state.selectedCityId);
  const allRoutes = useGameStore((state) => state.routes);
  const pendingRoute = useGameStore((state) => state.pendingRoute);
  const selectedStationId = useGameStore((state) => state.selectedStationId);
  const draftOriginId = useGameStore((state) => state.draftOriginId);
  const setCamera = useGameStore((state) => state.setCamera);
  const index = useMemo(() => createGraphIndex(graph), [graph]);
  const routes = useMemo(
    () => allRoutes.filter((route) => route.cityId === selectedCityId),
    [allRoutes, selectedCityId],
  );

  useEffect(() => {
    clickRef.current = onStationClick;
  }, [onStationClick]);

  useEffect(() => {
    if (!containerRef.current) return;

    let disposed = false;
    const renderer = new RailRenderer(containerRef.current, index, {
      initialCamera,
      routes: [],
      projectionCenter: CITY_CONFIG_BY_ID[selectedCityId].center,
      onStationClick: (stationId) => clickRef.current(stationId),
      onCameraChange: (camera) => setCamera(selectedCityId, camera),
    });

    rendererRef.current = renderer;
    renderer.init().then(() => {
      if (disposed) renderer.destroy();
    });

    return () => {
      disposed = true;
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [index, initialCamera, selectedCityId, setCamera]);

  useEffect(() => {
    rendererRef.current?.updateRoutes(routes, pendingRoute);
  }, [routes, pendingRoute]);

  useEffect(() => {
    rendererRef.current?.updateSelection(selectedStationId, draftOriginId);
  }, [selectedStationId, draftOriginId]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden bg-[#090d12]"
      aria-label="Railway planning canvas"
    />
  );
}
