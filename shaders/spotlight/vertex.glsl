#version 300 es
precision highp float;

// Inputs from our vertex buffer
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;

uniform mat4 uModelMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uProjectionMatrix;
uniform mat3 uNormalMatrix; // for transforming normals

// Varyings to pass to fragment shader
out vec3 vWorldPos;
out vec3 vNormal;

void main() {
    // Compute world-space position
    vec4 worldPos = uModelMatrix * vec4(aPosition, 1.0);
    vWorldPos = worldPos.xyz;

    // Transform normal to world space
    vNormal = normalize(uNormalMatrix * aNormal);

    // Final clip-space position
    gl_Position = uProjectionMatrix * uViewMatrix * worldPos;
}