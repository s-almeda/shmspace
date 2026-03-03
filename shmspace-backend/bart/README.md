# BART API (`/api/bart`)

## Live URL
- `https://art.snailbunny.site/api/bart/`

## Config
- 511 API KEY IN `.env`:
  - `BART_API_KEY=your_511_key_here`

## Endpoints

### `POST /api/bart/testmode`
Toggle test mode and optionally set test train list.

Request body:
```json
{
  "enabled": true,
  "trains": [
    { "line": "Red", "minutes": 2 },
    { "line": "Yellow", "minutes": 7 }
  ]
}
```

Response body:
```json
{
  "testMode": true,
  "testTrains": [
    { "line": "Red", "minutes": 2 },
    { "line": "Yellow", "minutes": 7 },
    { "line": "Green", "minutes": 12 },
    { "line": "Blue", "minutes": 18 }
  ]
}
```

### `GET /api/bart/next`
Returns next departures for clients (ESP32, etc.).

- If `testMode=true`: returns `testTrains`.
- If `testMode=false`: returns up to 5 live trains.
- Can return `[]` when cache is empty/no upcoming trains.

Response shape:
```json
[
  { "line": "Red", "minutes": 2 },
  { "line": "Yellow", "minutes": 7 }
]
```

### `GET /api/bart/data`
Debug/full payload for webpage polling.

Response shape:
```json
{
  "trains": [],
  "raw": {},
  "fetchedAt": "2026-03-03T00:00:00.000Z",
  "testMode": false,
  "testTrains": []
}
```

## Example curls

```bash
curl -X POST https://art.snailbunny.site/api/bart/testmode \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'

curl https://art.snailbunny.site/api/bart/next

curl -X POST https://art.snailbunny.site/api/bart/testmode \
  -H "Content-Type: application/json" \
  -d '{"enabled":true}'

curl https://art.snailbunny.site/api/bart/next
```

Observed behavior:
- Test mode OFF: `/next` returned `[]`.
- Test mode ON: `/next` returned default test trains.

## Request/response sequence (Snailbunny API -> 511)

1. Backend polls 511 on startup, then every 5 minutes:
   - `GET http://api.511.org/transit/StopMonitoring?...&format=json`
2. Parse:
   - `ServiceDelivery.StopMonitoringDelivery.MonitoredStopVisit[]`
3. Map each visit to:
   - `line`, `destination`, `origin`, `publishedName`, `arrivalTime`, `platform`
4. Cache as:
   - `{ trains, raw, fetchedAt }`
5. Serve clients:
   - `GET /api/bart/next` (compact)
   - `GET /api/bart/data` (full/debug)

## Request/response sequence (ESP32 -> Snailbunny API)

ESP32 sends requests to:
- `GET https://art.snailbunny.site/api/bart/next`

Expected response:
```json
[
  { "line": "Red", "minutes": 2 },
  { "line": "Yellow", "minutes": 7 }
]
```

Client handling rules:
- `[]` is valid.
- Poll every 15–30 seconds.
- Use `line` as label and `minutes` as ETA integer.
- On failure, keep last value and retry next interval.

## How it works

- Backend fetches live BART data from 511, normalizes it, and caches it.
- `/next` serves minimal train ETAs for hardware clients.
- `/data` serves full/debug payload for the web page.
- Test mode provides deterministic output independent of live feed.

## Update the server with this:

```bash
./update_portfolio.sh <commit message, eg update bart>
```
