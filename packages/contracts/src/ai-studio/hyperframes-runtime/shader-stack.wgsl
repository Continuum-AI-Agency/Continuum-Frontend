struct Params {
  size: vec2f,
  time: f32,
  kind: f32,
  primary: vec4f,
  secondary: vec4f,
}

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var srcSampler: sampler;
@group(0) @binding(2) var<uniform> params: Params;

// PCG over integer inputs, so grain is bit-identical on every GPU: fract(sin(…)) is not
// (Metal and SwiftShader disagree on sin's low bits — 26 dB between two renders of one
// frame). The top 24 bits convert to f32 exactly.
fn pcg(value: u32) -> u32 {
  let state = value * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

fn rand(position: vec2f, seed: f32) -> f32 {
  let x = bitcast<u32>(i32(position.x));
  let y = bitcast<u32>(i32(position.y));
  let s = bitcast<u32>(i32(seed));
  return f32(pcg(x ^ pcg(y ^ pcg(s))) >> 8u) / 16777215.0;
}

fn chromaKey(color: vec4f) -> vec4f {
  let key = params.primary.rgb;
  let tolerance = params.primary.a;
  let softness = max(params.secondary.x, 0.0001);
  let distance = length(color.rgb - key) / 1.7320508;
  let keep = smoothstep(tolerance, tolerance + softness, distance);
  return vec4f(color.rgb, color.a * keep);
}

fn tint(color: vec4f) -> vec4f {
  return vec4f(mix(color.rgb, params.primary.rgb, params.primary.a), color.a);
}

fn vignette(uv: vec2f, color: vec4f) -> vec4f {
  let centered = uv * 2.0 - 1.0;
  let radius = length(centered) / 1.41421356;
  let falloff = clamp((radius - 0.35) / 0.65, 0.0, 1.0);
  return vec4f(color.rgb * (1.0 - params.primary.x * falloff * falloff), color.a);
}

fn filmGrain(uv: vec2f, color: vec4f) -> vec4f {
  let seed = round(params.time * 1000.0);
  let noise = (rand(floor(uv * params.size), seed) * 2.0 - 1.0) * params.primary.x * 0.125;
  return vec4f(color.rgb + vec3f(noise), color.a);
}

fn pixelate(uv: vec2f) -> vec4f {
  let block = max(params.primary.x, 2.0);
  let cell = (floor(uv * params.size / block) + 0.5) * block / params.size;
  return textureSampleLevel(src, srcSampler, clamp(cell, vec2f(0.0), vec2f(1.0)), 0.0);
}

fn chromaticAberration(uv: vec2f, color: vec4f) -> vec4f {
  let centered = uv * 2.0 - 1.0;
  let offset = centered * params.primary.x * 0.01;
  let red = textureSampleLevel(src, srcSampler, clamp(uv + offset, vec2f(0.0), vec2f(1.0)), 0.0).r;
  let blue = textureSampleLevel(src, srcSampler, clamp(uv - offset, vec2f(0.0), vec2f(1.0)), 0.0).b;
  return vec4f(red, color.g, blue, color.a);
}

fn vhs(uv: vec2f, color: vec4f) -> vec4f {
  let amount = params.primary.x;
  let row = floor(uv.y * params.size.y);
  let seed = round(params.time * 1000.0);
  let tape = (rand(vec2f(0.0, row), seed) * 2.0 - 1.0) * amount * 0.006;
  let shift = amount * 0.006;
  let r = textureSampleLevel(src, srcSampler, clamp(uv + vec2f(tape - shift, 0.0), vec2f(0.0), vec2f(1.0)), 0.0).r;
  let b = textureSampleLevel(src, srcSampler, clamp(uv + vec2f(tape + shift, 0.0), vec2f(0.0), vec2f(1.0)), 0.0).b;
  let scanline = select(1.0, 1.0 - 0.25 * amount, u32(row) % 2u == 1u);
  return vec4f(vec3f(r, color.g, b) * scanline, color.a);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let color = textureSampleLevel(src, srcSampler, uv, 0.0);
  if params.kind < 1.5 { return chromaKey(color); }
  if params.kind < 2.5 { return tint(color); }
  if params.kind < 3.5 { return vignette(uv, color); }
  if params.kind < 4.5 { return filmGrain(uv, color); }
  if params.kind < 5.5 { return pixelate(uv); }
  if params.kind < 6.5 { return chromaticAberration(uv, color); }
  if params.kind < 7.5 { return vhs(uv, color); }
  return color;
}
