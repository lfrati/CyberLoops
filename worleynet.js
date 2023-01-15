class WNetwork {
  constructor(s, hole, width, height) {
    this.s = s;
    this.centers = [];
    this.EMPTY = 0;
    this.FULL = 1;
    for (let i = -this.s; i < width + this.s; i += this.s) {
      let row = [];
      for (let j = -this.s; j < height + this.s; j += this.s) {
        let d = dist(i, j, width / 2, height / 2);
        if (d < hole) {
          row.push([i, j, this.EMPTY]);
        } else {
          row.push([i, j, this.FULL]);
        }
      }
      this.centers.push(row);
    }
    this.H = this.centers.length;
    this.W = this.centers[0].length;
    this.points = _.cloneDeep(this.centers);
  }

  show() {
    strokeWeight(1);
    for (let w = 0; w < this.W; w++) {
      for (let h = 0; h < this.H; h++) {
        let [x, y, z] = this.points[h][w];
        if (z == this.EMPTY) {
          //rect(x, y, s, s);
          continue;
        }
        //circle(x, y, 3);

        // check neighbors for connection
        for (let dw = -1; dw <= 1; dw++) {
          for (let dh = -1; dh <= 1; dh++) {
            if (dw == 0 && dh == 0) continue;
            let nw = w + dw;
            let nh = h + dh;
            if (nw < 0 || this.W <= nw) continue;
            if (nh < 0 || this.H <= nh) continue;
            let [nx, ny, nz] = this.points[nh][nw];
            if (nz == this.EMPTY) continue;
            let d = dist(x, y, nx, ny);
            stroke(200, ((1.5 * this.s - d) / (1.5 * this.s)) * 180);
            line(x, y, nx, ny);
          }
        }
      }
    }
  }
  update(t) {
    for (let w = 0; w < this.W; w++) {
      for (let h = 0; h < this.H; h++) {
        let [x, y, z] = this.centers[h][w];
        if (z == this.EMPTY) {
          this.points[h][w] = [x, y, z];
        } else {
          let n1 = noise(w, h);
          let n2 = noise(w + n1, h + n1);
          let dx = sin(n1 * (t + 10)) * this.s * 0.4;
          let dy = cos(n2 * (t + 10)) * this.s * 0.4;

          this.points[h][w] = [x + dx, y + dy, z];
        }
      }
    }
  }
}
