# Wave-Flex Integrator: Wavelog-driven Spot Colouring — Technical Reference

This document describes, purely from the source code of the Wave-Flex
Integrator project, how the application uses the Wavelog REST API to decide
the colour, opacity, and tooltip text of DX-cluster spots that are pushed to
a FlexRadio via its "spot add" TCP command.

It is written for a developer implementing equivalent logic in a different
SDR client. It intentionally avoids any claim about Wavelog's internal
behaviour that is not directly observable from this codebase — where the
client only consumes a field, that field's *meaning* is reported as
documented in code comments (if any), not invented.

All secrets have been redacted:
- Wavelog base URL → `https://<wavelog-host>/index.php`
- API key → `<api-key>`
- Callsigns in examples → placeholders such as `<spotted-callsign>`, `<my-callsign>`

Every claim below is annotated with `(file:function)` so it can be checked
against the source.

---

## 1. Wavelog API usage

The application talks to a single Wavelog installation over plain HTTPS
JSON/REST calls implemented with `node-fetch`. There is no SDK — every
endpoint is a hand-built `fetch()` call. All calls share one timeout
constant and one circuit breaker (see §3).

Two endpoints are directly involved in spot colouring. Two more exist in the
codebase for unrelated features (frequency reporting, QSO logging); they are
listed at the end of this section for completeness since they hit the same
Wavelog host, but they do not influence colouring.

### 1.1 `GET /api/station_info/<api-key>` — active station lookup

- **Method / path**: `GET {baseURL}/api/station_info/{apiKey}` — the API key
  is embedded in the URL path, not a header or query string.
  (`wavelog_client.js:getActiveStation`)
- **Auth**: the API key is the path segment itself; no `Authorization`
  header is sent. Request header sent: `Accept: application/json`.
  (`wavelog_client.js:getActiveStation`)
- **Trigger**: called once at application startup (if the app is
  configured with a non-placeholder URL/key), and again on-demand whenever
  the renderer asks for station details via IPC — but that on-demand call is
  a no-op against the network if the values are already cached in memory
  (see §3.2). It is also re-triggered by the circuit-breaker's recovery
  probe after Wavelog has been detected as unreachable.
  (`main.js:fetchStationDetails`, `main.js` around the `appConfigured` /
  `get-station-details` IPC handler, `wavelog_client.js:_runProbe`)
- **Request body**: none (GET request).

**Example request**
```
GET https://<wavelog-host>/index.php/api/station_info/<api-key>
Accept: application/json
```

**Example response** (Wavelog is documented elsewhere to return an array of
station-location profiles; the exact response shape below is reconstructed
solely from the fields the code reads out of it — see the code comment
under "fields consumed"):
```json
[
  {
    "station_id": "3",
    "station_active": "1",
    "station_callsign": "<my-callsign>",
    "station_profile_name": "Home Station",
    "station_gridsquare": "<my-gridsquare>"
  },
  {
    "station_id": "7",
    "station_active": "0",
    "station_callsign": "<my-other-callsign>",
    "station_profile_name": "Portable Station",
    "station_gridsquare": "<my-other-gridsquare>"
  }
]
```

**Fields consumed** (all others, and any other array entries, are ignored):
`station_active` (used only to pick the one entry where it equals the
string `'1'`), `station_id`, `station_callsign`, `station_profile_name`,
`station_gridsquare`.
(`wavelog_client.js:getActiveStation`, lines finding
`data.find((station) => station.station_active == '1')` and reading the four
fields off the match)

Relevance to colouring: `station_callsign` becomes the value compared
against each spot's callsign to detect "this is my own callsign" (see
§2.2 and §4). No other field from this endpoint feeds the colouring logic.

### 1.2 `POST /api/private_lookup` — per-spot enrichment (the colouring data source)

This is the endpoint that supplies every field the colouring decision tree
in §2 and §4 depends on.

- **Method / path**: `POST {baseURL}/api/private_lookup`
  (`augmented_spot_cache.js:wavelogEnrichSpot`)
- **Auth**: the API key is sent as a field (`key`) inside the JSON request
  body — not a header. (`augmented_spot_cache.js:wavelogEnrichSpot`)
- **Request headers**: `Content-Type: application/json`.
- **Trigger**: called once per unique "spot identity" the first time it is
  seen (cache miss). A spot identity is the tuple (spotted callsign as
  received on the wire, band, mode) — see §3.1 for the exact cache-key
  derivation and its caveats. It is **not** called on a timer and it is
  **not** batched; one HTTP POST per cache-miss spot.
  (`augmented_spot_cache.js:processSpot`, `augmented_spot_cache.js:wavelogEnrichSpot`)
- **Skipped entirely** (no HTTP call attempted) if the shared Wavelog
  circuit breaker is open. (`augmented_spot_cache.js:wavelogEnrichSpot`)

**Example request**
```json
POST https://<wavelog-host>/index.php/api/private_lookup
Content-Type: application/json

{
  "key": "<api-key>",
  "callsign": "<spotted-callsign>",
  "band": "20m",
  "mode": "USB",
  "station_ids": [3]
}
```
`callsign` is the cluster-spotted callsign after only the cleanup described
in §2.1 (stripping a trailing cluster `-#` marker — no portable-suffix
stripping is performed client-side). `band` and `mode` are derived from the
spot's frequency/message as described in §2.1. `station_ids` is the
user-configured list of Wavelog "station location" IDs
(`config.wavelogAPI.station_location_ids`, default `[]`) — the code comment
in the default config describes this as "Wavelog station location (QTH)
IDs from where to search for DXCC confirmation data."
(`defaultConfig.js`, `augmented_spot_cache.js:wavelogEnrichSpot`)

**Example response** (reconstructed strictly from the field names the code
reads — see the "fields consumed" list; any field in Wavelog's real response
not named below is ignored by the application and its meaning is not
verified here):
```json
{
  "bearing": 32,
  "callsign": "<spotted-callsign>",
  "call_confirmed": true,
  "call_confirmed_band": false,
  "call_confirmed_band_mode": false,
  "call_worked": true,
  "call_worked_band": true,
  "call_worked_band_mode": false,
  "cont": "EU",
  "dxcc_confirmed": true,
  "dxcc_confirmed_on_band": false,
  "dxcc_confirmed_on_band_mode": false,
  "dxcc_cqz": 14,
  "dxcc_id": 223,
  "dxcc": "germany",
  "dxcc_flag": "🇩🇪",
  "gridsquare": "<spotted-gridsquare>",
  "iota_ref": "",
  "dxcc_lat": 51.0,
  "latlng": [51.0, 10.0],
  "dxcc_long": 10.0,
  "location": "",
  "lotw_member": 12,
  "name": "Station Operator",
  "qsl_manager": "",
  "state": "",
  "suffix_slash": "",
  "us_county": ""
}
```

**Fields consumed**, exactly as mapped by the application
(`augmented_spot_cache.js:wavelogEnrichSpot`, the `returner` object
construction):

| Response field | Stored as | Falsy/missing fallback |
|---|---|---|
| `bearing` | `bearing` | `''` |
| `callsign` | `callsign` | cleaned input callsign |
| `call_confirmed` | `call_confirmed` | `false` |
| `call_confirmed_band` | `call_confirmed_band` | `false` |
| `call_confirmed_band_mode` | `call_confirmed_band_mode` | `false` |
| `call_worked` | `call_worked` | `false` |
| `call_worked_band` | `call_worked_band` | `false` |
| `call_worked_band_mode` | `call_worked_band_mode` | `false` |
| `cont` | `cont` | `''` |
| `dxcc_confirmed` | `dxcc_confirmed` | `false` |
| `dxcc_confirmed_on_band` | `dxcc_confirmed_on_band` | `false` |
| `dxcc_confirmed_on_band_mode` | `dxcc_confirmed_on_band_mode` | `false` |
| `dxcc_cqz` | `dxcc_cqz` | `''` |
| `dxcc_id` | `dxcc_id` | `''` |
| `dxcc` | `entity` (capitalised first letter, rest lower-cased) | `''` |
| `dxcc_flag` | `flag` | `''` |
| `gridsquare` | `gridsquare` | `''` |
| `iota_ref` | `iota_ref` | `''` |
| `dxcc_lat` | `lat` | `''` |
| `latlng` | `latlng` | `[]` |
| `dxcc_long` | `lng` | `''` |
| `location` | `location` | `''` |
| `lotw_member` | `lotw_member` (re-derived, see §2.4) | see §2.4 |
| `name` | `name` | `''` |
| `qsl_manager` | `qsl_manager` | `''` |
| `state` | `state` | `''` |
| `suffix_slash` | `suffix_slash` | `''` |
| `us_county` | `us_county` | `''` |

Because the code uses `result.field || false` / `|| ''` coercion, a field
that is **explicitly `false`/`0`/absent from the response** is
indistinguishable from a field that Wavelog never sent at all. This matters
for the decision tree in §2.3: only `dxcc_confirmed`, `dxcc_confirmed_on_band`,
`dxcc_confirmed_on_band_mode`, and `lotw_member` are checked with strict
`=== false` comparisons downstream in the colouring code
(`flexradio_client.js:sendSpot`), so in practice "explicitly false" and
"field missing" both mean "condition met" once the response has been
received and coerced by `augmented_spot_cache.js`.

Only the nine colouring-relevant fields (`dxcc_confirmed*`, `call_confirmed*`,
`call_worked*`, `lotw_member`) actually influence spot colour/opacity (§2.3,
§4). The remaining fields in the table (bearing, gridsquare, name, flag,
etc.) are cached and made available to the UI/tooltip pipeline but are not
read by the FlexRadio colouring function itself
(`flexradio_client.js:sendSpot` destructures only the nine fields listed in
§2.3/§2.4).

### 1.3 Endpoints present in the codebase but not used for colouring

For completeness, two other Wavelog endpoints exist in `wavelog_client.js`
and are called by unrelated features:

- `POST /api/radio` — reports the FlexRadio's current TX frequency/mode to
  Wavelog for logging purposes, sent on TX slice change, not per spot.
  (`wavelog_client.js:sendActiveSliceToWavelog`)
- `POST /api/qso` — submits a completed QSO as an ADIF string (used by the
  WSJT-X auto-logging feature). (`wavelog_client.js:sendAdifToWavelog`)
- `POST /api/private_lookup` is also called a second, independent way from
  the QSO Assistant window (`qso_assistant.js`, via
  `wavelog_client.js:lookupCallsign`) for interactive callsign lookups
  triggered by manual user action in that window — this is a separate call
  site from the per-spot enrichment in §1.2 and does not feed spot colouring.

None of these three call sites affect the colour/opacity computation
described in this document.

---

## 2. Lookup and decision logic

### 2.1 From raw cluster line to a lookup request

**Cluster line parsing.** The DX cluster connection is a raw Telnet socket.
Incoming lines matching a `DX de <spotter>: <freq> <spotted> <comment> <time>Z [<locator>]`
pattern are parsed with a regex into `{ spotter, spotted, frequency, message, timestamp }`.
The DX cluster protocol supplies **no mode field** — mode is never present
in a raw spot line at this stage. (`dx_cluster_client.js:_parseDX`)

**Callsign "cleaning".** Before an enrichment lookup, the spotted callsign
is passed through `cleanCallsign()`, which strips a trailing literal `-#`
suffix only (e.g. a Reverse-Beacon/Skimmer node marker such as
`K1ABC-#` → `K1ABC`). This is the **only** callsign normalization the
application performs itself.
```js
function cleanCallsign(call) {
  return call.replace(/-\#$/, '');
}
```
(`utils.js:cleanCallsign`)

**No client-side portable-suffix handling.** The application does **not**
parse or strip amateur-radio portable/temporary suffixes (e.g. `/P`, `/MM`,
`/QRP`, `/4`) anywhere in this codebase. The cleaned-but-otherwise-raw
callsign (which may still contain such a suffix) is sent as-is to
`/api/private_lookup`. The response field `suffix_slash` (see §1.2 table) is
consumed as an opaque value coming back from Wavelog — the application
displays/caches it but does not compute it. Whether/how Wavelog resolves
the DXCC entity when a portable suffix is present is **not verifiable from
this codebase** and must be confirmed against Wavelog directly.

**DXCC entity resolution.** The application performs no DXCC lookup of its
own. `dxcc_id`, `entity` (from response field `dxcc`), `cont`, `dxcc_cqz`,
`dxcc_flag`, `dxcc_lat`/`dxcc_long` are all taken verbatim from the
`/api/private_lookup` response (§1.2). There is no local prefix table,
country file, or DXCC database anywhere in the repository.

**Band normalization.** Band is derived purely from the spot's frequency
(cluster frequency is treated as kHz and converted to Hz by multiplying by
1000), against fixed IARU-style band edges:
```js
qrgToBand(frequencyHz) {
  if (frequencyHz >= 1800000 && frequencyHz < 2000000) return '160m';
  if (frequencyHz >= 3500000 && frequencyHz < 4000000) return '80m';
  if (frequencyHz >= 7000000 && frequencyHz < 7300000) return '40m';
  if (frequencyHz >= 10100000 && frequencyHz < 10150000) return '30m';
  if (frequencyHz >= 14000000 && frequencyHz < 14350000) return '20m';
  if (frequencyHz >= 18068000 && frequencyHz < 18168000) return '17m';
  if (frequencyHz >= 21000000 && frequencyHz < 21450000) return '15m';
  if (frequencyHz >= 24890000 && frequencyHz < 24990000) return '12m';
  if (frequencyHz >= 28000000 && frequencyHz < 29700000) return '10m';
  if (frequencyHz >= 50000000 && frequencyHz < 54000000) return '6m';
  return 'Unknown';
}
```
Bands outside this list (e.g. 60m, 2m) resolve to the literal string
`'Unknown'`. (`augmented_spot_cache.js:qrgToBand`)

**Mode normalization ("guessing").** Because raw DX cluster spots carry no
mode field, mode is **guessed**, in this order, from the spot's comment text
and its frequency's position within a *Swedish band-plan-derived* set of
hard-coded sub-band ranges (the source code comment explicitly attributes
these ranges to "the Swedish band plan" — this is stated in the code, not
inferred by this document):
1. If the comment text contains the literal substring `"CW"` → mode is `CW`.
2. Else if the frequency falls inside one of nine hard-coded CW-segment
   ranges (per band, 160–10 m) → mode is `CW`.
3. Else if the frequency falls inside one of eight hard-coded digital-segment
   ranges (80–10 m) → mode is `DIGU`.
4. Else, mode is `LSB` if frequency < 10 MHz, otherwise `USB`.
(`augmented_spot_cache.js:guessMode`)

This means: modes such as `FM`, `AM`, `RTTY`, `FT8`, etc. are never produced
by this guesser — the only possible outputs are `CW`, `DIGU`, `LSB`, `USB`,
or `Unknown` (only if frequency is not a valid number).

**Spot identity.** Once band and mode are computed, a spot ID string is
built as `` `${spot.spotted}-${spot.band}-${spot.mode}` `` — using the
**raw** (cluster-supplied, un-cleaned) spotted callsign, not the
`cleanCallsign()`-processed one. This ID is both the enrichment cache key
(§3.1) and the value later reused as `processedSpot.id`.
(`augmented_spot_cache.js:generateSpotId`, `augmented_spot_cache.js:processSpot`)

### 2.2 "Is this my own callsign?" check

Before any DXCC/worked-before/LoTW logic runs, the spotted callsign
(upper-cased) is compared, with strict string equality, against the active
station's callsign obtained once at startup from `/api/station_info`
(§1.1):
```js
const spottedCallsign = processedSpot.spotted.toUpperCase();
if (spottedCallsign === this.stationCallsign) { /* "myCallsign" styling, see §4 */ }
```
`this.stationCallsign` is **not** re-fetched after the `FlexRadioClient` is
constructed at startup — see §3.2 for the caching/staleness implications
(also documented for the user in `README.md`: "If you change the Active
Station in Wavelog, you will need to restart the application to fetch the
new values"). Note the comparison is not case-normalized on the
`stationCallsign` side — whatever case Wavelog returned in `station_callsign`
is used directly. (`flexradio_client.js:sendSpot`)

If this check matches, none of the DXCC/LoTW/worked-before logic below
runs at all — the "my callsign" branch is a full override (§2.3 precedence
note).

### 2.3 Decision tree: DXCC-needed colour and worked/confirmed opacity

This all happens in one function, `flexradio_client.js:sendSpot`, after
enrichment data (or `null`, on lookup failure — see §3.3) has been attached
to the spot by `augmented_spot_cache.js:processSpot`.

**Step 0 — own callsign (exclusive branch).** If the spot is the station's
own callsign (§2.2), colour is forced to the `myCallsign` colours,
opacity forced to 80%, and no further checks run. Otherwise, continue to
Step 1.

**Step 1 — DXCC-needed colour** (evaluated as an `if / else if / else if / else`
chain — only one branch can apply):
1. `dxcc_confirmed === false` → **"New DXCC"** colours (most severe /
   highest precedence).
2. else `dxcc_confirmed_on_band === false` → **"DXCC needed for band"**
   colours.
3. else `dxcc_confirmed_on_band_mode === false` → **"DXCC needed for band
   and mode"** colours.
4. else (all three are `true`) → colours stay at the **default** colours set
   at the top of the function (no change).

**Step 2 — LoTW overlay (independent of Step 1, always evaluated).**
```js
if (lotw_member === false) {
  textColor = colors.notLotw.textColor;   // background colour is untouched
}
```
This can override the *text* colour chosen in Step 1 but never the
*background* colour. It is not an `else if` of Step 1 — it always runs.
(`flexradio_client.js:sendSpot`)

**Step 3 — worked-before / confirmed-before opacity** (a second, separate
`if / else if` chain, independent of Steps 1–2, that only ever changes
`backgroundOpacity`, never colour):
1. `call_confirmed_band_mode === true` → **confirmed, this band+mode**
   opacity (highest precedence).
2. else `call_worked_band_mode === true` → **worked, this band+mode**
   opacity.
3. else `call_confirmed_band === true` → **confirmed, this band**
   opacity.
4. else `call_worked_band === true` → **worked, this band** opacity.
5. else `call_confirmed === true` → **confirmed, any band/mode** opacity.
6. else `call_worked === true` → **worked, any band/mode** opacity.
7. else → default 80% opacity ("New callsign").

**Precedence summary.** Colour (Step 1, overridden by Step 2's text-colour
overlay) and opacity (Step 3) are computed **independently** and then
combined — e.g. a spot can simultaneously be coloured "DXCC needed" (dark
blue background, from Step 1) *and* rendered at low opacity because the
callsign was already worked on that band/mode (from Step 3). The only truly
exclusive branch in the whole tree is Step 0 (own callsign).
(`flexradio_client.js:sendSpot`)

### 2.4 LoTW activity data: source, parsing, refresh, staleness

There is **no dedicated LoTW endpoint or separate fetch** anywhere in this
codebase. LoTW activity is entirely a derived interpretation of the single
`lotw_member` field returned inline by the same `/api/private_lookup`
response described in §1.2 — i.e. it is fetched, parsed, and refreshed on
exactly the same per-spot cadence and cache rules as every other enrichment
field (§3.1).

Parsing logic (`augmented_spot_cache.js:wavelogEnrichSpot`):
```js
const maxDaysConsideredTrue = config.loTW.max_days_lotw_considered_true; // default 200

if (result.lotw_member === false) {
  lotwMember = false;
} else {
  const lotwMemberValue = Number(result.lotw_member);
  if (!isNaN(lotwMemberValue)) {
    if (lotwMemberValue === 0) {
      lotwMember = true;
    } else if (lotwMemberValue > 0 && lotwMemberValue < maxDaysConsideredTrue) {
      lotwMember = true;
    } else {
      lotwMember = false;
    }
  } else {
    lotwMember = false;
  }
}
```
The code's own field comment states `lotw_member` is treated as "If active
LoTW uploader" — the numeric value is interpreted by this code as **a count
of days** (0 = uploaded today; the constant is named
`max_days_lotw_considered_true`). This document cannot independently verify
from this codebase alone that the Wavelog API's `lotw_member` field is
literally "days since last LoTW upload" — that is the interpretation implied
by the variable/config names and arithmetic, but no code comment states the
unit explicitly, so treat the exact semantics of this field as something to
confirm against Wavelog directly.

**Staleness rule** (this is the entirety of it): a numeric `lotw_member`
value is treated as "active" (`true`) only if `0 <= value < 200`
(200 is the default for `config.loTW.max_days_lotw_considered_true`, a
user-configurable setting; see `defaultConfig.js`). Any value `>= 200`, any
explicit `false`, or a non-numeric value all resolve to `lotwMember = false`.
There is no independent "last checked" timestamp kept by the application —
staleness is entirely Wavelog's responsibility to compute and report back as
the `lotw_member` number; the client only thresholds that number.

---

## 3. Caching

### 3.1 Per-spot enrichment cache (`AugmentedSpotCache`)

- **Data structure**: a single in-process JavaScript `Map<string, object>`
  (`this.cache`), keyed by spot ID, value is the `returner` object described
  in the §1.2 field table. (`augmented_spot_cache.js`, constructor and
  `wavelogEnrichSpot`)
- **Cache key**: `` `${spot.spotted}-${spot.band}-${spot.mode}` ``, built
  from the **raw, un-cleaned** cluster callsign (not the `cleanCallsign()`
  output used for the actual lookup request body). Consequence: e.g. a spot
  for `K1ABC-#` and a later spot for `K1ABC` on the same band/mode will
  **not** share a cache entry, even though both would produce an identical
  `/api/private_lookup` request body, because their spot IDs differ.
  (`augmented_spot_cache.js:generateSpotId` vs `wavelogEnrichSpot`)
- **TTL**: **none.** An entry, once cached, never expires by time. It is
  only ever evicted by the size-bound rule below. No code or comment in this
  file states a time-based rationale.
- **Size bound / eviction**: FIFO by insertion order. After every new
  insert, `ensureSizeLimit()` deletes the oldest (first-inserted) `Map` key
  while `cache.size > maxSize`. `maxSize` defaults to 500
  (`config.augmentedSpotCache.maxSize`, `defaultConfig.js`) and is
  user-configurable. `Map` iteration order in JavaScript is guaranteed to be
  insertion order, which is what makes "first key" = "oldest" here.
  (`augmented_spot_cache.js:ensureSizeLimit`)
- **Persistence across restarts**: **none observed.** The cache is a plain
  in-memory `Map` constructed fresh (`new AugmentedSpotCache(...)`) each
  time the application starts (`main.js`); no file/disk read or write of
  cache contents was found anywhere in the repository.
- **Manual clear**: a `clear()` method exists on the class but no call site
  invokes it anywhere in the repository outside its own definition — it
  appears to be unused/dead code as far as this codebase is concerned.
  (`augmented_spot_cache.js:clear`)
- **Practical staleness consequence** (derived from the above, not stated as
  a rationale anywhere in the code): if a spot for a given
  callsign/band/mode is cached, and the operator subsequently works and
  confirms that station, later spots matching the same cache key will keep
  showing the pre-QSO worked/confirmed/DXCC status until that entry is
  evicted by the FIFO size limit — there is no active invalidation on a new
  QSO being logged.

### 3.2 Active station cache (`WavelogClient.activeStationData`)

- **Data structure**: a single object field, `this.activeStationData`, plus
  an in-flight-request de-duplication field `this.fetchPromise` so
  concurrent callers share one outstanding HTTP request.
  (`wavelog_client.js:getActiveStation`)
- **TTL**: none — once populated, it is served forever for the life of the
  process, for every caller (`getStationId`, `getStationCallsign`,
  `getStationGridsquare`, `getStationProfileName`, and indirectly
  `flexradio_client.js`'s `stationCallsign` comparison in §2.2, which is
  captured once at `FlexRadioClient` construction time).
- **Invalidation**: the only code path that clears
  `this.activeStationData` (back to `null`, forcing a real re-fetch) is the
  circuit breaker's recovery probe, `_runProbe()`, which runs only after
  three consecutive Wavelog failures have opened the breaker (§3.3) and a
  backoff timer has elapsed. There is no user-facing manual refresh and no
  periodic re-fetch. `README.md` documents this operationally: "If you
  change the Active Station in Wavelog, you will need to restart the
  application to fetch the new values." (`wavelog_client.js:_runProbe`,
  `README.md`)

### 3.3 Cache miss / timeout / Wavelog-unreachable fallback behaviour

Two separate failure-handling mechanisms exist and they are **not fully
unified**:

**a) Per-request timeout.** Every Wavelog HTTP call (including
`/api/private_lookup`) is wrapped in an `AbortController` with an 8-second
timeout (`WAVELOG_TIMEOUT_MS = 8000`, `wavelog_client.js`). On timeout, the
fetch rejects and is caught.

**b) Circuit breaker (owned by `WavelogClient`, shared by reference).**
A simple 3-state breaker (`CLOSED` / `OPEN` / `HALF_OPEN`):
- Opens after `BREAKER_FAILURE_THRESHOLD = 3` consecutive recorded failures.
- While `OPEN`, a probe is scheduled starting at `PROBE_INITIAL_DELAY_MS =
  10000` ms, doubling (`PROBE_BACKOFF_FACTOR = 2`) up to a cap of
  `PROBE_BACKOFF_CAP_MS = 120000` ms, calling `getActiveStation` in probe
  mode to test recovery.
- On a successful probe, breaker closes and the backoff resets to 10 s; on
  a failed probe, it stays `OPEN` and the backoff increases again.
(`wavelog_client.js`, constants and `_scheduleProbe`/`_runProbe`)

**Important asymmetry**: `augmented_spot_cache.js`'s `/api/private_lookup`
call reads breaker state via `wavelogClient.isCircuitOpen()` and — if open —
skips the HTTP call entirely, returning `null` immediately (no request is
even attempted). However, when the request *is* attempted and it fails
(HTTP non-2xx, timeout, network error, or a non-object JSON body), that
failure is only logged — it is **never reported back** to the breaker via
`_recordFailure()`. In other words: **repeated `/api/private_lookup`
failures alone cannot open the circuit breaker**; only failures from
`WavelogClient`'s own methods (`getActiveStation`,
`sendActiveSliceToWavelog`, `sendAdifToWavelog`, `lookupCallsign`) do that.
(`augmented_spot_cache.js:wavelogEnrichSpot` — no `_recordFailure`/`_recordSuccess`
call exists in this function; contrast with `wavelog_client.js`, where every
public method calls one or the other.)

**Resulting fallback colouring, for any of — cache miss + request failure,
cache miss + timeout, or breaker already open:**

`wavelogEnrichSpot` returns `null` → `processSpot` sets
`spot.wavelog_augmented_data = null` → in `sendSpot`,
`const augmentedData = processedSpot.wavelog_augmented_data || {};` leaves
every destructured field (`dxcc_confirmed`, `call_confirmed`, `lotw_member`,
etc.) as JavaScript `undefined`. Since the colouring `if` chain tests
`=== false` / `=== true` strictly, `undefined` satisfies **none** of those
conditions. The net effect is:

- Colour: stays at the **default** colours (no DXCC-needed styling is
  applied, even though the entity may genuinely be needed — the app cannot
  tell the difference between "confirmed" and "unknown" in this state).
- Opacity: falls through to the final `else`, i.e. **80%** (config default),
  with comment text **"New callsign."**
- No red "LoTW inactive" text-colour override is applied either, since
  `lotw_member === false` is also not satisfied by `undefined`.

This fallback is identical whether the cause was a genuine cache miss that
failed, a timeout, or the breaker already being open — the code path
converges on the same `null` result in all three cases.
(`flexradio_client.js:sendSpot`, `augmented_spot_cache.js:wavelogEnrichSpot`,
`augmented_spot_cache.js:processSpot`)

A cache **hit** never calls the network at all and always returns the
previously stored object, regardless of current breaker state.

---

## 4. Output mapping: status → FlexRadio spot colour/opacity/tooltip

### 4.1 Colour and opacity encoding

The final colour strings sent to the radio are 8-hex-digit
`#AARRGGBB`-style strings, built as:
```js
const backgroundOpacityHex = Math.round((backgroundOpacity / 100) * 255)
  .toString(16).padStart(2, '0').toUpperCase();
const textOpacityHex = Math.round((textOpacity / 100) * 255)
  .toString(16).padStart(2, '0').toUpperCase();

const finalBackgroundColor = `#${backgroundOpacityHex}${backgroundColor.slice(1)}`;
const finalTextColor = `#${textOpacityHex}${textColor.slice(1)}`;
```
i.e. a 2-hex-digit alpha byte computed from a 0–100 opacity percentage,
prepended to the 6 hex digits of the configured RGB colour (with its
leading `#` stripped). `textOpacity` is hard-coded to `100` (fully opaque
text) in every branch — only `backgroundOpacity` ever varies.
(`flexradio_client.js:sendSpot`)

These two strings are sent as the `color=` (text) and `background_color=`
(background) parameters of the FlexRadio TCP command:
```
spot add rx_freq=<f> tx_freq=<f> callsign=<call> mode=<mode> color=<finalTextColor> background_color=<finalBackgroundColor> source=wave-flex-integrator spotter_callsign=<spotter> timestamp=<t> lifetime_seconds=<n> priority=4 comment=<comment> trigger_action=tune
```
(`flexradio_client.js:sendSpot`)

### 4.2 Default colour/opacity values (from `defaultConfig.js`)

All of these are user-editable in the app's settings UI; values below are
the shipped defaults.

| Status | Text colour | Background colour | Opacity |
|---|---|---|---|
| `default` (fallback / no status applies) | `#2F2F2F` | `#F8F8F8` | 80% (hard-coded, not a config field) |
| `myCallsign` (own callsign spotted) | `#000000` | `#00FF00` | 80% (hard-coded) |
| `dxccNeeded` (`dxcc_confirmed === false`) | `#FFFFFF` | `#030F6D` | — (opacity governed by Step 3, §2.3) |
| `dxccNeededBand` (`dxcc_confirmed_on_band === false`) | `#FFFFFF` | `#0000FE` | — |
| `dxccNeededBandMode` (`dxcc_confirmed_on_band_mode === false`) | `#FFFFFF` | `#8BB7FE` | — |
| `notLotw` (`lotw_member === false`) | `#D94F4F` | *(unchanged — no background override)* | — |
| `callWorked` | *(unchanged)* | *(unchanged)* | 30% |
| `callWorkedBand` | *(unchanged)* | *(unchanged)* | 30% |
| `callWorkedBandMode` | *(unchanged)* | *(unchanged)* | 30% |
| `callConfirmed` | *(unchanged)* | *(unchanged)* | 30% |
| `callConfirmedBand` | *(unchanged)* | *(unchanged)* | 30% |
| `callConfirmedBandMode` | *(unchanged)* | *(unchanged)* | 30% |
| new/unmatched callsign (Step 3 final `else`) | *(unchanged)* | *(unchanged)* | 80% (hard-coded) |

(`defaultConfig.js`, `flexRadio.spotManagement.colors`)

Note all six `callWorked*`/`callConfirmed*` entries default to the same 30%
opacity value — they are independently configurable but ship identical.

### 4.3 Tooltip / comment text composition

The FlexRadio `comment=` parameter (shown as the spot's tooltip/popup text
in the panadapter, per `README.md`'s description of hover behaviour) is
built by concatenating short, fixed English phrases pushed onto an array as
each branch of the decision tree in §2.3 fires, in this exact order of
possible entries:

1. `'You.'` — only if Step 0 (own callsign) matched (and in that case, no
   further phrases are added).
2. Otherwise, at most one of: `'New DXCC.'` / `'DXCC needed for band.'` /
   `'DXCC needed for band and mode.'` (Step 1). If the DXCC-confirmed
   `else` branch was taken instead (all three DXCC flags `true`), no phrase
   is pushed for this step at all.
3. `'LoTW inactive.'` — appended if Step 2 (`lotw_member === false`) fired.
4. Exactly one of: `'Call confirmed on band and mode.'` /
   `'Worked before on band and mode.'` / `'Call confirmed on band.'` /
   `'Worked before on band.'` / `'Call confirmed.'` / `'Worked before'`
   (no trailing period on this one specifically) / `'New callsign.'`
   (Step 3, always exactly one of these seven).

The parts are joined with single spaces, the whole string is truncated to
120 characters with a `...` suffix if longer, and finally **every space
character is replaced with ASCII DEL (character code 127)** before being
placed into the `comment=` field of the FlexRadio command line — this is
necessary because the FlexRadio TCP command protocol is space-delimited
between `key=value` parameters, so literal spaces inside the comment value
would break parsing.
(`flexradio_client.js:sendSpot`)

---

## Unverified / ambiguous

The following could not be confirmed from this codebase alone and should be
checked against Wavelog directly (or with the codebase author) before a
third party relies on them:

1. **Exact shape of the `/api/station_info/<key>` and `/api/private_lookup`
   responses.** Both example JSON payloads in §1 are reconstructed only
   from the field names the code happens to read; Wavelog's real responses
   may include additional fields, different types (e.g. `lotw_member` could
   be sent as a string, number, or boolean by the server — the client
   handles all three), or differ in array vs. object shape under conditions
   this code doesn't branch on.
2. **Unit/semantics of `lotw_member`.** The code treats a non-`false`
   numeric value as a day-count and thresholds it against
   `max_days_lotw_considered_true` (default 200), but no code comment
   states the unit explicitly; this is an inference from the variable name
   and threshold arithmetic, not a documented fact in this repository (§2.4).
3. **How Wavelog resolves DXCC entity/confirmation status when the spotted
   callsign carries a portable suffix** (e.g. `/P`, `/MM`, numeric prefix
   overrides). The client sends the suffix through unmodified and only
   consumes whatever Wavelog echoes back in `suffix_slash`/`entity`/
   `dxcc_id` — the resolution logic itself is entirely server-side and out
   of view.
4. **Whether `station_ids` (`station_location_ids`) actually filters which
   logged QSOs count toward "confirmed"/"worked" on the Wavelog side**, and
   what happens when it is left at its default empty array. The client only
   passes the configured list through; the filtering behaviour is Wavelog's.
5. **Case-sensitivity of the "my callsign" comparison** on the
   `station_callsign` side (§2.2) — the spotted callsign is upper-cased
   before comparing, but `this.stationCallsign` (from Wavelog) is used
   as-is; whether Wavelog always returns upper-case callsigns is not
   verifiable here.
6. **Real-world Wavelog rate limits or expected latency** for
   `/api/private_lookup` under cluster-feed-level call volume — the 8-second
   client timeout and unbatched one-call-per-cache-miss design are the only
   facts established; no code addresses throttling in the other direction.
