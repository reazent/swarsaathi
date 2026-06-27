// Pitch Engine v2 — AudioWorklet capture + Essentia worker (pYIN primary).

export class PitchEngine {
  constructor({ onFrame, onReady, onError } = {}) {
    this.onFrame = onFrame || (() => {});
    this.onReady = onReady || (() => {});
    this.onError = onError || (() => {});
    this.worker = null;
    this.workletNode = null;
    this.source = null;
    this.ready = false;
    this.running = false;
    this.saFreq = 130.81;
  }

  async start(audioCtx, stream) {
    await this.#ensureWorker();
    if (!this.ready) throw new Error("Pitch worker failed to initialize");

    if (!audioCtx.audioWorklet) {
      throw new Error("AudioWorklet is not supported in this browser.");
    }

    await audioCtx.audioWorklet.addModule("/static/pitch/capture-processor.js");

    this.source = audioCtx.createMediaStreamSource(stream);
    this.workletNode = new AudioWorkletNode(audioCtx, "milap-capture", {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
    });

    this.workletNode.port.onmessage = (event) => {
      if (event.data?.type !== "samples" || !this.running || !this.worker) return;
      this.worker.postMessage(
        { type: "samples", samples: event.data.samples },
        [event.data.samples.buffer],
      );
    };

    this.source.connect(this.workletNode);
    this.worker.postMessage({
      type: "config",
      sampleRate: audioCtx.sampleRate,
      saFreq: this.saFreq,
    });
    this.worker.postMessage({ type: "start" });
    this.running = true;
  }

  setSaFreq(saFreq) {
    this.saFreq = saFreq;
    this.configure({ saFreq });
  }

  stop() {
    this.running = false;
    this.worker?.postMessage({ type: "stop" });
    try {
      this.workletNode?.port?.close?.();
      this.workletNode?.disconnect();
      this.source?.disconnect();
    } catch (_e) {
      /* noop */
    }
    this.workletNode = null;
    this.source = null;
  }

  /** Keep worker octave logic aligned with the user's Sa. */
  configure({ sampleRate, saFreq } = {}) {
    if (!this.worker || !this.ready) return;
    this.worker.postMessage({
      type: "config",
      sampleRate,
      saFreq,
    });
  }

  dispose() {
    this.stop();
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
  }

  /** Warm up Essentia WASM in the worker (call on app init). */
  preload() {
    return this.#ensureWorker();
  }

  async #ensureWorker() {
    if (this.worker && this.ready) return;
    if (this.worker && !this.ready) {
      this.worker.terminate();
      this.worker = null;
    }

    this.worker = new Worker("/static/pitch/pitch-worker.js");
    this.worker.onerror = (event) => {
      this.onError(new Error(event.message || "Pitch worker script failed to load"));
    };
    this.worker.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === "ready") {
        this.ready = true;
        this.onReady(msg);
      } else if (msg.type === "frame") {
        this.onFrame(msg);
      } else if (msg.type === "error") {
        this.onError(new Error(msg.message || "Pitch worker error"));
      }
    };

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Pitch worker init timeout")), 15000);
      const onMsg = (event) => {
        if (event.data?.type === "ready") {
          clearTimeout(timeout);
          this.worker.removeEventListener("message", onMsg);
          resolve();
        }
        if (event.data?.type === "error") {
          clearTimeout(timeout);
          this.worker.removeEventListener("message", onMsg);
          reject(new Error(event.data.message || "Pitch worker init failed"));
        }
      };
      this.worker.addEventListener("message", onMsg);
      this.worker.postMessage({ type: "init" });
    });
  }
}
