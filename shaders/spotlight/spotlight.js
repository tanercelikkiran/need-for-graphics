const vertexShader = `
#version 300 es
precision highp float;

// Inputs from our vertex buffer
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;

// Uniforms
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
`;
const fragmentShader = `
#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNormal;

out vec4 fragColor;

// Define a spotlight struct
struct SpotLight {
    vec3 position;   // world-space position of the spotlight
    vec3 direction;  // normalized direction light is pointing
    vec3 color;      // RGB color/intensity
    float innerCutoff; // cos(inner cone angle)
    float outerCutoff; // cos(outer cone angle)
};

// Maximum number of spotlights we’ll support
#define MAX_SPOTLIGHTS 20

// Uniforms
uniform SpotLight spotLights[MAX_SPOTLIGHTS];
uniform int uNumSpotLights;

void main() {
    vec3 N = normalize(vNormal);
    vec3 finalColor = vec3(0.0);

    // Accumulate contributions from each spotlight
    for (int i = 0; i < MAX_SPOTLIGHTS; i++) {
        if (i >= uNumSpotLights) {
            break;
        }

        // Calculate direction from fragment to the light
        vec3 L = normalize(spotLights[i].position - vWorldPos);

        // Dot with spotlight's direction (which we assume is pointing outward)
        // If we stored direction in the opposite sense, we'd do dot(L, -direction).
        float spotEffect = dot(L, -normalize(spotLights[i].direction));

        // Only consider if we're within the outer cone
        if (spotEffect > spotLights[i].outerCutoff) {
            // Smoothly fade from outer cone to inner cone
            float intensity = smoothstep(
                spotLights[i].outerCutoff,
                spotLights[i].innerCutoff,
                spotEffect
            );

            // Lambertian diffuse factor
            float diffuse = max(dot(N, L), 0.0);

            // Accumulate: base color * spotlight color * diffuse * spotlight intensity
            vec3 contribution = uBaseColor
            * spotLights[i].color
            * diffuse
            * intensity;

            finalColor += contribution;
        }
    }

    fragColor = vec4(finalColor, 1.0);
}

`;
