# Reinfra

Reinfra is an open-source railway infrastructure planning game. It turns real
OpenStreetMap rail networks into an interactive sandbox where players can inspect
city rail graphs, pick stations, calculate shortest paths, and save custom train
routes.

The current build is an MVP focused on railway route creation across Budapest,
Vienna, and Berlin.

## Features

- Real rail graph data generated from OpenStreetMap / Overpass extracts
- Interactive PixiJS railway canvas with pan and zoom controls
- Station selection, platform-aware route planning, and shortest-path routing
- Saved routes per city with custom names and colors
- Local persistence for camera positions, selected city, and saved routes
- Next.js app shell with React, TypeScript, Tailwind CSS, and Zustand

## Gameplay

1. Choose a city from the sidebar.
2. Drag to pan the map and use the mouse wheel to zoom.
3. Click a station to set the route origin.
4. Click a second station to calculate the shortest available path.
5. Pick platforms, choose a route color, name the route, and save it.

Saved routes stay in your browser through local storage.

## Getting Started

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Scripts

```bash
npm run dev
```

Starts the local Next.js development server.

```bash
npm run build
```

Creates a production build.

```bash
npm run start
```

Runs the production build locally.

```bash
npm run lint
```

Runs ESLint.

```bash
npm run generate:rail-data
```

Fetches railway data from Overpass and regenerates graph files in
`public/data/`.

## Rail Data

Reinfra uses generated JSON graph files for each supported city:

- `public/data/budapest.graph.json`
- `public/data/vienna.graph.json`
- `public/data/berlin.graph.json`

The generator lives in `scripts/generate-real-rail-graphs.mjs`. It fetches
railway ways and station nodes from Overpass, projects coordinates into local
meter-based graph space, marks stations and junctions, and writes compact graph
files for the game client.

Railway infrastructure data is from OpenStreetMap contributors and is available
under the Open Database License. Map tiles are from OpenStreetMap contributors
and CARTO. Keep attribution visible when changing the renderer, data pipeline, or
public UI.

## Tech Stack

- [Next.js](https://nextjs.org/) 16
- [React](https://react.dev/) 19
- [TypeScript](https://www.typescriptlang.org/)
- [PixiJS](https://pixijs.com/) for canvas rendering
- [Zustand](https://zustand.docs.pmnd.rs/) for game state
- [Tailwind CSS](https://tailwindcss.com/) 4
- [Turf](https://turfjs.org/) for geospatial utilities

## Project Structure

```text
app/                         Next.js app routes and global styles
public/data/                 Generated city rail graph files
scripts/                     Data generation tools
src/components/              React UI and canvas bridge
src/game/graph/              Graph loading, indexing, and city config
src/game/pathfinding/        Shortest-path routing
src/game/rendering/          PixiJS railway renderer
src/store/                   Persisted game state
src/types/                   Shared rail graph and route types
```

## Contributing

Contributions are welcome. Good first areas include:

- Adding more cities
- Improving route validation and game mechanics
- Adding objectives, scoring, costs, demand, or timetables
- Improving mobile controls and accessibility
- Writing tests for graph indexing, pathfinding, and route persistence
- Optimizing large-city rendering performance
- Improving the rail data generator and station matching heuristics

Before opening a pull request:

1. Keep changes focused and explain the gameplay or technical reason for them.
2. Run the checks below.
3. Include screenshots or short recordings for visible UI changes.
4. Credit any external data, assets, or algorithms you add.

```bash
npx tsc --noEmit
npm run lint
npm run build
```

## Roadmap

- Scenario goals and win/loss conditions
- Budget, maintenance, and route profitability systems
- Passenger demand simulation
- Better route editing after save
- More cities and configurable data imports
- Shareable save files
- Automated tests for graph generation and routing

## License

Reinfra is released under the [MIT License](LICENSE).

Railway infrastructure data remains copyright OpenStreetMap contributors and is
available under the Open Database License. Map tile attribution must remain
visible in public builds.
