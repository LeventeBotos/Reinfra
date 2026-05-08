import {
  Application,
  Assets,
  Circle,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
  type FederatedPointerEvent,
} from "pixi.js";
import type { RailGraphIndex } from "@/src/game/graph/graphIndex";
import type {
  CameraState,
  PendingRoute,
  RailNode,
  TrainRoute,
} from "@/src/types/rail";

type RendererOptions = {
  initialCamera: CameraState;
  routes: TrainRoute[];
  pendingRoute?: PendingRoute;
  selectedStationId?: string;
  draftOriginId?: string;
  projectionCenter: [lon: number, lat: number];
  onStationClick: (stationId: string) => void;
  onCameraChange: (camera: CameraState) => void;
};

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

const BACKGROUND = 0x090d12;
const TRACK = 0x65717d;
const TRACK_SUBTLE = 0x29323a;
const STATION = 0xe9f2f1;
const SELECTED = 0xf3c969;
const DRAFT = 0x5eead4;
const METERS_PER_DEGREE = 111_320;
const CARTO_TILE_SUBDOMAINS = ["a", "b", "c", "d"];

function parseColor(color: string) {
  return Number.parseInt(color.replace("#", ""), 16);
}

function isEdgeVisible(a: RailNode, b: RailNode, bounds: Bounds) {
  return !(
    Math.max(a.x, b.x) < bounds.minX ||
    Math.min(a.x, b.x) > bounds.maxX ||
    Math.max(a.y, b.y) < bounds.minY ||
    Math.min(a.y, b.y) > bounds.maxY
  );
}

export class RailRenderer {
  private app?: Application;
  private world = new Container();
  private tileLayer = new Container();
  private gridLayer = new Graphics();
  private trackLayer = new Graphics();
  private routeLayer = new Graphics();
  private nodeLayer = new Container();
  private labelLayer = new Container();
  private stationViews = new Map<string, Graphics>();
  private labelViews = new Map<string, Text>();
  private tileSprites = new Map<string, Sprite>();
  private camera: CameraState;
  private routes: TrainRoute[];
  private pendingRoute?: PendingRoute;
  private selectedStationId?: string;
  private draftOriginId?: string;
  private isDragging = false;
  private isDestroyed = false;
  private controlsBound = false;
  private lastPointer = { x: 0, y: 0 };
  private resizeObserver?: ResizeObserver;
  private readonly onStationClick: (stationId: string) => void;
  private readonly onCameraChange: (camera: CameraState) => void;
  private readonly projectionCenter: [lon: number, lat: number];
  private readonly lonScale: number;

  constructor(
    private readonly container: HTMLElement,
    private readonly index: RailGraphIndex,
    options: RendererOptions,
  ) {
    this.camera = options.initialCamera;
    this.routes = options.routes;
    this.pendingRoute = options.pendingRoute;
    this.selectedStationId = options.selectedStationId;
    this.draftOriginId = options.draftOriginId;
    this.onStationClick = options.onStationClick;
    this.onCameraChange = options.onCameraChange;
    this.projectionCenter = options.projectionCenter;
    this.lonScale =
      METERS_PER_DEGREE * Math.cos((this.projectionCenter[1] * Math.PI) / 180);
  }

  async init() {
    this.app = new Application();
    await this.app.init({
      antialias: true,
      autoDensity: true,
      background: BACKGROUND,
      powerPreference: "high-performance",
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      resizeTo: this.container,
    });

    if (this.isDestroyed) {
      this.app.destroy(true);
      this.app = undefined;
      return;
    }

    const canvas = this.app.canvas;
    this.container.appendChild(canvas);
    this.app.stage.addChild(this.world);
    this.world.addChild(
      this.tileLayer,
      this.gridLayer,
      this.trackLayer,
      this.routeLayer,
      this.nodeLayer,
      this.labelLayer,
    );

    this.createStationViews();
    this.bindCameraControls();
    this.applyCamera(false);
  }

  updateRoutes(routes: TrainRoute[], pendingRoute?: PendingRoute) {
    this.routes = routes;
    this.pendingRoute = pendingRoute;
    this.drawRoutes();
  }

  updateSelection(selectedStationId?: string, draftOriginId?: string) {
    this.selectedStationId = selectedStationId;
    this.draftOriginId = draftOriginId;
    this.drawStationStates();
  }

  destroy() {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    const app = this.app;
    if (!app) return;

    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;

    const canvas = app.canvas as HTMLCanvasElement | undefined;
    if (canvas && this.controlsBound) {
      canvas.removeEventListener("pointerdown", this.handlePointerDown);
      canvas.removeEventListener("pointermove", this.handlePointerMove);
      canvas.removeEventListener("pointerup", this.handlePointerUp);
      canvas.removeEventListener("pointerleave", this.handlePointerUp);
      canvas.removeEventListener("wheel", this.handleWheel);
    }

    this.controlsBound = false;
    this.tileSprites.clear();
    app.destroy(true);
    this.app = undefined;
  }

  private bindCameraControls() {
    const canvas = this.app?.canvas as HTMLCanvasElement | undefined;
    if (!canvas || this.controlsBound) return;

    canvas.addEventListener("pointerdown", this.handlePointerDown);
    canvas.addEventListener("pointermove", this.handlePointerMove);
    canvas.addEventListener("pointerup", this.handlePointerUp);
    canvas.addEventListener("pointerleave", this.handlePointerUp);
    canvas.addEventListener("wheel", this.handleWheel, {
      passive: false,
    });
    this.controlsBound = true;

    this.resizeObserver = new ResizeObserver(() => this.applyCamera(false));
    this.resizeObserver.observe(this.container);
  }

  private createStationViews() {
    for (const station of this.index.stationGroups) {
      const marker = new Graphics();
      marker.x = station.x;
      marker.y = station.y;
      marker.hitArea = new Circle(0, 0, 12);
      marker.eventMode = "static";
      marker.cursor = "pointer";
      marker.on("pointertap", (event: FederatedPointerEvent) => {
        event.stopPropagation();
        this.onStationClick(station.id);
      });

      this.nodeLayer.addChild(marker);
      this.stationViews.set(station.id, marker);

      if (station.name) {
        const label = new Text({
          text: station.name,
          style: {
            fill: 0xd9e5e4,
            fontFamily: "Inter, Arial, sans-serif",
            fontSize: 12,
            fontWeight: "500",
          },
        });
        label.x = station.x + 9;
        label.y = station.y - 16;
        label.resolution = 2;
        this.labelLayer.addChild(label);
        this.labelViews.set(station.id, label);
      }
    }

    this.drawStationStates();
  }

  private drawStationStates() {
    for (const [id, marker] of this.stationViews) {
      const station = this.index.stationGroupsById.get(id);
      if (!station) continue;

      const isSelected = id === this.selectedStationId;
      const isDraft = id === this.draftOriginId;
      const screenScale = 1 / Math.max(this.camera.zoom, 0.001);
      const radius =
        (station.platformNodeIds.length > 1 ? 5.8 : 4.6) * screenScale;
      marker.hitArea = new Circle(0, 0, 12 * screenScale);

      marker.clear();
      marker
        .circle(
          0,
          0,
          isSelected || isDraft ? radius + 4 * screenScale : radius + 1.5 * screenScale,
        )
        .fill({
          color: isSelected ? SELECTED : isDraft ? DRAFT : BACKGROUND,
          alpha: isSelected || isDraft ? 0.32 : 0.95,
        });
      marker
        .circle(0, 0, radius)
        .fill({ color: STATION, alpha: 1 });
    }
  }

  private drawGrid(bounds: Bounds) {
    this.gridLayer.clear();
    const targetPixels = 96;
    const rawStep = targetPixels / Math.max(this.camera.zoom, 0.001);
    const magnitude = 10 ** Math.floor(Math.log10(rawStep));
    const normalized = rawStep / magnitude;
    const step =
      (normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
    const startX = Math.floor(bounds.minX / step) * step;
    const endX = Math.ceil(bounds.maxX / step) * step;
    const startY = Math.floor(bounds.minY / step) * step;
    const endY = Math.ceil(bounds.maxY / step) * step;

    for (let x = startX; x <= endX; x += step) {
      this.gridLayer.moveTo(x, startY).lineTo(x, endY);
    }

    for (let y = startY; y <= endY; y += step) {
      this.gridLayer.moveTo(startX, y).lineTo(endX, y);
    }

    this.gridLayer.stroke({
      width: 1 / Math.max(this.camera.zoom, 0.001),
      color: TRACK_SUBTLE,
      alpha: 0.28,
    });
  }

  private updateMapTiles(bounds: Bounds) {
    const zoom = this.tileZoom();
    const topLeft = this.worldToLonLat(bounds.minX, bounds.minY);
    const bottomRight = this.worldToLonLat(bounds.maxX, bounds.maxY);
    const west = Math.min(topLeft.lon, bottomRight.lon);
    const east = Math.max(topLeft.lon, bottomRight.lon);
    const south = Math.min(topLeft.lat, bottomRight.lat);
    const north = Math.max(topLeft.lat, bottomRight.lat);
    const minTile = this.lonLatToTile(west, north, zoom);
    const maxTile = this.lonLatToTile(east, south, zoom);
    const maxIndex = 2 ** zoom - 1;
    const minX = Math.max(0, Math.min(minTile.x, maxTile.x));
    const maxX = Math.min(maxIndex, Math.max(minTile.x, maxTile.x));
    const minY = Math.max(0, Math.min(minTile.y, maxTile.y));
    const maxY = Math.min(maxIndex, Math.max(minTile.y, maxTile.y));
    const tileCount = (maxX - minX + 1) * (maxY - minY + 1);

    if (tileCount > 96) {
      this.hideAllTiles();
      return;
    }

    const visibleKeys = new Set<string>();
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        const key = `${zoom}/${x}/${y}`;
        visibleKeys.add(key);
        const sprite = this.getTileSprite(zoom, x, y, key);
        this.positionTileSprite(sprite, zoom, x, y);
        sprite.visible = true;
      }
    }

    for (const [key, sprite] of this.tileSprites) {
      if (!visibleKeys.has(key)) sprite.visible = false;
    }
  }

  private hideAllTiles() {
    for (const sprite of this.tileSprites.values()) {
      sprite.visible = false;
    }
  }

  private getTileSprite(zoom: number, x: number, y: number, key: string) {
    const existing = this.tileSprites.get(key);
    if (existing) return existing;

    const subdomain =
      CARTO_TILE_SUBDOMAINS[Math.abs((x * 31 + y * 17 + zoom) % 4)];
    const url = `https://${subdomain}.basemaps.cartocdn.com/dark_all/${zoom}/${x}/${y}.png`;
    const sprite = new Sprite({ texture: Texture.EMPTY });
    sprite.alpha = 0.74;
    sprite.eventMode = "none";
    this.tileLayer.addChild(sprite);
    this.tileSprites.set(key, sprite);
    Assets.load<Texture>(url)
      .then((texture) => {
        if (this.isDestroyed) return;
        sprite.texture = texture;
      })
      .catch(() => {
        sprite.visible = false;
      });
    return sprite;
  }

  private positionTileSprite(sprite: Sprite, zoom: number, x: number, y: number) {
    const west = this.tileToLon(x, zoom);
    const east = this.tileToLon(x + 1, zoom);
    const north = this.tileToLat(y, zoom);
    const south = this.tileToLat(y + 1, zoom);
    const topLeft = this.lonLatToWorld(west, north);
    const bottomRight = this.lonLatToWorld(east, south);

    sprite.x = topLeft.x;
    sprite.y = topLeft.y;
    sprite.width = bottomRight.x - topLeft.x;
    sprite.height = bottomRight.y - topLeft.y;
  }

  private tileZoom() {
    const latRadians = (this.projectionCenter[1] * Math.PI) / 180;
    const zoom = Math.round(
      Math.log2(
        Math.max(this.camera.zoom, 0.0001) *
          156_543.03392 *
          Math.cos(latRadians),
      ),
    );
    return Math.max(10, Math.min(15, zoom));
  }

  private worldToLonLat(x: number, y: number) {
    return {
      lon: this.projectionCenter[0] + x / this.lonScale,
      lat: this.projectionCenter[1] - y / METERS_PER_DEGREE,
    };
  }

  private lonLatToWorld(lon: number, lat: number) {
    return {
      x: (lon - this.projectionCenter[0]) * this.lonScale,
      y: -(lat - this.projectionCenter[1]) * METERS_PER_DEGREE,
    };
  }

  private lonLatToTile(lon: number, lat: number, zoom: number) {
    const scale = 2 ** zoom;
    const latRadians = (lat * Math.PI) / 180;
    return {
      x: Math.floor(((lon + 180) / 360) * scale),
      y: Math.floor(
        ((1 -
          Math.log(Math.tan(latRadians) + 1 / Math.cos(latRadians)) / Math.PI) /
          2) *
          scale,
      ),
    };
  }

  private tileToLon(x: number, zoom: number) {
    return (x / 2 ** zoom) * 360 - 180;
  }

  private tileToLat(y: number, zoom: number) {
    const mercator = Math.PI * (1 - (2 * y) / 2 ** zoom);
    return (Math.atan(Math.sinh(mercator)) * 180) / Math.PI;
  }

  private drawTracks(bounds: Bounds) {
    this.trackLayer.clear();
    for (const edge of this.index.graph.edges) {
      const from = this.index.nodesById.get(edge.from);
      const to = this.index.nodesById.get(edge.to);
      if (!from || !to || !isEdgeVisible(from, to, bounds)) continue;

      this.trackLayer.moveTo(from.x, from.y).lineTo(to.x, to.y);
    }

    this.trackLayer.stroke({
      width: 1.45 / Math.max(this.camera.zoom, 0.001),
      color: TRACK,
      alpha: 0.78,
    });
  }

  private drawRoutes() {
    this.routeLayer.clear();
    for (const route of this.routes) {
      this.drawRoutePath(
        route.nodeIds,
        route.edgeIds,
        parseColor(route.color),
        4.2 / Math.max(this.camera.zoom, 0.001),
        0.9,
      );
    }

    if (this.pendingRoute) {
      this.drawRoutePath(
        this.pendingRoute.nodeIds,
        this.pendingRoute.edgeIds,
        DRAFT,
        5.2 / Math.max(this.camera.zoom, 0.001),
        0.55,
      );
    }
  }

  private drawRoutePath(
    nodeIds: number[],
    edgeIds: number[] | undefined,
    color: number,
    width: number,
    alpha: number,
  ) {
    if (edgeIds?.length) {
      for (const edgeId of edgeIds) {
        const edge = this.index.edgesById.get(edgeId);
        const from = edge ? this.index.nodesById.get(edge.from) : undefined;
        const to = edge ? this.index.nodesById.get(edge.to) : undefined;
        if (!edge || !from || !to) continue;

        const points = edge.points;
        if (points && points.length >= 4) {
          this.routeLayer.moveTo(points[0], points[1]);
          for (let index = 2; index < points.length; index += 2) {
            this.routeLayer.lineTo(points[index], points[index + 1]);
          }
        } else {
          this.routeLayer.moveTo(from.x, from.y).lineTo(to.x, to.y);
        }
      }

      this.routeLayer.stroke({ width, color, alpha, cap: "round", join: "round" });
      return;
    }

    const firstNode = this.index.nodesById.get(nodeIds[0]);
    if (!firstNode) return;

    this.routeLayer.moveTo(firstNode.x, firstNode.y);
    for (const nodeId of nodeIds.slice(1)) {
      const node = this.index.nodesById.get(nodeId);
      if (!node) continue;
      this.routeLayer.lineTo(node.x, node.y);
    }

    this.routeLayer.stroke({ width, color, alpha, cap: "round", join: "round" });
  }

  private applyCamera(emit = true) {
    if (!this.app) return;

    const width = this.app.renderer.width / this.app.renderer.resolution;
    const height = this.app.renderer.height / this.app.renderer.resolution;
    this.world.scale.set(this.camera.zoom);
    this.world.position.set(
      width / 2 - this.camera.x * this.camera.zoom,
      height / 2 - this.camera.y * this.camera.zoom,
    );

    const bounds = this.visibleWorldBounds(width, height);
    this.updateMapTiles(bounds);
    this.drawGrid(bounds);
    this.drawTracks(bounds);
    this.drawRoutes();
    this.drawStationStates();
    this.updateCulling(bounds);

    if (emit) this.onCameraChange({ ...this.camera });
  }

  private visibleWorldBounds(width: number, height: number): Bounds {
    const margin = 160 / this.camera.zoom;
    const min = this.screenToWorld(0, 0);
    const max = this.screenToWorld(width, height);
    return {
      minX: Math.min(min.x, max.x) - margin,
      minY: Math.min(min.y, max.y) - margin,
      maxX: Math.max(min.x, max.x) + margin,
      maxY: Math.max(min.y, max.y) + margin,
    };
  }

  private updateCulling(bounds: Bounds) {
    for (const [id, marker] of this.stationViews) {
      const station = this.index.stationGroupsById.get(id);
      if (!station) continue;
      marker.visible =
        station.x >= bounds.minX &&
        station.x <= bounds.maxX &&
        station.y >= bounds.minY &&
        station.y <= bounds.maxY;
    }

    for (const [id, label] of this.labelViews) {
      const station = this.index.stationGroupsById.get(id);
      if (!station) continue;
      label.visible =
        this.camera.zoom >= 0.035 &&
        station.x >= bounds.minX &&
        station.x <= bounds.maxX &&
        station.y >= bounds.minY &&
        station.y <= bounds.maxY;
      label.scale.set(1 / Math.max(this.camera.zoom, 0.8));
    }
  }

  private screenToWorld(screenX: number, screenY: number) {
    return {
      x: (screenX - this.world.position.x) / this.camera.zoom,
      y: (screenY - this.world.position.y) / this.camera.zoom,
    };
  }

  private handlePointerDown = (event: PointerEvent) => {
    this.isDragging = true;
    this.lastPointer = { x: event.clientX, y: event.clientY };
  };

  private handlePointerMove = (event: PointerEvent) => {
    if (!this.isDragging) return;
    const dx = event.clientX - this.lastPointer.x;
    const dy = event.clientY - this.lastPointer.y;
    this.lastPointer = { x: event.clientX, y: event.clientY };
    this.camera = {
      ...this.camera,
      x: this.camera.x - dx / this.camera.zoom,
      y: this.camera.y - dy / this.camera.zoom,
    };
    this.applyCamera();
  };

  private handlePointerUp = () => {
    this.isDragging = false;
  };

  private handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    if (!this.app) return;

    const rect = this.app.canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const worldBefore = this.screenToWorld(screenX, screenY);
    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
    const nextZoom = Math.max(0.006, Math.min(4.2, this.camera.zoom * zoomFactor));

    this.camera.zoom = nextZoom;
    const width = this.app.renderer.width / this.app.renderer.resolution;
    const height = this.app.renderer.height / this.app.renderer.resolution;
    this.camera.x = worldBefore.x - (screenX - width / 2) / nextZoom;
    this.camera.y = worldBefore.y - (screenY - height / 2) / nextZoom;
    this.applyCamera();
  };
}
