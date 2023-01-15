function reseed() {
  seed = int(`${day()}${hour()}${second()}${millis()}`);
  console.log("seed", seed);
  randomSeed(seed);
}

function saveShaders(vs, fs) {
  if (key == "d") {
    // Download
    timestamp = `${hour()}-${minute()}-${second()}`;
    name = `shader_${timestamp}.txt`;
    console.log("Saving shader to", name);
    saveStrings([vs, fs], name);
  } else if (key == "s") {
    // Screenshot
    timestamp = `${hour()}-${minute()}-${second()}`;
    name = `canvas_${timestamp}`;
    saveCanvas(name, "jpg");
  }
  return false;
}

// Some easing functions
Ease = {
  // no easing, no acceleration
  linear: (t) => t,
  // accelerating from zero velocity
  easeInQuad: (t) => t * t,
  // decelerating to zero velocity
  easeOutQuad: (t) => t * (2 - t),
  // acceleration until halfway, then deceleration
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  // accelerating from zero velocity
  easeInCubic: (t) => t * t * t,
  // decelerating to zero velocity
  easeOutCubic: (t) => --t * t * t + 1,
  // acceleration until halfway, then deceleration
  easeInOutCubic: (t) =>
    t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  // accelerating from zero velocity
  easeInQuart: (t) => t * t * t * t,
  // decelerating to zero velocity
  easeOutQuart: (t) => 1 - --t * t * t * t,
  // acceleration until halfway, then deceleration
  easeInOutQuart: (t) =>
    t < 0.5 ? 8 * t * t * t * t : 1 - 8 * --t * t * t * t,
  // accelerating from zero velocity
  easeInQuint: (t) => t * t * t * t * t,
  // decelerating to zero velocity
  easeOutQuint: (t) => 1 + --t * t * t * t * t,
  // acceleration until halfway, then deceleration
  easeInOutQuint: (t) =>
    t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * --t * t * t * t * t,
  easeInElastic: (t) => {
    const c4 = (2 * Math.PI) / 3;

    return t === 0
      ? 0
      : t === 1
      ? 1
      : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
  },
  easeOutElastic: (t) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0
      ? 0
      : t === 1
      ? 1
      : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },

  easeInOutElastic: (t) => {
    var s = 2 * t - 1; // remap: [0,0.5] -> [-1,0]
    var k = ((80 * s - 9) * Math.PI) / 18; // and    [0.5,1] -> [0,+1]
    if (s < 0) return -0.5 * Math.pow(2, 10 * s) * Math.sin(k);
    else return 1 + 0.5 * Math.pow(2, -10 * s) * Math.sin(k);
  },
};

class Logo {
  constructor(size, border, foreground = "black", background = "white") {
    this.size = size;
    this.border = border;
    this.logo = createGraphics(size, size);
    if (background < 0) {
      this.logo.clear();
    } else {
      this.logo.background(background);
    }
    this.logo.noStroke();
    this.logo.fill(foreground);
    // L
    // rect(x,y, width,height)
    this.logo.rect(0, 0, this.size / 5, this.size);
    this.logo.rect(0, (this.size * 4) / 5, (this.size * 3) / 5, this.size / 5);
    // F
    this.logo.rect((this.size * 4) / 5, 0, this.size / 5, this.size);
    this.logo.rect((this.size * 2) / 5, 0, (this.size * 3) / 5, this.size / 5);
    // center
    this.logo.rect(
      (this.size * 2) / 5,
      (this.size * 2) / 5,
      this.size / 5,
      this.size / 5
    );
  }
  show() {
    image(
      this.logo,
      width - this.size - this.border,
      height - this.size - this.border,
      this.size,
      this.size
    );
  }
}
