# GTI Nav

A from-scratch mobile-first navigation and convoy prototype built with React, Leaflet/OpenStreetMap, OSRM and Socket.IO.

## Working in v0.1
- Browser GPS tracking with high-accuracy geolocation
- Custom GTI map marker that rotates with heading
- Destination search + road routing
- Route distance / ETA summary
- Create or join convoy with an invite code
- Live convoy position, heading and MPH over Socket.IO
- Start / End Drive session recording
- Trip distance, top speed, average speed and elapsed time
- Local drive history with route replay
- Dark dashboard-style UI
- Responsive mobile layout

## Run in GitHub Codespaces or locally
Requires Node 20+.

```bash
npm install
npm run dev
```

Open the forwarded Vite port (5173). The backend uses port 3001.

### Phone GPS testing
Browser geolocation requires a secure context on mobile. GitHub Codespaces forwarded HTTPS URLs work well. `localhost` is also considered secure on the same machine.

## GitHub Pages
The included workflow deploys the **frontend only** to Pages. GitHub Pages cannot host the Socket.IO process. For live convoy features on a Pages deployment, deploy `apps/server` to a Node host and set the repository Actions variable `VITE_SERVER_URL` to that HTTPS backend URL before rebuilding.

## Routing note
This prototype uses the public OSRM demo endpoint for route calculation and OpenStreetMap tiles. That is good for development/testing, not a production navigation SLA. A production release should use a hosted routing provider or a self-hosted OSRM/Valhalla instance and respect the provider's usage policy.

## Privacy note
Drive history is stored in the browser's localStorage in this prototype. Convoy telemetry is kept only in server memory and disappears when the server restarts. A production build should add authentication, encrypted transport, rate limiting, explicit sharing controls, and PostgreSQL/PostGIS persistence.
