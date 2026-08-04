/**
 * Transcribe option defaults + clamp for the main process.
 * Keep defaults in sync with renderer.js SETTINGS_DEFAULTS.
 *
 * Target profile: CPU (e.g. i5-1335U) + 8GB RAM — beam_size 3 is the balance default.
 * Model choice (small/turbo) stays on the main UI; default remains turbo.
 */

const DEFAULTS = Object.freeze({
  beamSize: 3,
  hotwords: "",
  initialPrompt: "",
  vadFilter: true,
  vadMinSilenceMs: 500,
  conditionOnPreviousText: true,
});

const LIMITS = Object.freeze({
  beamSizeMin: 1,
  beamSizeMax: 10,
  vadMinSilenceMsMin: 100,
  vadMinSilenceMsMax: 5000,
  /** Rough char cap for hotwords / prompt (token limit is lower; this is a safety net). */
  textMaxChars: 2000,
});

/**
 * Normalize renderer-provided options for Python / faster-whisper.
 * @param {object} [raw]
 * @returns {{
 *   beam_size: number,
 *   hotwords: string,
 *   initial_prompt: string,
 *   vad_filter: boolean,
 *   vad_min_silence_ms: number,
 *   condition_on_previous_text: boolean,
 * }}
 */
function clampTranscribeOptions(raw) {
  const src = raw && typeof raw === "object" ? raw : {};

  let beam = Number(src.beamSize ?? src.beam_size ?? DEFAULTS.beamSize);
  if (!Number.isFinite(beam)) beam = DEFAULTS.beamSize;
  beam = Math.round(beam);
  if (beam < LIMITS.beamSizeMin) beam = LIMITS.beamSizeMin;
  if (beam > LIMITS.beamSizeMax) beam = LIMITS.beamSizeMax;

  let vadMs = Number(src.vadMinSilenceMs ?? src.vad_min_silence_ms ?? DEFAULTS.vadMinSilenceMs);
  if (!Number.isFinite(vadMs)) vadMs = DEFAULTS.vadMinSilenceMs;
  vadMs = Math.round(vadMs);
  if (vadMs < LIMITS.vadMinSilenceMsMin) vadMs = LIMITS.vadMinSilenceMsMin;
  if (vadMs > LIMITS.vadMinSilenceMsMax) vadMs = LIMITS.vadMinSilenceMsMax;

  const hotwords = String(src.hotwords ?? DEFAULTS.hotwords)
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, LIMITS.textMaxChars);

  const initialPrompt = String(src.initialPrompt ?? src.initial_prompt ?? DEFAULTS.initialPrompt)
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, LIMITS.textMaxChars);

  const vadFilter =
    typeof src.vadFilter === "boolean"
      ? src.vadFilter
      : typeof src.vad_filter === "boolean"
        ? src.vad_filter
        : DEFAULTS.vadFilter;

  const conditionOnPreviousText =
    typeof src.conditionOnPreviousText === "boolean"
      ? src.conditionOnPreviousText
      : typeof src.condition_on_previous_text === "boolean"
        ? src.condition_on_previous_text
        : DEFAULTS.conditionOnPreviousText;

  return {
    beam_size: beam,
    hotwords,
    initial_prompt: initialPrompt,
    vad_filter: vadFilter,
    vad_min_silence_ms: vadMs,
    condition_on_previous_text: conditionOnPreviousText,
  };
}

module.exports = { DEFAULTS, LIMITS, clampTranscribeOptions };
