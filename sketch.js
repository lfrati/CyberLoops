let t = 0;
let detections = undefined;
// let remote = true;
let particles;
let theShader;
let shaderTexture;
let detecting = false;
/*
LOG:
15/01/2023:
- Implemented fullscreen + resize. Had to re-initialize shader and worleynet with new size.
- Hide cursor

TODO:
- window.location.reload() to periodically reload the sketch, to avoid nasty leaks.
- I still haven't managed to track down that weird bug that sometimes make the sketch disappear. Haven't seen it strike on windows yet.
- Spiky knuckles bug?
- Cam orientation: fix? just deal with it sideways?
- Cam aspect ratio: stuff looks distorted?
- Sparks too bright? Adjust color or number?
- After changing the fps + pixelDensity does stuff move too fast? 
*/

const DEBUG = false;

const Npoints = 1000;
const remote = false;
const c = "rgb(3, 186, 252)";
const colorScheme = ["#E69F66", "#DF843A", "#D8690F", "#B1560D", "#8A430A"];
const MAX_PARTICLE_COUNT = 70;
const MAX_TRAIL_COUNT = 30;

const DETECT_SPEED = 0.05; // floop interpolation speed while detecting
const IDLE_SPEED = 0.01; // floop interpolation speed while idle
const IDLE_NOISE_MAG = 0.5; // magnitude of noise added to idle floop
const IDLE_NOISE_SPEED = 0.01; // time scaling of noise sampling
const NETWORK_SLOWDOWN = 40;
const TIME_RATE = 3; // control the speed of floop planet movement (use to tweak particle generation)
const SENSITIVITY = 100; // increase the effect of hand movement

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
const worleySpacing = 100;

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  init();
}

function mousePressed() {
  let fs = fullscreen();
  fullscreen(!fs);
  //document.querySelector("body").webkitRequestFullscreen();
}

function init() {
  shaderTexture = createGraphics(width, height, WEBGL);
  theShader = initShader(shaderTexture);
  particles = new Particles(8, 0.5);
  floop = new FourierLoop(Nfeatures);
  network = new WNetwork(worleySpacing, 200, width, height);
}

function setup() {
  fullscreen();
  frameRate(60);
  pixelDensity(1);
  noCursor();
  strokeCap(ROUND);
  createCanvas(windowWidth, windowHeight);
  initModel();
  
  // size, border, foreground, background
  logo = new Logo(20, 8, 180, -1);

  init();
}

function draw() {
  // background(50); // TODO: tweak the shader brightness to use a non-black background
  background(0);
  noStroke();

  if (!detections && initializing) {
    // Loading
    noStroke();
    fill(255);
    textSize(32);
    text(
      "Model loading." + ".".repeat(round(frameCount / 20)),
      100,
      height / 2
    );
    return;
  }

  t += TIME_RATE;
  if (t > Npoints) {
    t = 0;
    floop.resampleIdle();
  }

  logo.show();

  // SELFIE MIRRORING
  translate(width, 0); // move to far corner
  scale(-1.0, 1.0); // flip x-axis backwards

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
  if (DEBUG) {
    // debug print of particles
    for (let i = 0; i < data.particleCount * 3; i += 3) {
      let x = data.particles[i];
      let y = data.particles[i + 1];
      fill("pink");
      circle(width / 2 + x, height / 2 + y, 4);
    }
  }

  if (DEBUG) {
    image(video, 0, 0, width, height); // show user
  }

  network.update(frameCount / NETWORK_SLOWDOWN);
  network.show();

  showHands();

  push();
  translate(width / 2, height / 2);
  points = floop.makePoints();
  drawPoints(points, true);
  // second pass for extra blur
  drawPoints(points, true);
  // drawPoints(points);
  pop();

  if (detections.multiHandLandmarks.length < 2) {
    if (detecting) {
      // STATE: DETECTION -> NO DETECTION
      // noiseSeed();
      // floop.resampleIdle();
      // particles.reset();
      floop.noise_off = random(10000);
      floop.idleCoeffs = floop.coeffs;
      detecting = false;
      console.log("lost");
    }

    floop.idle(IDLE_SPEED);

    return;
  }

  // --------------- BELOW HERE 2 HANDS HAVE BEEN DETECTED

  if (!detecting) {
    // STATE: NO DETECTION -> DETECTION
    detecting = true;
    console.log("detected");
  }

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
      if (i == t) {
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
  initializing = true; // horrible hack to make sure I call this, in draw I check this variable
  hands = new Hands({
    locateFile: (file) => {
      if (remote) {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
      }
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

  video = createCapture(VIDEO);
  video.hide();

  cam = new Camera(video.elt, {
    onFrame: async () => {
      await hands.send({ image: video.elt });
    },
    width: width,
    height: height,
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
    if (enableCircle && i == t) {
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
      beginShape();
      vertex(l1.x * width, l1.y * height);
      vertex(l2.x * width, l2.y * height);
      vertex(l3.x * width, l3.y * height);
      vertex(l4.x * width, l4.y * height);
      endShape();
      push();
      noStroke();
      fill(255, 255, 255, 100);
      circle(l2.x * width, l2.y * height, 6);
      circle(l3.x * width, l3.y * height, 6);
      pop();
    }
  }
}
