class MilapCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunk = new Float32Array(512);
    this.pos = 0;
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;

    for (let i = 0; i < input.length; i += 1) {
      this.chunk[this.pos++] = input[i];
      if (this.pos >= this.chunk.length) {
        const out = this.chunk.slice(0);
        this.port.postMessage({ type: "samples", samples: out }, [out.buffer]);
        this.pos = 0;
        this.chunk = new Float32Array(512);
      }
    }
    return true;
  }
}

registerProcessor("milap-capture", MilapCaptureProcessor);
