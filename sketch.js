/*
15/01/2023:
- Implemented fullscreen + resize. Had to re-initialize shader and worleynet with new size.
- Hide cursor

17/01/2023:
- Cam aspect ratio: stuff looks distorted?
  There is not much I can do, if I adjust the aspect ratio hands might disappear 
  before touching the edges of the screen and that's worse
- Sparks too bright? Adjust color or number? ->
  Reduced the number of sparks.
- Spiky knuckles bug?
  Fixed. beginShape -> line
- window.location.reload() to periodically reload the sketch, to avoid nasty leaks.
  Done. Added timer information to the debug info. Enable with 'd'.

TODO:
- I still haven't managed to track down that weird bug that sometimes make the sketch disappear. 
- Cam orientation: fix? just deal with it sideways?
- After changing the fps + pixelDensity does stuff move too fast? 
*/

let DEBUG = false;
let T = 0;
let detections = undefined;
let particles;
let theShader;
let shaderTexture;
let detecting = false;

const Npoints = 1000;
const c = "rgb(3, 186, 252)";
const colorScheme = ["#E69F66", "#DF843A", "#D8690F", "#B1560D", "#8A430A"];
const MAX_PARTICLE_COUNT = 50;
const MAX_TRAIL_COUNT = 20;

const DETECT_SPEED = 0.05; // floop interpolation speed while detecting
const IDLE_SPEED = 0.01; // floop interpolation speed while idle
const IDLE_NOISE_MAG = 0.5; // magnitude of noise added to idle floop
const IDLE_NOISE_SPEED = 0.01; // time scaling of noise sampling
const NETWORK_SLOWDOWN = 60;
const TIME_RATE = 2; // control the speed of floop planet movement (use to tweak particle generation)
const SENSITIVITY = 100; // increase the effect of hand movement

const LIFESPAN = 30 * 1000; // 5 minutes in milliseconds

const features = [
  // FINGERS
  [1, 2, 3],
  [2, 3, 4],
  [5, 6, 7],
  [6, 7, 8],
  [9, 10, 11],
  [10, 11, 12],
  [13, 14, 15],
  [14, 15, 16],
  [17, 18, 19],
  [18, 19, 20],
  // PALM
  // [1, 0, 5],
  // [5, 0, 9],
  // [9, 0, 13],
  // [13, 0, 17],
];

const Nfeatures = features.length * 2; // 2 hands
const WORLEY_SPACING = 100;
const WORLEY_HOLE = 300;

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  shaderTexture.remove();
  shaderTexture = createGraphics(width, height, WEBGL);
  init();
}

function keyTyped() {
  if (key == "d") {
    DEBUG = !DEBUG;
  }
}

function mousePressed() {
  let fs = fullscreen();
  fullscreen(!fs);
  // document.querySelector("body").webkitRequestFullscreen();
  // document.body.requestFullscreen();
  // fullscreen();
}

function init() {
  theShader = initShader(shaderTexture);
  particles = new Particles(8, 0.5);
  floop = new FourierLoop(Nfeatures);
  network = new WNetwork(WORLEY_SPACING, WORLEY_HOLE, width, height);
  // size, border, foreground, background
  logo = new Logo(20, 8, 180, -1);
  frameCount = 0; // safety: worley net uses this value to update. Avoid huge numbers.
  console.log("sketch re-initialized.");
}

function setup() {
  frameRate(60);
  pixelDensity(1);
  noCursor();
  strokeCap(ROUND);
  textAlign(CENTER);

  createCanvas(windowWidth, windowHeight);
  shaderTexture = createGraphics(width, height, WEBGL);
  video = createCapture(VIDEO);
  video.hide();

  initModel();
  init();

  // I wish I could just window.location.reload();
  // but for security reasons the browser doesn't let code
  // turn on fullscreen without user interaction...
  setInterval(init, LIFESPAN);
}

function draw() {
  background(0);

  if (!detections) {
    // Loading model
    noStroke();
    fill(255);
    textSize(32);
    text("Waking up", width / 2, height / 2);
    network.update(frameCount / NETWORK_SLOWDOWN);
    network.show();
    return;
  }

  T += TIME_RATE;
  if (T > Npoints) {
    T = 0;
    floop.resampleIdle();
  }

  let data = particles.prepareUniforms();
  // PARTICLES SHADER
  shaderTexture.noStroke();
  shaderTexture.shader(theShader);
  theShader.setUniform("resolution", [width, height]);
  theShader.setUniform("particleCount", data.particleCount);
  theShader.setUniform("particles", data.particles);
  theShader.setUniform("colors", data.colors);
  shaderTexture.rect(0, 0, width, height);
  image(shaderTexture, 0, 0, width, height);

  // logo.show(HALF_PI);
  logo.show();

  if (DEBUG) {
    image(video, 0, 0, video.width, video.height); // show user
    let remaining = LIFESPAN - (millis() % LIFESPAN);
    let formatted = new Date(remaining).toISOString().slice(14, 19);
    text(formatted, 50, height - 30); // show time before next reset
  }

  network.update(frameCount / NETWORK_SLOWDOWN);
  network.show();

  showHands();

  push();
  translate(width / 2, height / 2);
  points = floop.makePoints();
  console.assert(points.length > 0);
  drawPoints(points, true);
  // second pass for extra blur
  drawPoints(points, true);
  // drawPoints(points);
  pop();

  if (detections.multiHandLandmarks.length < 2) {
    if (detecting) {
      // STATE: DETECTION -> NO DETECTION
      floop.resampleIdle(); // start interpolating towards idle after losing detection
      //floop.idleCoeffs = floop.coeffs; // persist floop for a bit after detection stops
      floop.noise_off = random(10000);
      detecting = false;
    }

    floop.idle(IDLE_SPEED);
    return;
  }

  // --------------- BELOW HERE 2 HANDS HAVE BEEN DETECTED

  detecting = true;
  floop.compute(detections, DETECT_SPEED);
}

class FourierLoop {
  constructor(nfeats) {
    this.coeffs = [];
    this.idleCoeffs = [];
    this.nfeats = nfeats;
    this.resampleIdle();
    this.coeffs = _.cloneDeep(this.idleCoeffs);
    this.noise_off = 0;
  }

  lerpCoeff(c1, c2, t) {
    return {
      dir: c1.dir,
      phase: lerp(c1.phase, c2.phase, t),
      speed: c1.speed,
      radius: lerp(c1.radius, c2.radius, t),
    };
  }

  resampleIdle() {
    this.idleCoeffs = [];
    for (let i = 0; i < this.nfeats; i++) {
      this.idleCoeffs.push({
        dir: random([-1, +1]),
        phase: random(0, TWO_PI),
        speed: TWO_PI * random([1, 2, 3, 4]),
        radius: 5 + random(0, 10),
      });
    }
  }

  idle(speed) {
    for (let i in this.coeffs) {
      // ~0 : fourier_shape changes slowly  (laggy)
      // ~1 : fourier_shape changes quickly (jittery)
      this.coeffs[i] = this.lerpCoeff(
        this.coeffs[i],
        this.idleCoeffs[i],
        speed
      );
      // completely still during idle is boring, add some noise to make it move
      this.coeffs[i].radius += map(
        noise(i, frameCount * IDLE_NOISE_SPEED),
        0,
        1,
        -IDLE_NOISE_MAG,
        IDLE_NOISE_MAG
      );
    }
  }

  compute(detections, speed) {
    let new_coeffs = [];
    for (let hand of detections.multiHandLandmarks) {
      for (let i in features) {
        let [p1, p2, p3] = features[i];
        let v1 = createVector(hand[p1].x, hand[p1].y);
        let v2 = createVector(hand[p2].x, hand[p2].y);
        let v3 = createVector(hand[p3].x, hand[p3].y);
        let v4 = p5.Vector.sub(v1, v2);
        let v5 = p5.Vector.sub(v3, v2);
        let value = v4.angleBetween(v5); // [-PI,+PI]

        let radius = 5 + sin(value) * SENSITIVITY;
        let dir = value > 0 ? +1 : -1;
        let speed = TWO_PI * i;
        let phase = noise(i + this.noise_off) * TWO_PI;
        let coeff = { dir, radius, speed, phase };

        new_coeffs.push(coeff);
      }
    }
    for (let i in this.coeffs) {
      // ~0 : fourier_shape changes slowly  (laggy)
      // ~1 : fourier_shape changes quickly (jittery)
      this.coeffs[i] = this.lerpCoeff(this.coeffs[i], new_coeffs[i], speed);
    }
  }

  fourier(t) {
    let x = 0;
    let y = 0;
    for (let c of floop.coeffs) {
      let angle = c.phase + c.dir * t * c.speed;
      x = x + c.radius * cos(angle);
      y = y + c.radius * sin(angle);
    }
    return { x, y };
  }

  makePoints() {
    let points = [];
    for (let i = 0; i <= Npoints; i++) {
      let p = this.fourier(i / Npoints);
      points.push(p);
      if (i == T) {
        particles.move(p.x, p.y);
        particles.update();
      }
    }
    return points;
  }
}

// https://google.github.io/mediapipe/solutions/hands.html

function onResults(results) {
  detections = results;
}

function initModel() {
  hands = new Hands({
    locateFile: (file) => {
      return `@mediapipe/hands/${file}`;
    },
  });

  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7,
  });
  hands.onResults(onResults);

  cam = new Camera(video.elt, {
    onFrame: async () => {
      await hands.send({ image: video.elt });
    },
    width: video.width,
    height: video.height,
  });
  cam.start();
}

// Structure of coeffs:
// {
//   dir: -1,                   // direction of rotation
//   phase: random(0, TWO_PI),  // offset to start of rotation, if 0 everything would line up at the start/end
//   speed: TWO_PI * i,         // speed of rotation (multiple of TWO_PI for closed loop)
//   radius: random(1, 50),     // size of the orbit
// }

function drawPoints(points, enableCircle) {
  push();
  noFill();
  stroke("white");
  strokeWeight(1);
  drawingContext.shadowBlur = 32;
  drawingContext.shadowColor = color(3, 186, 252);
  beginShape();
  for (let i in points) {
    let p = points[i];
    vertex(p.x, p.y);
    if (enableCircle && i == T) {
      push();
      fill("white");
      noStroke();
      circle(p.x, p.y, 10);
      pop();
    }
  }
  endShape(CLOSE);
  pop();
}

function showHands() {
  push();
  // SELFIE MIRROR
  translate(width, 0);
  scale(-1, 1);
  noFill();
  strokeWeight(4);
  stroke(255, 255, 255, 100);
  // XXX: don't assume right/left hand is always returned first/second
  for (let hand of detections.multiHandLandmarks) {
    // for (let landmark of hand) {
    //   ellipse(landmark.x * width, landmark.y * height, 5);
    // }
    for (let i = 0; i < features.length - 1; i += 2) {
      let [d1, d2, d3] = features[i];
      let l1 = hand[d1];
      let l2 = hand[d2];
      let l3 = hand[d3];
      let l4 = hand[d3 + 1];

      line(l1.x * width, l1.y * height, l2.x * width, l2.y * height);
      line(l2.x * width, l2.y * height, l3.x * width, l3.y * height);
      line(l3.x * width, l3.y * height, l4.x * width, l4.y * height);
      push();
      noStroke();
      fill(255, 255, 255, 100);
      circle(l2.x * width, l2.y * height, 6);
      circle(l3.x * width, l3.y * height, 6);
      pop();
    }
  }
  pop();
}
