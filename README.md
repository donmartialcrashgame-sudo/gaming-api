# Gaming API

Backend-only real-time gaming API platform.

## Overview

This project provides APIs and WebSocket services for real-time game engines. There is no frontend in this repository; external clients consume the platform through authenticated API endpoints and WebSocket connections.

## Planned Game Services

- Crash game engine
- Virtual football game engine
- Big Odd engine for scheduled premium game outputs

## Architecture

```text
External Client
      |
      +---- REST API ----> API Gateway ----> Game Services
      |
      +---- WebSocket ---> WebSocket Gateway ----> Game Services
                                      |
                                  Supabase
```

The game engines remain authoritative for game state and results. The WebSocket layer distributes real-time events rather than acting as the source of truth for game outcomes.

## Access Model

The platform is designed for API customers. Access will be controlled using API keys and service entitlements, including a premium tier for premium-only endpoints and events.

API keys and secrets must never be committed to this repository. Runtime secrets will be provided through environment variables or the deployment platform's secret manager.

## Big Odd Service

The Big Odd service is planned to:

1. Generate scheduled daily outputs.
2. Store the generated output and schedule in persistent storage.
3. Execute the scheduled event at its authoritative server time.
4. Publish the event through the WebSocket gateway.
5. Expose the appropriate result through an authenticated premium API endpoint.
6. Record an auditable game/event history.

The scheduler and Big Odd engine will be authoritative. Connected clients will receive the resulting events and cannot determine or alter the server-side outcome.

## Technology

- Node.js 20+
- Express
- WebSocket (`ws`)
- Supabase
- GitHub

## Development

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Run the production server:

```bash
npm start
```

Run tests:

```bash
npm test
```

## Project Structure

```text
src/
├── api/          # HTTP API routes and handlers
├── auth/         # API-key authentication and entitlement checks
├── config/       # Runtime configuration
├── engines/
│   ├── crash/    # Crash game engine
│   ├── football/ # Virtual football engine
│   └── big-odd/  # Scheduled Big Odd engine
├── utils/        # Shared utilities
├── websocket/    # WebSocket gateway and event handling
└── server.js     # Application entry point

tests/            # Automated tests
```

## Security Principles

- Never expose Supabase service-role credentials to external clients.
- Hash or securely protect API keys at rest where appropriate.
- Enforce tenant isolation and premium entitlements server-side.
- Apply rate limits to public API and WebSocket connections.
- Validate all client-supplied input.
- Make game results authoritative on the server.
- Keep an audit trail for important game and account events.

## Status

Early backend foundation. API authentication, Supabase schema, WebSocket protocol, game engines, scheduling, and production deployment will be implemented incrementally.
