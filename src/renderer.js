  /**
   * Read parameter values from the UI inputs with validation.
   * Model is hard-coded to Qwen3.5-0.8B in main process; renderer
   * does not pass modelPath (SummarizeJob auto-picks the GGUF).
   *
   * Uses Number.isFinite() instead of `||` fallback so an explicitly
   * entered value of 0 (e.g. temperature=0 for deterministic output)
   * is preserved instead of being replaced by the default.
   * @returns {{ ctxSize: number, maxTokens: number, temperature: number }}
   */
  #getSummarizeOptions() {
    const rawCtx = parseInt(this.paramCtx?.value, 10);
    const ctxSize = Math.max(
      512,
      Math.min(32768, Number.isFinite(rawCtx) ? rawCtx : 4096)
    );

    const rawTokens = parseInt(this.paramTokens?.value, 10);
    const maxTokens = Math.max(
      128,
      Math.min(8192, Number.isFinite(rawTokens) ? rawTokens : 1024)
    );

    const rawTemp = Number.parseFloat(this.paramTemp?.value);
    const temperature = Math.max(
      0,
      Math.min(2, Number.isFinite(rawTemp) ? rawTemp : 0.4)
    );

    return { ctxSize, maxTokens, temperature };
  }
