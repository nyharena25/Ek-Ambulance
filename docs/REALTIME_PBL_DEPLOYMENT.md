# Realtime delivery path (Oracle PBL deployment)

No secret values in this file. Secret *names* only.

## Chain

```
mission_events INSERT ──trigger mission_events_publish──┐
dispatch_next_wave / _revoke_offers ────────────────────┤
                                                        ▼
public.publish_realtime(channel, data)        (supabase/migrations/20260924000003_mission_api.sql)
  reads Vault: centrifugo_api_url, centrifugo_api_key   (absent -> silent no-op)
  net.http_post(<url>/api/publish, Authorization: apikey <key>)   pg_net, async, 5 s timeout
        ▼  HTTPS (public internet; hosted Supabase cannot reach localhost / private addresses)
Oracle VM 150.230.139.158  ── Caddy :443 (docker/Caddyfile.pbl, auto TLS via sslip.io)
  /api/publish            -> centrifugo:8000   (only API method exposed; API-key protected)
  /connection/websocket   -> centrifugo:8000   (WSS for the apps)
  everything else         -> kong:8000 -> /realtime/token -> token-mint (AUTH_MODE=strict)
        ▼  WSS
apps: patient mountMissionChannel (mission:{id})  /  driver mountOffersChannel (driver:{id}:offers), mountMissionWatch
```

| Channel | Publisher | Who may subscribe (token-mint strict) |
|---|---|---|
| `mission:{uuid}` | lifecycle trigger (server only); GPS pings from the assigned driver via publish proxy | caller who can read the mission under RLS (its patient, its assigned driver) |
| `driver:{uuid}:offers` | `dispatch_next_wave`, `_revoke_offers` | that driver only (`sub` must equal the id) |

Namespaces `mission` and `driver` are defined in `docker/centrifugo.secure.json` (history + recovery; anonymous connect off).

## Endpoints

| What | Value |
|---|---|
| Oracle host (`PBL_HOST`) | `150-230-139-158.sslip.io` |
| Vault `centrifugo_api_url` | `https://150-230-139-158.sslip.io` (no path; the function appends `/api/publish`) |
| Mobile `EXPO_PUBLIC_GATEWAY_URL` | `https://150-230-139-158.sslip.io` (only `/realtime/token`, `/triage/extract`; auth/REST go straight to Supabase) |
| Mobile `EXPO_PUBLIC_CENTRIFUGO_WS_URL` | `wss://150-230-139-158.sslip.io/connection/websocket` |
| EAS profile | `pbl` (apps/*/eas.json). `preview`/`production` hosts (`*.sahayak.in`) do not resolve yet. |

Every build that talks to the hosted project must use the Oracle realtime endpoint: the hosted database publishes to
that Centrifugo only. A local Centrifugo (`ws://localhost:8001`) never receives hosted publishes. `EXPO_PUBLIC_*` values
are inlined at bundle time: restart Metro with `-c` after changing them.

## Server env (VM `.env`, never in the apps)

`PBL_HOST`, `CENTRIFUGO_API_KEY` (= Vault `centrifugo_api_key`), `CENTRIFUGO_HMAC_SECRET` (Centrifugo + token-mint),
`CENTRIFUGO_ALLOWED_ORIGINS` (must include `https://150-230-139-158.sslip.io` for Android), `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`.

```
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.pbl.yml up -d
```

## Verify (in order; nothing here publishes to an ambulance channel)

1. Host answers: `curl -sI https://$PBL_HOST/` returns an HTTP status (a Kong 404 is fine), not a timeout.
2. Unauthenticated calls refused: `POST /realtime/token` -> 401 `missing_bearer`; `POST /api/publish` without key -> 401.
3. WSS upgrade with Android's origin:
   `curl --http1.1 -sI -H "Origin: https://$PBL_HOST" -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' https://$PBL_HOST/connection/websocket` -> `101`.
4. Centrifugo alone, temporary channel `probe-<rand>` (outside the ambulance namespaces): on the VM,
   `docker compose exec centrifugo centrifugo gentoken -u probe` and `... gensubtoken -u probe -s probe-<rand>`;
   subscribe a client over WSS with those tokens; then
   `curl -s localhost:8001/api/publish -H "Authorization: apikey $CENTRIFUGO_API_KEY" -d '{"channel":"probe-<rand>","data":{"ping":1}}'`
   -> `{"result":{}}` and the client receives it. Tokens expire; no history is kept outside namespaces, nothing to clean up.
5. Supabase -> Oracle without publishing: `select net.http_get('https://150-230-139-158.sslip.io/pgnet-probe');` then
   `select status_code, timed_out, error_msg from net._http_response order by created desc limit 1;` -> an HTTP status (Kong 404), not a timeout.
6. Hosted dry run (stops before create_mission):
   `set -a; . apps/patient/.env.e2e; set +a; G45C_DRY_RUN=1 node --experimental-strip-types apps/patient/src/integration/missionLifecycle.hosted.e2e.ts`
7. Real devices: after a request, `net._http_response` shows 200 for the offer and for `DRIVER_ACCEPTED`, and the wave
   ends `accepted` (offer screen), not `expired` (board claim).

## Failure signature seen on 2026-10-02

All 12 `net._http_response` rows (08:36–13:25 UTC): `timed_out`, DNS ~3 ms, TCP/SSL handshake 5000 ms, request 0 ms.
External probe from a separate network: ports 22/80/443 accept TCP but no process answers (no TLS ServerHello, no SSH
banner), unused ports are filtered: the VM is stalled, not misconfigured. After rebooting, check the previous boot:
`journalctl -k -b -1 | grep -iE 'oom|killed process'`, `free -m`, `docker stats --no-stream`.
