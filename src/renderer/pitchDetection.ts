export interface PitchSample {
  midiNumber: number;
  confidence: number;
}

export function detectPitch(
  samples: Float32Array,
  sampleRate: number,
): PitchSample {
  let energy = 0;
  for (const sample of samples) energy += sample * sample;
  const rms = Math.sqrt(energy / samples.length);
  if (rms < 0.01) return { midiNumber: 0, confidence: 0 };

  const minLag = Math.floor(sampleRate / 1000);
  const maxLag = Math.min(Math.floor(sampleRate / 65), samples.length - 2);
  const correlations = new Float32Array(maxLag + 1);
  let bestLag = 0;
  let bestCorrelation = 0;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let correlation = 0;
    let leftEnergy = 0;
    let rightEnergy = 0;
    const limit = samples.length - lag;
    for (let i = 0; i < limit; i++) {
      const left = samples[i];
      const right = samples[i + lag];
      correlation += left * right;
      leftEnergy += left * left;
      rightEnergy += right * right;
    }
    const denominator = Math.sqrt(leftEnergy * rightEnergy);
    const normalized = denominator > 0 ? correlation / denominator : 0;
    correlations[lag] = normalized;
    if (normalized > bestCorrelation) {
      bestCorrelation = normalized;
      bestLag = lag;
    }
  }

  if (bestLag === 0 || bestCorrelation < 0.6) {
    return { midiNumber: 0, confidence: bestCorrelation };
  }

  const previous = correlations[bestLag - 1] || bestCorrelation;
  const next = correlations[bestLag + 1] || bestCorrelation;
  const curvature = previous - 2 * bestCorrelation + next;
  const offset = curvature === 0 ? 0 : (previous - next) / (2 * curvature);
  const frequency = sampleRate / (bestLag + offset);
  const midiNumber = 69 + 12 * Math.log2(frequency / 440);
  return { midiNumber, confidence: bestCorrelation };
}
