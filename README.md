<p align="center">
  <img src="areaalert-logo.png" alt="AreaAlert Logo" width="420" />
</p>

<p align="center">
  <strong>REST API for the AreaAlert community outage reporting platform</strong>
</p>

<p align="center">
  <a href="https://area-alert-service.vercel.app/">
    <img src="https://img.shields.io/badge/Live_API-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Live API" />
  </a>
  <img src="https://img.shields.io/badge/Express_5-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express 5" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB" />
</p>

---

## Overview

This is the backend API for **AreaAlert**, a community utility outage reporting platform. It handles report CRUD operations, voting, safety score aggregation, and role-based access control. Authentication is delegated to the frontend via JWKS — this API never handles passwords or sessions directly.

The frontend repository is at [area-alert](https://github.com/JowelislamHabib/area-alert).

---

## Tech Stack

| Category         | Technology                           |
| ---------------- | ------------------------------------ |
| Runtime          | Node.js                              |
| Framework        | Express 5 (beta)                     |
| Language         | TypeScript                           |
| Database         | MongoDB (native driver, no Mongoose) |
| JWT Verification | jose v6 (JWKS)                       |
| Build Tool       | esbuild                              |
| Dev Runner       | tsx (watch mode)                     |
| Deployment       | Vercel (serverless)                  |

---

## Project Structure

```
area-alert-backend/
├── index.ts          # Single source file — all routes, middleware, DB setup
├── api/index.js      # esbuild output (gitignored), Vercel runs this
├── vercel.json       # Vercel routing config
├── package.json
├── tsconfig.json
└── .env              # MONGODB_URI, PORT, CLIENT_URL (gitignored)
```

The entire API lives in one file. There are no controllers, models, or service layers — just Express routes and middleware in `index.ts`.

---

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB instance (Atlas or local)
- Frontend running at `http://localhost:3000` (for JWKS auth)

### Setup

```bash
git clone https://github.com/JowelislamHabib/area-alert-backend.git
cd area-alert-backend
npm install
```

Create a `.env` file:

```env
MONGODB_URI=your_mongodb_connection_string
PORT=8000
CLIENT_URL=http://localhost:3000
```

### Development

```bash
npm run dev
```

Starts with `tsx watch index.ts` — hot-reload on save, no build step needed. Runs on [http://localhost:8000](http://localhost:8000).

### Build and Start

```bash
npm run build   # esbuild bundles to api/index.js
npm start       # runs the compiled output
```

---

## API Endpoints

Base path: `/api/reports`

| Method | Path                        | Auth | Description                                           |
| ------ | --------------------------- | ---- | ----------------------------------------------------- |
| GET    | `/`                         | No   | Health check — returns "Hello World!"                 |
| GET    | `/api/reports`              | No   | List reports (paginated, filterable, sortable)        |
| GET    | `/api/reports/safety-stats` | No   | Aggregation pipeline — safety scores by district/area |
| GET    | `/api/reports/:id`          | No   | Get single report by ObjectId                         |
| POST   | `/api/reports`              | Yes  | Create a new report                                   |
| PUT    | `/api/reports/:id/status`   | Yes  | Update report status (active/resolved)                |
| PATCH  | `/api/reports/:id`          | Yes  | Partial update (description, image, etc.)             |
| DELETE | `/api/reports/:id`          | Yes  | Delete a report                                       |
| POST   | `/api/reports/:id/vote`     | Yes  | Toggle upvote/downvote/resolved vote                  |

### Query Parameters (GET /api/reports)

| Param         | Type   | Description                                          |
| ------------- | ------ | ---------------------------------------------------- |
| `district`    | string | Filter by district                                   |
| `area`        | string | Filter by area                                       |
| `utilityType` | string | electricity, internet, water, gas, flood             |
| `status`      | string | active, resolved, all                                |
| `sortBy`      | string | `newest` (default) or `most_upvoted`                 |
| `q`           | string | Full-text search across area, district, descriptions |
| `startDate`   | string | Filter reports after this date                       |
| `endDate`     | string | Filter reports before this date                      |
| `page`        | number | Page number (default: 1)                             |
| `limit`       | number | Results per page (default: 12)                       |
| `reporterId`  | string | Filter by reporter                                   |

### Safety Stats (GET /api/reports/safety-stats)

Returns aggregated safety scores grouped by district or area. Each entry includes:

- `totalReports`, `activeReports`, `resolvedReports`
- `score` (0–100, higher is safer)
- `safetyLevel`: "Safe" (80+), "Caution" (50–79), "Avoid" (<50)
- `activeUtilities` breakdown by type

| Param         | Type   | Description                      |
| ------------- | ------ | -------------------------------- |
| `type`        | string | `districts` (default) or `areas` |
| `q`           | string | Search by name                   |
| `utilityType` | string | Filter by utility type           |
| `district`    | string | Filter areas within a district   |
| `safetyLevel` | string | Safe, Caution, Avoid             |
| `page`        | number | Page number                      |
| `limit`       | number | Results per page                 |

---

## Authentication

This API does not manage user sessions. It verifies JWTs issued by the frontend's Better Auth instance.

### How It Works

1. Frontend extracts a JWT from the Better Auth session
2. Frontend sends the token as `Authorization: Bearer <token>` in server action requests
3. Backend fetches the JWKS from `${CLIENT_URL}/api/auth/jwks`
4. `verifyToken` middleware validates the JWT using `jose`'s `jwtVerify` with the remote JWKS
5. Decoded user payload is attached to `req.user`

### Middleware

| Middleware       | Purpose                                 |
| ---------------- | --------------------------------------- |
| `verifyToken`    | Validates JWT, attaches user to request |
| `verifyReporter` | Requires role `user` or `admin`         |
| `verifyAdmin`    | Requires role `admin`                   |

The `isAdmin()` helper checks the `user` collection in MongoDB for admin status when authorizing report modifications.

---

## Database

Database name: `AreaAlert`

| Collection | Purpose                                                |
| ---------- | ------------------------------------------------------ |
| `reports`  | All outage reports with votes, status, reporter info   |
| `user`     | User accounts (managed by Better Auth on the frontend) |

The backend only reads from `user` to check admin roles. All user creation/login is handled by Better Auth on the frontend.

### Report Schema

```typescript
{
  _id: ObjectId,
  utilityType: "electricity" | "internet" | "water" | "gas" | "flood",
  area: string,
  district: string,
  status: "active" | "resolved",
  startedAt: Date,
  shortDescription: string,
  description: string,
  image?: string,
  videoUrl?: string,
  ispName?: string,
  reporterId: string,
  reporterName: string,
  reporterImage?: string,
  createdAt: Date,
  upvotes: string[],      // array of user IDs
  downvotes: string[],    // array of user IDs
  resolvedVotes: string[] // array of user IDs
}
```

---

## Deployment

Deployed on Vercel as a serverless function.

### vercel.json

```json
{
  "builds": [{ "src": "api/index.js", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "api/index.js" }]
}
```

### Build Process

1. `npm run build` runs esbuild, bundling `index.ts` into `api/index.js`
2. Vercel deploys `api/index.js` as a serverless function
3. In production, the app does not start an HTTP listener — it exports the Express app for Vercel's handler

### Key Details

- esbuild externalizes `express`, `cors`, `mongodb`, and `dotenv` (provided by the runtime)
- `CLIENT_URL` env var should point to the frontend's production URL in deployed environments
- `vercel` CLI package is included in dependencies for `vercel dev` local testing

---

## Scripts

| Command         | What It Does                                                       |
| --------------- | ------------------------------------------------------------------ |
| `npm run dev`   | `tsx watch index.ts` — hot-reload dev server                       |
| `npm run build` | `esbuild index.ts --bundle --platform=node --outfile=api/index.js` |
| `npm start`     | `node api/index.js` — runs compiled output                         |

---

## License

ISC
