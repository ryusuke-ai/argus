# Argus API Reference

This document describes all REST API endpoints and MCP server tools in the Argus system.

## Authentication

### Dashboard API (Next.js)

All `/api/*` endpoints on the Dashboard (port 3150) are protected by **Cloudflare Access** JWT verification in production:

- **Header**: `Cf-Access-Jwt-Assertion` (Cloudflare Access JWT)
- **Development**: Authentication is skipped when `NODE_ENV=development`
- **Exception**: `GET /api/tiktok/auth/callback` is excluded (external OAuth redirect)

If the JWT header is missing, the API returns `401 Unauthorized`.
If the JWT signature is invalid, the API returns `403 Forbidden`.

### Orchestrator API (Express)

The Orchestrator (port 3950) does not have application-level authentication. Access should be restricted at the network level (Cloudflare Tunnel / VPN).

---

## Dashboard API

**Base URL**: `http://localhost:3150` (configurable via `DASHBOARD_BASE_URL`)

### Query

#### POST /api/query

Send a message to the Claude agent and receive a response.

| Field   | Type   | Required | Description                  |
| ------- | ------ | -------- | ---------------------------- |
| message | string | Yes      | The user's message to Claude |

**Response** (200):

```json
{
  "success": true,
  "sessionId": "session_abc123",
  "content": "Here is the agent's response...",
  "cost": 0.0042
}
```

**Errors**: `400` (missing message), `500` (internal error)

---

### Sessions

#### POST /api/sessions/:id/feedback

Resume an existing Claude session with follow-up feedback. Saves both user and assistant messages to the database.

| Field   | Location | Type   | Required | Description                       |
| ------- | -------- | ------ | -------- | --------------------------------- |
| id      | Path     | string | Yes      | Database session ID               |
| message | Body     | string | Yes      | Follow-up message for the session |

**Response** (200):

```json
{
  "success": true,
  "message": "The assistant's response text..."
}
```

**Errors**: `400` (invalid body / missing message / no active Claude session), `404` (session not found), `500` (internal error)

---

### Files

#### GET /api/files

List all output directories and their files from the agent output directory (`.claude/agent-output/`).

**Response** (200):

```json
[
  {
    "dir": "20260217-report",
    "files": [
      {
        "name": "output.mp4",
        "size": 5242880,
        "isImage": false,
        "isVideo": true
      },
      {
        "name": "thumbnail.png",
        "size": 102400,
        "isImage": true,
        "isVideo": false
      }
    ]
  }
]
```

Returns an empty array `[]` if the output directory does not exist.

---

#### GET /api/files/:path\*

Serve a specific file from the agent output directory. Supports range requests for video/audio seeking.

| Field | Location | Type   | Required | Description                                   |
| ----- | -------- | ------ | -------- | --------------------------------------------- |
| path  | Path     | string | Yes      | File path relative to `.claude/agent-output/` |

**Behavior**:

- Files under 10MB are served in a single response
- Files over 10MB are streamed via `ReadableStream`
- Supports HTTP `Range` headers (2MB chunks) for video/audio seeking
- Path traversal outside the output directory returns `403 Forbidden`
- Content-Type is determined by file extension (supports images, video, audio, text, JSON)

**Response**: Raw file content with appropriate `Content-Type`, `Content-Length`, and `Accept-Ranges` headers.

**Errors**: `403` (path traversal attempt), `404` (file not found)

---

### TikTok

#### GET /api/tiktok/auth/url

Generate a TikTok OAuth2 authorization URL with PKCE.

**Response** (200):

```json
{
  "success": true,
  "url": "https://www.tiktok.com/v2/auth/authorize?client_key=...&scope=video.upload,video.publish,user.info.basic&...",
  "codeVerifier": "...",
  "state": "randomHex:codeVerifier"
}
```

**Errors**: `500` (TIKTOK_CLIENT_KEY not configured)

---

#### GET /api/tiktok/auth/callback

Handle TikTok OAuth2 callback. Exchanges the authorization code for tokens and stores them in the database.

| Field | Location | Type   | Required | Description                              |
| ----- | -------- | ------ | -------- | ---------------------------------------- |
| code  | Query    | string | Yes      | Authorization code                       |
| state | Query    | string | Yes      | State parameter (contains code verifier) |

**Authentication**: Excluded from Cloudflare Access (external redirect)

**Response**: Redirects to `/tiktok?connected=true` on success, or `/tiktok?error=...` on failure.

---

#### GET /api/tiktok/creator-info

Fetch TikTok creator information. Automatically refreshes the access token if needed.

**Response** (200):

```json
{
  "success": true,
  "creatorInfo": { ... }
}
```

**Errors**: `401` (not authenticated / token refresh failed), `500` (API error)

---

#### POST /api/tiktok/publish

Publish a video to TikTok using Direct Post.

| Field              | Type    | Required | Description                                |
| ------------------ | ------- | -------- | ------------------------------------------ |
| videoUrl           | string  | Yes      | URL of the video to publish                |
| privacyLevel       | string  | Yes      | Privacy level (e.g., "PUBLIC_TO_EVERYONE") |
| title              | string  | No       | Video title/description                    |
| disableComment     | boolean | No       | Disable comments                           |
| disableDuet        | boolean | No       | Disable duets                              |
| disableStitch      | boolean | No       | Disable stitches                           |
| brandContentToggle | boolean | No       | Brand content flag                         |
| brandOrganicToggle | boolean | No       | Brand organic flag                         |
| isAigc             | boolean | No       | AI-generated content flag                  |

**Response** (200):

```json
{
  "success": true,
  "publishId": "pub_abc123",
  "privacyLevel": "PUBLIC_TO_EVERYONE"
}
```

**Errors**: `400` (missing videoUrl or privacyLevel), `500` (publishing failed)

---

#### GET /api/tiktok/status/:publishId

Check the publishing status of a TikTok video. Designed for client-side polling.

| Field     | Location | Type   | Required | Description                |
| --------- | -------- | ------ | -------- | -------------------------- |
| publishId | Path     | string | Yes      | TikTok publish ID to check |

**Response** (200):

```json
{
  "success": true,
  "status": "PUBLISH_COMPLETE",
  "publishId": "pub_abc123",
  "failReason": null,
  "publicPostId": [1234567890]
}
```

**Errors**: `400` (missing publishId), `401` (authentication failed), `500` (status check error)

---

## Orchestrator API

**Base URL**: `http://localhost:3950`

### Health

#### GET /health

Health check endpoint.

**Response** (200):

```json
{
  "status": "ok",
  "service": "agent-orchestrator"
}
```

---

### Knowledge

#### GET /api/knowledge

List all knowledge entries ordered by last updated date (descending).

**Response** (200):

```json
[
  {
    "id": "uuid",
    "name": "Entry Title",
    "description": "Optional description",
    "content": "Entry content...",
    "createdAt": "2026-02-17T00:00:00.000Z",
    "updatedAt": "2026-02-17T00:00:00.000Z"
  }
]
```

**Errors**: `500` (database error)

---

#### POST /api/knowledge

Create a new knowledge entry.

| Field       | Type   | Required | Description             |
| ----------- | ------ | -------- | ----------------------- |
| name        | string | Yes      | Name/title of the entry |
| content     | string | Yes      | Content of the entry    |
| description | string | No       | Optional description    |

**Response** (201): The created knowledge entry object.

**Errors**: `400` (missing name or content), `500` (database error)

---

#### GET /api/knowledge/:id

Get a single knowledge entry by ID.

| Field | Location | Type   | Required | Description        |
| ----- | -------- | ------ | -------- | ------------------ |
| id    | Path     | string | Yes      | Knowledge entry ID |

**Response** (200): The knowledge entry object.

**Errors**: `404` (not found), `500` (database error)

---

#### PUT /api/knowledge/:id

Update an existing knowledge entry. Only provided fields are updated.

| Field       | Location | Type   | Required | Description        |
| ----------- | -------- | ------ | -------- | ------------------ |
| id          | Path     | string | Yes      | Knowledge entry ID |
| name        | Body     | string | No       | New name/title     |
| content     | Body     | string | No       | New content        |
| description | Body     | string | No       | New description    |

**Response** (200): The updated knowledge entry object.

**Errors**: `404` (not found), `400` (validation error), `500` (database error)

---

#### DELETE /api/knowledge/:id

Archive (soft-delete) a knowledge entry.

| Field | Location | Type   | Required | Description        |
| ----- | -------- | ------ | -------- | ------------------ |
| id    | Path     | string | Yes      | Knowledge entry ID |

**Response**: `204 No Content`

**Errors**: `404` (not found), `400` (validation error), `500` (database error)

---

### Daily Plan

#### POST /api/daily-plan

Manually trigger daily plan generation (normally runs on a cron schedule).

**Response** (200):

```json
{
  "status": "ok",
  "message": "Daily plan generated"
}
```

**Errors**: `500` (generation failed)

---

## MCP Server Tools

MCP (Model Context Protocol) servers communicate via stdio, not HTTP. They are invoked by the Claude Agent SDK during agent execution. Each tool is called with structured JSON input and returns structured JSON output.

### Knowledge MCP (`@argus/knowledge`)

Server name: `knowledge-server` v0.1.0

Access is role-based:

- **Collector**: All 6 tools (search, list, add, update, archive, search_lessons)
- **Executor**: Read-only tools only (search, list, search_lessons)

#### Tool: knowledge_search

Search knowledge entries by name or content.

| Parameter | Type   | Required | Description                                   |
| --------- | ------ | -------- | --------------------------------------------- |
| query     | string | Yes      | Search query to match against name or content |

**Returns**: Array of matching knowledge entries.

---

#### Tool: knowledge_list

List all knowledge entries ordered by last updated date.

_No parameters._

**Returns**: Array of all knowledge entries.

---

#### Tool: search_lessons

Search lessons learned from past agent executions. Use when encountering repeated failures.

| Parameter | Type   | Required | Description                                       |
| --------- | ------ | -------- | ------------------------------------------------- |
| query     | string | Yes      | Search keyword (e.g., "Gmail send", "Slack post") |

**Returns**: Array of matching lesson entries.

---

#### Tool: knowledge_add

Add a new knowledge entry. Requires **collector** role.

| Parameter   | Type   | Required | Description                       |
| ----------- | ------ | -------- | --------------------------------- |
| name        | string | Yes      | Name/title of the knowledge entry |
| content     | string | Yes      | Content of the knowledge entry    |
| description | string | No       | Optional description              |

**Returns**: `{ success: true, data: <created entry> }` or `{ success: false, error: "..." }`

---

#### Tool: knowledge_update

Update an existing knowledge entry. Requires **collector** role.

| Parameter   | Type   | Required | Description               |
| ----------- | ------ | -------- | ------------------------- |
| id          | string | Yes      | ID of the entry to update |
| name        | string | No       | New name/title            |
| content     | string | No       | New content               |
| description | string | No       | New description           |

**Returns**: `{ success: true, data: <updated entry> }` or `{ success: false, error: "..." }`

---

#### Tool: knowledge_archive

Archive (soft-delete) a knowledge entry. Requires **collector** role.

| Parameter | Type   | Required | Description                |
| --------- | ------ | -------- | -------------------------- |
| id        | string | Yes      | ID of the entry to archive |

**Returns**: `{ success: true, data: <archived entry> }` or `{ success: false, error: "..." }`

---

### Personal Knowledge MCP (`@argus/knowledge-personal`)

Server name: `knowledge-personal-server` v0.1.0

All 6 tools are available (no role-based restriction).

#### Tool: personal_search

Search personal notes by keyword across all markdown files.

| Parameter | Type   | Required | Description                                 |
| --------- | ------ | -------- | ------------------------------------------- |
| query     | string | Yes      | Keyword to search across all personal notes |

**Returns**: Array of matching lines with context.

---

#### Tool: personal_read

Read a specific personal note by path.

| Parameter | Type   | Required | Description                                        |
| --------- | ------ | -------- | -------------------------------------------------- |
| path      | string | Yes      | Relative path to the note (e.g., `self/values.md`) |

**Returns**: `{ success: true, data: <file content> }` or `{ success: false, error: "..." }`

---

#### Tool: personal_list

List all personal notes, optionally filtered by category.

| Parameter | Type   | Required | Description                          |
| --------- | ------ | -------- | ------------------------------------ |
| category  | string | No       | Category to filter by (e.g., `self`) |

**Returns**: Array of note file paths.

---

#### Tool: personal_context

Get personal context for AI personalization.

| Parameter | Type   | Required | Description                                                                                |
| --------- | ------ | -------- | ------------------------------------------------------------------------------------------ |
| section   | string | No       | Specific section: `identity`, `values`, `strengths`, `thinking`, `preferences`, `routines` |

**Returns**: `{ success: true, data: <personality context> }` or `{ success: false, error: "..." }`

---

#### Tool: personal_add

Create a new personal note file.

| Parameter | Type   | Required | Description                              |
| --------- | ------ | -------- | ---------------------------------------- |
| category  | string | Yes      | Category directory (e.g., `self`)        |
| name      | string | Yes      | Note file name (without `.md` extension) |
| content   | string | Yes      | Content of the note in markdown format   |

**Returns**: `{ success: true, data: <created note> }` or `{ success: false, error: "..." }`

---

#### Tool: personal_update

Update an existing personal note.

| Parameter | Type   | Required | Description                                        |
| --------- | ------ | -------- | -------------------------------------------------- |
| path      | string | Yes      | Relative path to the note (e.g., `self/values.md`) |
| content   | string | Yes      | New content to write                               |
| mode      | string | Yes      | `append` (add to end) or `replace` (overwrite)     |

**Returns**: `{ success: true, data: <updated note> }` or `{ success: false, error: "..." }`

---

### Gmail MCP (`@argus/gmail`)

Server name: `gmail-server` v0.1.0

#### Tool: compose_email

Create an email draft. The draft is saved to the database and a confirmation button is sent via Slack for human-in-the-loop approval.

| Parameter | Type   | Required | Description             |
| --------- | ------ | -------- | ----------------------- |
| to        | string | Yes      | Recipient email address |
| subject   | string | Yes      | Email subject           |
| body      | string | Yes      | Email body text         |

**Returns**:

```json
{
  "draftId": "uuid",
  "to": "user@example.com",
  "subject": "Subject line",
  "body": "Email body...",
  "message": "Draft created. A send button will appear in Slack."
}
```

---

#### Tool: send_email

Send an email immediately without confirmation. Used for automated flows (e.g., inbox agent tasks).

| Parameter | Type   | Required | Description             |
| --------- | ------ | -------- | ----------------------- |
| to        | string | Yes      | Recipient email address |
| subject   | string | Yes      | Email subject           |
| body      | string | Yes      | Email body text         |

**Returns**:

```json
{
  "to": "user@example.com",
  "subject": "Subject line",
  "message": "Email sent: Subject line -> user@example.com"
}
```

---

### Google Calendar MCP (`@argus/google-calendar`)

Server name: `google-calendar-server` v0.1.0

#### Tool: create_event

Create a new Google Calendar event.

| Parameter   | Type     | Required | Description                                                                                |
| ----------- | -------- | -------- | ------------------------------------------------------------------------------------------ |
| title       | string   | Yes      | Event title                                                                                |
| start       | string   | Yes      | Start date/time in ISO8601 (e.g., `2026-03-15T19:00:00+09:00`) or `YYYY-MM-DD` for all-day |
| end         | string   | No       | End date/time in ISO8601. Defaults to 1 hour after start                                   |
| description | string   | No       | Event description                                                                          |
| attendees   | string[] | No       | List of attendee email addresses                                                           |
| location    | string   | No       | Event location                                                                             |

**Returns**: The created event object.

---

#### Tool: list_events

List Google Calendar events in a time range.

| Parameter  | Type   | Required | Description                           |
| ---------- | ------ | -------- | ------------------------------------- |
| timeMin    | string | Yes      | Start of time range in ISO8601 format |
| timeMax    | string | Yes      | End of time range in ISO8601 format   |
| maxResults | number | No       | Maximum number of events to return    |

**Returns**: Array of calendar event objects ordered by start time.

---

#### Tool: update_event

Update an existing Google Calendar event. Only specified fields are changed.

| Parameter   | Type   | Required | Description                    |
| ----------- | ------ | -------- | ------------------------------ |
| eventId     | string | Yes      | The ID of the event to update  |
| title       | string | No       | New event title                |
| start       | string | No       | New start date/time in ISO8601 |
| end         | string | No       | New end date/time in ISO8601   |
| description | string | No       | New event description          |
| location    | string | No       | New event location             |

**Returns**: The updated event object.

---

#### Tool: delete_event

Delete a Google Calendar event by its ID.

| Parameter | Type   | Required | Description                   |
| --------- | ------ | -------- | ----------------------------- |
| eventId   | string | Yes      | The ID of the event to delete |

**Returns**: `{ success: true }`
