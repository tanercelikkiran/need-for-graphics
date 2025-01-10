precision highp float;

in vec3 position;
in vec2 uv;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

out vec2 vUV;
out float vFogDepth;

void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vFogDepth = -mvPosition.z;  // "distance" in camera's forward direction
    vUV = uv;
    gl_Position = projectionMatrix * mvPosition;
}