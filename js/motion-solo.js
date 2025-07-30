let video, canvas, ctx;
let lastAverage = 0;
let flapCallback = null;
let cooldown = false;

export async function initMotion(onFlap) {
  flapCallback = onFlap;

  // Hidden video
  video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  video.width = 160;
  video.height = 120;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    await video.play();
    console.log("✅ Motion detection initialized");
  } catch (err) {
    console.error("❌ Webcam access denied:", err);
    return;
  }

  // Hidden canvas for processing
  canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 120;
  ctx = canvas.getContext('2d');

  // Start detection loop
  requestAnimationFrame(detectMotion);
}

function detectMotion() {
  if (!video || video.readyState < 2) {
    requestAnimationFrame(detectMotion);
    return;
  }

  ctx.drawImage(video, 0, 0, 160, 120);
  const { data } = ctx.getImageData(0, 0, 160, 120);

  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const brightness = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    sum += brightness;
  }
  const avg = sum / (160 * 120);
  const diff = Math.abs(avg - lastAverage);

  if (diff > 5 && !cooldown && flapCallback) {
    console.log("🐤 Motion detected! Flap!");
    flapCallback();
    cooldown = true;
    setTimeout(() => (cooldown = false), 300);
  }

  lastAverage = avg;
  requestAnimationFrame(detectMotion);
}
