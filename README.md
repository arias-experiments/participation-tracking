# Participation Tracking

Local roster management app: React/Vite frontend, Express backend, and PostgreSQL.
Upload a photo roster, view names and portraits, and browse courses by course number and year.
Random selection and participation ratings are future work.

## Start with Docker Compose

With Docker running, open a terminal in the project root:

```sh
docker compose up --build
```

Open http://127.0.0.1:5173. Choose Upload roster to import a class, or Courses to open a saved roster.
Both apps install dependencies on startup. Source edits reload automatically.
The frontend proxies `/api` to `http://backend:3000`; the backend connects to `database:5432`.
Only frontend and backend ports are published, bound to 127.0.0.1.

Stop with `docker compose down`. PostgreSQL data remains in the `participation_data`
volume. `docker compose down -v` deletes the database and dependency volumes.

## Develop in VS Code

Choose **Dev Containers: Reopen in Container**. The editor attaches to the backend
and opens the whole project at `/workspace`. PostgreSQL starts automatically;
the two app containers stay idle until you start the apps.

In the VS Code container terminal:

```sh
cd /workspace/backend
npm install
npm run dev
```

In a host terminal in the project root, start the frontend in its own container:

```sh
docker compose -f docker-compose.yml -f .devcontainer/docker-compose.devcontainer.yml exec frontend sh -c 'npm install && npm run dev'
```

Open http://127.0.0.1:5173. Stop each app with Ctrl+C.
Dependencies are stored in separate named volumes, including when accessed through
`/workspace/backend` or `/workspace/frontend` in the editor.

## Configuration and checks

Compose supplies `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD`.
The database name, user, and password can be overridden with a root `.env` file.
Changing these values does not update an already initialized PostgreSQL volume.

- `GET /api/health`: backend health.
- `GET /api/health/database`: queries PostgreSQL; returns 503 when unavailable.
- `npm run build` in `frontend`: validates and builds the frontend.

The backend uses Node's watch mode. Vite supplies frontend hot reload.
Student names and portraits are stored in the local PostgreSQL volume. No external service is used for PDF processing.

## Roster workflow

Enter course number (for example CSC 3310), quarter, and a four-digit year, then upload the original photo-grid PDF from the school system. The imported roster appears below the form. Courses lists saved rosters with course-number and year filters.

Multi-page PDFs are supported, up to 20 pages, 20 MB, and 500 students. Scanned or encrypted PDFs are not supported. Names that wrap onto multiple lines are joined; parenthesized pronouns are omitted. A repeated course/quarter/year upload is rejected without replacing the saved roster. If any page cannot be parsed, no partial roster is saved.

Verified with the supplied 22-student sample and a two-page fixture containing that sample twice (44 entries): names, portraits, persistence, duplicates, course/year filters, invalid year/PDF responses, and frontend production build.
