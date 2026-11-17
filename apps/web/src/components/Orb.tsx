import { useEffect, useRef } from 'react';

// A small, local WebGL surface. No network asset, library, or model call is involved.
const fragment = `
precision mediump float;
uniform vec2 u_resolution;
uniform float u_time;
void main() {
  vec2 p = (gl_FragCoord.xy / u_resolution - .5) * 2.16;
  float r = length(p);
  if (r > 1.) { gl_FragColor = vec4(0.); return; }
  float z = sqrt(1. - r*r);
  vec3 n = normalize(vec3(p, z));
  float t = u_time * .24;
  float a = atan(p.y, p.x) + t;
  float waves = sin(3.4*a + 4.0*r - t*.5) + cos(n.y*6.0 - n.x*4.0 + t);
  float flow = sin(waves*1.8 + z*5.0 + t*.8);
  vec3 violet = vec3(.27, .08, .8);
  vec3 blue = vec3(.015, .19, .72);
  vec3 cyan = vec3(.04, .87, .92);
  vec3 color = mix(blue, violet, .5+.5*sin(a*2.0 + flow));
  color = mix(color, cyan, smoothstep(.38,.94, flow));
  color = mix(color, vec3(.98,.39,.15), pow(max(0.,sin(waves*2.6 + 1.5)),16.)*.72);
  float stripe = pow(.5+.5*sin(waves*3.0+z*6.0), 8.);
  color *= .12 + .75*z + stripe*.6;
  vec3 light = normalize(vec3(-.5,.8,1.2));
  float gloss = pow(max(dot(n,light),0.), 70.);
  float gloss2 = pow(max(dot(n,normalize(vec3(.6,-.65,.7))),0.), 45.);
  color += vec3(.62,.85,1.)*gloss*.85 + vec3(.12,.9,1.)*gloss2*.45;
  float fresnel = pow(1.-z, 3.);
  color += fresnel * mix(vec3(.15,.13,.54),vec3(.08,.8,1.),p.y*.5+.5)*.7;
  float alpha = 1. - smoothstep(.985,1.,r);
  gl_FragColor = vec4(color, alpha);
}`;

export function Orb() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const gl = element.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false });
    if (!gl) return;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); return null; }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, 'attribute vec2 a_position; void main(){gl_Position=vec4(a_position,0.,1.);}');
    const pixel = compile(gl.FRAGMENT_SHADER, fragment);
    if (!vertex || !pixel) { if (vertex) gl.deleteShader(vertex); if (pixel) gl.deleteShader(pixel); return; }
    const program = gl.createProgram();
    if (!program) { gl.deleteShader(vertex); gl.deleteShader(pixel); return; }
    gl.attachShader(program, vertex);
    gl.attachShader(program, pixel);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(pixel);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); return; }
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const resolution = gl.getUniformLocation(program, 'u_resolution');
    const time = gl.getUniformLocation(program, 'u_time');
    const size = Math.round(210 * Math.min(window.devicePixelRatio, 1.75));
    element.width = size; element.height = size;
    gl.viewport(0, 0, size, size);
    gl.uniform2f(resolution, size, size);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const draw = (now: number) => {
      gl.uniform1f(time, reduced.matches ? 8 : now / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      element.dataset.ready = 'true';
      if (!reduced.matches && !document.hidden) frame = requestAnimationFrame(draw);
    };
    const update = () => { cancelAnimationFrame(frame); draw(performance.now()); };
    reduced.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      reduced.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
      gl.deleteBuffer(buffer); gl.deleteProgram(program);
    };
  }, []);
  return <div className="orb-scene" aria-hidden="true"><div className="orb-halo" /><div className="orb-fallback" /><canvas ref={canvas} className="orb-canvas" /></div>;
}
