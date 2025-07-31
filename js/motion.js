let video, canvas, ctx;
let lastAverage = 0;
let flapCallback = null;
let cooldown = false;

const WIDTH = 160;
const HEIGHT = 120;
const MOTION_THRESHOLD = 5;     // Difference in brightness to trigger motion
const COOLDOWN_TIME = 300;      // ms cooldown between flaps

/**
 * Initialize motion detection
 * @param {Function} onFlap - Callback when motion is detected
 */
export async function initMotion(onFlap) {
  flapCallback = onFlap;

  // Setup hidden video
  video = Object.assign(document.createElement('video'), {
    autoplay: true,
    playsInline: true,
    muted: true,
    width: WIDTH,
    height: HEIGHT
  });

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    await video.play();
  } catch (err) {
    console.error("❌ Webcam access denied:", err);
    return;
  }

  // Hidden canvas for processing frames
  canvas = Object.assign(document.createElement('canvas'), { width: WIDTH, height: HEIGHT });
  ctx = canvas.getContext('2d');

  // Start detection loop
  requestAnimationFrame(detectMotion);
}

/**
 * Motion detection loop
 */
function detectMotion() {
  if (!video || video.readyState < 2) {
    requestAnimationFrame(detectMotion);
    return;
  }

  // Draw current frame and get brightness data
  ctx.drawImage(video, 0, 0, WIDTH, HEIGHT);
  const { data } = ctx.getImageData(0, 0, WIDTH, HEIGHT);

  // Compute average brightness
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  const avg = sum / (WIDTH * HEIGHT);
  const diff = Math.abs(avg - lastAverage);

  // Trigger flap if motion exceeds threshold
  if (diff > MOTION_THRESHOLD && !cooldown && flapCallback) {
    flapCallback();
    cooldown = true;
    setTimeout(() => cooldown = false, COOLDOWN_TIME);
  }

  lastAverage = avg;
  requestAnimationFrame(detectMotion);
}
