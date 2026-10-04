export function clampTime(seconds, duration) {
  return Number.isFinite(duration) && duration > 0 ? Math.max(0, Math.min(duration, Number(seconds) || 0)) : 0;
}

export function progressAt(seconds, duration) {
  return Number.isFinite(duration) && duration > 0 ? clampTime(seconds, duration) / duration : 0;
}

export function tonearmAngle(progress, hasTrack) {
  return hasTrack ? 9 + 27 * Math.max(0, Math.min(1, Number(progress) || 0)) : 6;
}

export function formatTime(seconds) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return Math.floor(value / 60) + ":" + String(value % 60).padStart(2, "0");
}

export function waveformPeaks(buffer, count = 90) {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const peaks = Array.from({ length: count }, (_, i) => {
    const start = Math.floor(i * buffer.length / count), end = Math.floor((i + 1) * buffer.length / count);
    let sum = 0, samples = 0;
    for (const channel of channels) {
      for (let j = start; j < end; j += 8) { sum += channel[j] ** 2; samples++; }
    }
    return samples ? Math.sqrt(sum / samples) : 0;
  });
  const maximum = Math.max(...peaks);
  return peaks.map(value => maximum ? value / maximum : 0);
}
