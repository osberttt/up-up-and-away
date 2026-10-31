// Dev only: records the game canvas and its sound to a video file, for the demo video.
// Open the dev server with ?rec. Recording starts right away; press R to stop and save it
// (the browser downloads it). The red REC badge is a page element, so it isn't in the video.
import { audioStream } from './audio.js';

export function startRecorder(canvas) {
  const stream = canvas.captureStream(60);
  const audio = audioStream();
  if (audio) for (const t of audio.getAudioTracks()) stream.addTrack(t);

  // MP4 where the browser can (recent Chrome/Edge), otherwise WebM.
  const types = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
  const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t));
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.onstop = () => {
    const blob = new Blob(chunks, { type: mimeType });
    window.__recSize = blob.size; // for checking it from the console
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `UpUpAndAway_recording.${mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'}`;
    a.click();
    badge.textContent = 'SAVED';
    badge.style.background = '#2a7';
  };
  rec.start(1000);

  const badge = document.createElement('div');
  badge.textContent = 'REC · press R to stop and save';
  Object.assign(badge.style, { position: 'fixed', top: '8px', left: '8px', padding: '4px 10px', background: '#d33', color: '#fff', font: '12px sans-serif', borderRadius: '10px', zIndex: 10 });
  document.body.appendChild(badge);
  const t0 = performance.now();
  const tick = setInterval(() => {
    if (rec.state !== 'recording') return clearInterval(tick);
    const s = Math.floor((performance.now() - t0) / 1000);
    badge.textContent = `REC ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} · press R to stop and save`;
  }, 1000);

  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'r' && rec.state === 'recording') rec.stop();
  });
}
