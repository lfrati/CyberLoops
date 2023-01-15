class Particle {
  constructor(x, y, vx, vy) {
    this.pos = new p5.Vector(x, y);
    this.vel = new p5.Vector(vx, vy);
    this.vel.mult(random(10));
    this.vel.rotate(radians(random(-25, 25)));
    this.mass = random(1, 20);
    this.airDrag = random(0.92, 0.98);
    this.color = random(colorScheme);
    this.r = red(this.color);
    this.g = green(this.color);
    this.b = blue(this.color);
  }

  move() {
    this.vel.mult(this.airDrag);
    this.pos.add(this.vel);
  }
}

class Particles {
  constructor(spawnThresh, dieThresh) {
    this.spawnThresh = spawnThresh;
    this.dieThresh = dieThresh;
    this.pmX = undefined;
    this.pmY = undefined;
    this.particles = [];
  }

  reset() {
    this.particles = [];
    this.pmX = undefined;
    this.pmY = undefined;
  }

  move(mX, mY) {
    // need previous xy to compute the speed
    if (this.pmX != undefined && this.pmY != undefined) {
      if (this.particles.length < MAX_PARTICLE_COUNT) {
        let point = new p5.Vector(mX, mY);
        point.sub(this.pmX, this.pmY);
        if (point.mag() > this.spawnThresh) {
          point.normalize();
          let particle = new Particle(this.pmX, this.pmY, point.x, point.y);
          this.particles.push(particle);
        }
      }
    }
    this.pmX = mX;
    this.pmY = mY;
  }

  update() {
    // Move and kill particles if they are too slow.
    let new_particles = [];
    for (let particle of this.particles) {
      particle.move();
      if (particle.vel.mag() >= this.dieThresh) {
        new_particles.push(particle);
      }
    }
    this.particles = new_particles;
  }

  prepareUniforms() {
    let data = {
      particles: [],
      colors: [],
      particleCount: this.particles.length,
    };

    for (let particle of this.particles) {
      data.particles.push(
        particle.pos.x,
        particle.pos.y,
        (particle.mass * particle.vel.mag()) / 100
      );

      data.colors.push(particle.r, particle.g, particle.b);
    }

    return data;
  }
}
