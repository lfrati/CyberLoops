function initShader(img) {
  let vertShader = `
	precision highp float;

	attribute vec3 aPosition;

	void main() {
		vec4 positionVec4 = vec4(aPosition, 1.0);
		positionVec4.xy = positionVec4.xy * 2.0 - 1.0;
		gl_Position = positionVec4;
	}
`;

  let fragShader = `
	precision highp float;
	
	uniform int particleCount;
	uniform vec2 resolution;
	uniform vec3 particles[${MAX_PARTICLE_COUNT}];
	uniform vec3 colors[${MAX_PARTICLE_COUNT}];

	void main() {

			vec2 st = gl_FragCoord.xy / resolution.xy;
      st /= ${pixelDensity()}.;
      float aspect = resolution.x / resolution.y;
      st.x *= aspect;

      vec3 col = vec3(0.);

			float mult = 0.00005;
			
			for (int i = 0; i < ${MAX_PARTICLE_COUNT}; i++) {
				if (i < particleCount) {
					vec3 particle = particles[i];
					vec2 pos = particle.xy;
          pos.xy += resolution.xy/2.; // center the particles (fourier -> canvas)
          pos.xy /= resolution.xy;    // scale to [0,1] (canvas -> shader flipped)
          pos.y = 1. - pos.y;         // fix y flippity (shader flipped -> shader)
          pos.x *= aspect;            // account for non-square canvas
					float mass = particle.z;
					vec3 color = colors[i];

					col += color / distance(st, pos) * mult * mass;
				}
			}

			gl_FragColor = vec4(col.rgb, 1.0);
	}
`;

  theShader = img.createShader(vertShader, fragShader);
  return theShader;
}
