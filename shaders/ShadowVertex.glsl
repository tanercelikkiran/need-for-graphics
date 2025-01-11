precision highp float;

// Matrices
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 lightViewMatrix;       // Light's view matrix
uniform mat4 lightProjectionMatrix; // Light's projection matrix

in vec3 position;
in vec3 normal;
in vec2 uv;

out vec3 vWorldPos;       // Pass world position to fragment
out vec3 vWorldNormal;    // Pass normal in world space
out vec2 vUV;             // Pass UV
out vec4 vShadowCoord;    // Light's clip space position

void main() {
    // Compute world-space position
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos     = worldPos.xyz;

    // For correct lighting, transform normal by normalMatrix if needed.
    // For simplicity, assume no non-uniform scale. If you do, pass
    // a normalMatrix = inverseTranspose(modelMatrix) as uniform.
    vec3 worldNormal = mat3(modelMatrix) * normal;
    vWorldNormal     = normalize(worldNormal);

    // Pass UV
    vUV = uv;

    // Calculate shadow coordinate (light clip space)
    // 1) transform to light view space
    vec4 lightViewPos = lightViewMatrix * worldPos;
    // 2) transform to light projection space
    vShadowCoord = lightProjectionMatrix * lightViewPos;

    // Standard camera clip-space position
    gl_Position = projectionMatrix * viewMatrix * worldPos;
}