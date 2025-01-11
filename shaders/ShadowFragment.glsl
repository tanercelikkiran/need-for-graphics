precision highp float;

// Directional Light
uniform vec3  dirLightColor;
uniform vec3  dirLightDirection; // Should be normalized
uniform sampler2D shadowMap;

// Hemisphere Light
uniform vec3  hemiSkyColor;
uniform vec3  hemiGroundColor;
uniform float hemiIntensity;
uniform vec3  hemiUp;          // Typically (0,1,0)

// Texturing
uniform sampler2D diffuseMap;

// Shadow & Projection Info
uniform float shadowBias;      // e.g., 0.001
uniform float shadowDarkness;  // e.g., 0.6 for how dark the shadow is
uniform float shadowMapSize;   // e.g., 2048 or 1024

in vec3 vWorldPos;
in vec3 vWorldNormal;
in vec2 vUV;
in vec4 vShadowCoord;

out vec4 fragColor;

////////////////////////////////////////////////
// Simple 3×3 PCF sampling
float sampleShadowPCF(sampler2D smap, vec2 uv, float compare, float texelSize) {
    float shadow = 0.0;
    // Offsets: -1, 0, +1
    for(int x=-1; x<=1; x++){
        for(int y=-1; y<=1; y++){
            vec2 offset = vec2(float(x), float(y)) * texelSize;
            float texDepth = texture(smap, uv + offset).r;
            // If texDepth < compare => in shadow
            shadow += (texDepth + shadowBias < compare) ? 1.0 : 0.0;
        }
    }
    // 9 samples total => average
    return shadow / 9.0;
}

void main() {
    ////////////////////////////////////////////////////
    // 1) Basic Diffuse from Directional Light
    ////////////////////////////////////////////////////
    vec3  N    = normalize(vWorldNormal);
    vec3  L    = normalize(-dirLightDirection); // direction *towards* the surface
    float diff = max(dot(N, L), 0.0);

    ////////////////////////////////////////////////////
    // 2) Hemisphere Light (ambient-like)
    ////////////////////////////////////////////////////
    // dot(N, Up) => -1..+1. Transform that to 0..1
    float ndotUp = dot(N, normalize(hemiUp));
    float hemiFactor = 0.5 * ndotUp + 0.5; // range 0..1
    vec3 hemiColor = mix(hemiGroundColor, hemiSkyColor, hemiFactor);
    vec3 hemisphere = hemiColor * hemiIntensity;

    ////////////////////////////////////////////////////
    // 3) Shadow Calculation
    ////////////////////////////////////////////////////
    // Convert from clip-space to normalized [0..1]
    // vShadowCoord.xyz / vShadowCoord.w => lightCoord
    vec3 shadowCoord = vShadowCoord.xyz / vShadowCoord.w * 0.5 + 0.5;

    // If outside shadow map, skip (no shadow)
    if(shadowCoord.x < 0.0 || shadowCoord.x > 1.0 ||
    shadowCoord.y < 0.0 || shadowCoord.y > 1.0 ||
    shadowCoord.z < 0.0 || shadowCoord.z > 1.0) {
        // Outside the shadow map => not in shadow
    } else {
        // Sample depth
        // PCF: gather multiple taps around the current pixel
        float texelSize = 1.0 / shadowMapSize; // e.g. 1/2048
        float shadowPct = sampleShadowPCF(shadowMap, shadowCoord.xy, shadowCoord.z, texelSize);
        // shadowPct = fraction of samples that are in shadow => 0..1
        //  => 0 => fully lit, 9 => fully shadowed
        // We'll invert that because if all samples are in shadow => shadowPct=9
        float shadowFactor = 1.0 - (shadowPct / 1.0);
        // If shadowFactor=0 => fully in shadow
        // If shadowFactor=1 => fully lit

        // Mix in how dark you want the shadow
        diff *= mix(1.0, shadowDarkness, 1.0 - shadowFactor);
    }

    ////////////////////////////////////////////////////
    // 4) Sample the Diffuse Texture
    ////////////////////////////////////////////////////
    vec4 texColor = texture(diffuseMap, vUV);

    ////////////////////////////////////////////////////
    // 5) Final Color = Lambert + Hemisphere + Texture
    ////////////////////////////////////////////////////
    // Directional Diffuse
    vec3 directDiffuse = texColor.rgb * diff * dirLightColor;

    // Add hemisphere as ambient
    vec3 finalColor = directDiffuse + hemisphere * texColor.rgb;

    fragColor = vec4(finalColor, texColor.a);
}