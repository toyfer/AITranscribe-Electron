# Measured progress (trial)

**Branch:** `feature/measured-progress`  
**Status:** experimental — replaces fixed-mul-only pseudo bar with wall-clock + segment stream.

## Goals

1. Show **phase** (FFmpeg → model load → VAD/setup → infer → save).
2. During infer, drive the bar from **audio timeline** (`segment.end / info.duration`).
3. Log **wall-clock** and **RTF** for calibration (mul fallback + future local learning).

## Protocol

### Python → main (stdout)

Lines starting with `__AIT__` followed by one JSON object:

| `type` | Meaning |
|--------|---------|
| `phase` | `load` / `transcribe_setup` / `infer` / `write` (+ optional timings) |
| `progress` | `pct` 0–100 on audio timeline, `audio_end`, `duration`, `wall_sec` |
| `timing` | `t_load_sec`, `t_setup_sec`, `t_infer_sec`, `t_python_sec`, `rtf_infer`, … |
| `done` | Python side finished writing CSV |

Human-readable segment lines remain unchanged:

```text
[0.0s --> 1.2s]:こんにちは
```

### main → renderer (IPC)

- Channel: `process:Progress` (`CHANNELS.PROCESS_PROGRESS`)
- Preload: `electronAPI.processProgress(cb)` — string constant only (sandbox-safe)
- Payload examples: `{ type, phase, label, pct, mode, metrics?, ... }`

### Job % bands (UI)

| Band | Phase |
|------|--------|
| 0–2% | FFmpeg |
| 3–9% | load / setup |
| 10–95% | infer (`10 + audio_pct * 0.85`) |
| 96–99% | write / save |
| 100% | complete |

## Runtime knobs

- Python spawned with `-u` and `PYTHONUNBUFFERED=1` so progress is not block-buffered.
- Fallback timer (`MODEL_CATALOG.estimatedDurationMul`) only until the first measured event; turbo default mul raised to **1.5** (CPU-oriented).

## Log surfaces

1. UI textarea: `[timing]`, `[metrics]` lines
2. Notification body: total seconds + RTF when available
3. `src/Whisper/log.csv`: existing start row + extra `timing` row

## How to try

```bash
git fetch origin feature/measured-progress
git checkout feature/measured-progress
npm start   # or start:unix
```

Run a short clip on **small** and **turbo**, confirm:

- Phase label changes under the bar
- During infer, `Xs / Ys` and ETA update
- Log contains `[metrics] ffmpeg=… whisper=… total=… rtf=…`

## Out of scope (next)

- localStorage smoothing of RTF → next-run ETA
- Model stay-resident (avoid reload every job)
- True FFmpeg %-from-stderr parsing
- BatchedInferencePipeline
