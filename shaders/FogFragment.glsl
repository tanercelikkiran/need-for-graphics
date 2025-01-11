precision highp float;

in vec2 vUV;
in float vFogDepth;
out vec4 outColor;

uniform sampler2D diffuseMap;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uFogColor;
uniform bool uHasTexture;
uniform vec3 uSolidColor;

void main() {
    vec3 baseColor;
    if (uHasTexture) {
        baseColor = texture(diffuseMap, vUV).rgb; // Use the texture color
    } else {
        baseColor = uSolidColor; // Fallback to solid color
    }

    // Linear fog factor
    float fogFactor = smoothstep(uFogNear, uFogFar, vFogDepth);
    vec3 finalColor = mix(baseColor, uFogColor, fogFactor*0.9);

    outColor = vec4(finalColor, 1.0);
}