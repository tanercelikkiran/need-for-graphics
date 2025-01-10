import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {RGBELoader} from "three/addons/loaders/RGBELoader.js";
import {emissiveLight, pointLight, spotlight} from "./material-properties.js";
import {transparent, metallicPaint} from "./material-properties.js";
import {world} from "./main.js";

let carMesh;
let wheelMeshes = [];
export {carMesh, wheelMeshes};

const manager = new THREE.LoadingManager();
manager.onStart = () => {
    console.log('Loading started');
};
manager.onLoad = () => {
    console.log('Loading complete');
};
manager.onProgress = (url, itemsLoaded, itemsTotal) => {
    console.log(`Loading file: ${url}. Loaded ${itemsLoaded} of ${itemsTotal} files.`);
};
manager.onError = (url) => {
    console.error(`Error loading ${url}`);
};

const gltfLoader = new GLTFLoader(manager);
const fbxLoader = new FBXLoader(manager);
const rgbeLoader = new RGBELoader(manager);

const PhongVertexShader = `
precision mediump float;

attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vUV;

void main() {
    // transform the normal to view space
    vNormal = normalMatrix * normal;

    // position in view space
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vPosition = mvPosition.xyz;

    // pass uv to fragment
    vUV = uv;

    // final gl_Position
    gl_Position = projectionMatrix * mvPosition;
}
`;

const PhongFragmentShader = `
precision mediump float;

// from vertex shader
varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vUV;

// uniforms
uniform sampler2D uDiffuseMap;   // the city/car texture
uniform vec3 uLightDirection;
uniform vec3 uLightColor;
uniform vec3 uAmbientColor;
uniform float uShininess;

void main() {
    // sample the texture using vUV
    vec4 texColor = texture2D(uDiffuseMap, vUV);

    // if the texture has an alpha channel, you can do something with it
    // but for now, assume it's opaque
    vec3 baseColor = texColor.rgb;

    // basic Phong lighting
    vec3 normal = normalize(vNormal);
    float diffuseFactor = max(dot(normal, -uLightDirection), 0.0);

    // reflection for specular
    vec3 reflectDir = reflect(uLightDirection, normal);
    vec3 viewDir = normalize(-vPosition);
    float specFactor = pow(max(dot(reflectDir, viewDir), 0.0), uShininess);

    // combine
    vec3 ambient = uAmbientColor * baseColor;
    vec3 diffuse = diffuseFactor * uLightColor * baseColor;
    vec3 specular = specFactor * uLightColor;

    vec3 finalColor = ambient + diffuse + specular;

    gl_FragColor = vec4(finalColor, 1.0);
}
`;

const ToonVertexShader = `
precision mediump float;

attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

varying vec3 vNormal;
varying vec2 vUV;

void main() {
    vNormal = normalMatrix * normal;
    vUV = uv;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
}
`;

const ToonFragmentShader = `
precision mediump float;

uniform sampler2D uDiffuseMap;
uniform vec3 uLightDirection;
uniform vec3 uLightColor;
uniform vec3 uAmbientColor;
uniform float uShininess;

varying vec3 vNormal;
varying vec2 vUV;

void main() {
    // Sample the texture
    vec4 texColor = texture2D(uDiffuseMap, vUV);

    // Calculate basic lighting
    vec3 normal = normalize(vNormal);
    float diffuseFactor = max(dot(normal, -uLightDirection), 0.0);

    // Toon shading: Step function for discrete shading levels
    float toonShading = floor(diffuseFactor * 4.0) / 4.0;

    // Combine with light and ambient
    vec3 ambient = uAmbientColor * texColor.rgb;
    vec3 diffuse = toonShading * uLightColor * texColor.rgb;

    vec3 finalColor = ambient + diffuse;

    gl_FragColor = vec4(finalColor, texColor.a);
}
`;

const PBRVertexShader = `
precision highp float;

// Attributes
in vec3 position;
in vec3 normal;
in vec2 uv;

// Uniforms
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

// Varyings (passed to fragment shader)
out vec3 vWorldPosition;
out vec3 vNormal;
out vec2 vUV;

void main() {
    // Transform position to clip space
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

    // Pass the world-space position (approx) to the fragment
    // (Strictly, "world position" would require a separate modelMatrix * position,
    // but for many use-cases modelView is okay if the camera doesn't move too wildly.)
    vWorldPosition = mvPosition.xyz;

    // Transform normal to view space
    vNormal = normalMatrix * normal;

    vUV = uv;

    gl_Position = projectionMatrix * mvPosition;
}`;

const PBRFragmentShader = `
precision highp float;

// Varyings from vertex shader
in vec3 vWorldPosition;
in vec3 vNormal;
in vec2 vUV;

// Outputs
out vec4 outColor;

// Uniforms
uniform sampler2D uAlbedoMap;
uniform samplerCube uEnvMap;       // If you want environment reflections
uniform float uMetalness;
uniform float uRoughness;
uniform vec3 uCameraPosition;      // For reflections, etc.

// Basic lighting uniform
uniform vec3 uLightDirection;
uniform vec3 uLightColor;
uniform vec3 uAmbientColor;

// A simple approximation for PBR lighting
const float PI = 3.14159265359;

// Cook-Torrance microfacet terms (simplified)
float D_GGX(float NoH, float roughness) {
    float alpha = roughness * roughness;
    float alphaSqr = alpha * alpha;
    float denom = (NoH * NoH) * (alphaSqr - 1.0) + 1.0;
    return alphaSqr / (PI * denom * denom);
}

float G_SmithSchlickGGX(float NoV, float NoL, float roughness) {
    float r = (roughness + 1.0);
    float k = (r * r) / 8.0; // Disney uses (roughness+1)^2 / 8

    float g1V = NoV / (NoV * (1.0 - k) + k);
    float g1L = NoL / (NoL * (1.0 - k) + k);
    return g1V * g1L;
}

vec3 F_Schlick(vec3 F0, float VoH) {
    return F0 + (1.0 - F0) * pow(1.0 - VoH, 5.0);
}

void main() {
    // Albedo (base color)
    vec3 baseColor = texture(uAlbedoMap, vUV).rgb;

    // Normal in view space
    vec3 N = normalize(vNormal);

    // Light direction
    vec3 L = normalize(-uLightDirection); // In view space
    vec3 V = normalize(uCameraPosition - vWorldPosition); // Approx view dir
    vec3 H = normalize(V + L);

    float NoV = max(dot(N, V), 0.0);
    float NoL = max(dot(N, L), 0.0);
    float NoH = max(dot(N, H), 0.0);
    float VoH = max(dot(V, H), 0.0);

    // Fresnel reflectance at zero incidence (F0)
    // Typically: F0 = 0.04 for insulators, or baseColor for metals
    vec3 F0 = mix(vec3(0.04), baseColor, uMetalness);

    // Calculate reflectance using Schlick’s approximation
    vec3 F = F_Schlick(F0, VoH);

    // Distribution term
    float D = D_GGX(NoH, uRoughness);

    // Geometry term
    float G = G_SmithSchlickGGX(NoV, NoL, uRoughness);

    // Specular
    vec3 numerator = D * G * F;
    float denominator = 4.0 * NoV * NoL + 0.0001;
    vec3 specular = numerator / denominator;

    // kS is Fresnel
    vec3 kS = F;
    // kD is diffuse reflection
    vec3 kD = (vec3(1.0) - kS) * (1.0 - uMetalness);

    // Lambertian diffuse
    vec3 diffuseTerm = kD * baseColor / PI;

    // Combine diffuse + specular with the light
    vec3 color = (diffuseTerm + specular) * uLightColor * NoL;

    // Add simple ambient
    color += uAmbientColor * baseColor;

    // Sample environment map for reflection
    // (Reflect the view direction around the normal)
    vec3 R = reflect(-V, N);
    vec3 envColor = texture(uEnvMap, R).rgb; // For a cubemap
    // Mix environment reflection based on Fresnel
    color = mix(color, envColor, kS * 0.1);  // 0.1 is an environment factor

    outColor = vec4(color, 1.0);
}`;

const RimVertexShader = `
in vec3 position;
in vec3 normal;
in vec2 uv;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

out vec3 vNormal;
out vec3 vWorldPosition;
out vec2 vUV;

void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normal;
    vWorldPosition = mvPosition.xyz;
    vUV = uv;
    gl_Position = projectionMatrix * mvPosition;
}
`;

const RimFragmentShader = `
precision highp float;

in vec3 vNormal;
in vec3 vWorldPosition;
in vec2 vUV;

out vec4 outColor;

uniform vec3 uCameraPosition;
uniform vec3 uRimColor;
uniform float uRimPower;
uniform float uRimIntensity;

uniform vec3 uLightDirection;
uniform vec3 uLightColor;
uniform vec3 uAmbientColor;

uniform sampler2D uDiffuseMap;

void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(uCameraPosition - vWorldPosition);

    float rimFactor = 1.0 - max(dot(N, V), 0.0);
    rimFactor = pow(rimFactor, uRimPower) * uRimIntensity;
    rimFactor = clamp(rimFactor, 0.0, 1.0);

    vec3 baseColor = texture(uDiffuseMap, vUV).rgb;

    float diffuseFactor = max(dot(N, -uLightDirection), 0.0);
    vec3 diffuse = diffuseFactor * uLightColor * baseColor;
    vec3 ambient = uAmbientColor * baseColor;

    vec3 finalColor = diffuse + ambient + (rimFactor * uRimColor);

    outColor = vec4(finalColor, 1.0);
}
`;

const FogVertexShader = `
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
`;

const FogFragmentShader = `
precision highp float;

in vec2 vUV;
in float vFogDepth;
out vec4 outColor;

uniform sampler2D uDiffuseMap;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uFogColor;

void main() {
    vec3 baseColor = texture(uDiffuseMap, vUV).rgb;

    // Linear fog factor
    float fogFactor = smoothstep(uFogNear, uFogFar, vFogDepth);
    vec3 finalColor = mix(baseColor, uFogColor, fogFactor*0.9);

    outColor = vec4(finalColor, 1.0);
}
`;

export function createFogMaterial(diffuseMap, fogColor = new THREE.Color(0.4, 0.4, 0.4)) {
    return new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: FogVertexShader,
        fragmentShader: FogFragmentShader,
        uniforms: {
            uDiffuseMap: { value: diffuseMap },
            uFogNear: { value: 1.0 },
            uFogFar: { value: 50.0 },
            uFogColor: { value: fogColor }
        }
    });
}

export function createRimLightTexturedMaterial(params) {
    const {
        cameraPosition = new THREE.Vector3(0, 0, 5),
        rimColor = new THREE.Color(1.0, 1.0, 1.0),
        rimPower = 2.0,
        rimIntensity = 1.0,
        lightDirection = new THREE.Vector3(-1, -1, -1).normalize(),
        lightColor = new THREE.Color(1, 1, 1),
        ambientColor = new THREE.Color(0.1, 0.1, 0.1),
        diffuseMap = null // your texture
    } = params;

    return new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3, // important for #version 300 es
        vertexShader: RimVertexShader,
        fragmentShader: RimFragmentShader,
        uniforms: {
            uCameraPosition: { value: cameraPosition },
            uRimColor: { value: rimColor },
            uRimPower: { value: rimPower },
            uRimIntensity: { value: rimIntensity },
            uLightDirection: { value: lightDirection },
            uLightColor: { value: lightColor },
            uAmbientColor: { value: ambientColor },
            uDiffuseMap: { value: diffuseMap } // the texture you want to use
        },
        // optional: side, transparent, etc.
    });
}
export function createCustomToonMaterial(texture) {
    return new THREE.RawShaderMaterial({
        vertexShader: ToonVertexShader,
        fragmentShader: ToonFragmentShader,
        uniforms: {
            uDiffuseMap: { value: texture },
            uLightDirection: { value: new THREE.Vector3(-1, -1, -1).normalize() },
            uLightColor: { value: new THREE.Color(1, 1, 1) },
            uAmbientColor: { value: new THREE.Color(0.1, 0.1, 0.1) },
            uShininess: { value: 16.0 }
        }
    });
}
export function createCustomPBRMaterial({
                                            albedoTexture,
                                            envMap,
                                            cameraPosition,
                                            lightDirection = new THREE.Vector3(-1, -1, -1).normalize(),
                                            lightColor = new THREE.Color(1, 1, 1),
                                            ambientColor = new THREE.Color(0.1, 0.1, 0.1),
                                            metalness = 0.5,
                                            roughness = 0.5
                                        } = {}) {
    return new THREE.RawShaderMaterial({
        glslVersion : THREE.GLSL3,
        vertexShader: PBRVertexShader,
        fragmentShader: PBRFragmentShader,
        uniforms: {
            uAlbedoMap:       { value: albedoTexture },
            uEnvMap:          { value: envMap },
            uCameraPosition:  { value: cameraPosition },
            uLightDirection:  { value: lightDirection },
            uLightColor:      { value: lightColor },
            uAmbientColor:    { value: ambientColor },
            uMetalness:       { value: metalness },
            uRoughness:       { value: roughness }
        },
        // Make sure you use these if your geometry includes tangents or advanced usage
        // or if you want correct color space:
        // glslVersion: THREE.GLSL3,
        // side: THREE.DoubleSide,
    });
}

export function createCustomPhongMaterial(texture) {
    return new THREE.RawShaderMaterial({

        vertexShader: PhongVertexShader,
        fragmentShader: PhongFragmentShader,
        uniforms: {
            uDiffuseMap:      { value: texture },
            uLightDirection:  { value: new THREE.Vector3(-1, -1, -1).normalize() },
            uLightColor:      { value: new THREE.Color(1, 1, 1) },
            uAmbientColor:    { value: new THREE.Color(0.1, 0.1, 0.1) },
            uShininess:       { value: 5.0 }
        }
    });
}

export function loadMap(scene) {
    gltfLoader.load(
        'public/cityfinal.glb',
        function (gltf) {
            scene.add(gltf.scene);
            console.log('Model loaded successfully!');
            gltf.scene.traverse((child) => {
                if (child.isMesh && child.material && child.material.map) {
                    // child.material.map is your base color (diffuse) texture
                    const cityTexture = child.material.map;

                    // Create a custom shader material that uses that texture
                    const customCityMaterial = createFogMaterial(cityTexture);

                    // Apply to this mesh
                    child.material = customCityMaterial;
                    // const rimMaterial = createRimLightTexturedMaterial({
                    //     cameraPosition: new THREE.Vector3(1, 2, 1),
                    //     rimColor: new THREE.Color(1, 1, 1),
                    //     rimPower: 0.1,
                    //     rimIntensity: 0.05,
                    //     lightDirection: new THREE.Vector3(1, 2, 1).normalize(),
                    //     lightColor: new THREE.Color(1, 1, 0.8),
                    //     ambientColor: new THREE.Color(0.1, 0.1, 0.15),
                    //     diffuseMap: cityTexture
                    // });
                    // child.material = rimMaterial;

                   //  child.material = createCustomPBRMaterial({
                   //      albedoTexture: child.material.map,   // Reuse the old diffuse map
                   //      envMap: scene.environment,           // If you already loaded a cubemap or equirect env
                   //      cameraPosition: new THREE.Vector3(0, 5, 10), // Or dynamically update from your camera
                   //      metalness: 0.8,
                   //      roughness: 0.2,
                   //      lightDirection: new THREE.Vector3(-1, -1, -1).normalize(),
                   //      lightColor: new THREE.Color(1, 1, 1),
                   //      ambientColor: new THREE.Color(0.1, 0.1, 0.1),
                   //  });
                }
            });


            // gltf.scene.traverse(function (child) {
            //     if (child.isMesh && child.name.includes("PLight")) {
            //
            //         // Mevcut konumda PointLight oluştur
            //         const pointLight = new THREE.PointLight(0xFFF0CC, 4, 50, 1); // Renk, yoğunluk, mesafe, azalma
            //         pointLight.position.copy(child.position);
            //
            //         // PointLight'ı sahneye ekle
            //         scene.add(pointLight);
            //     }
            // });
        },
        null,
        function (error) {
            console.error('An error happened:', error);
        }
    );
}

export function loadSportCar(scene) {
    return new Promise((resolve) => {
        fbxLoader.load("public/CarwNoWheels.fbx", function(object){
                carMesh = object;
                scene.add(object);

                const carCamera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 1000);
                carCamera.position.set(0, 2, 6.3); // Kamerayı arabanın arkasına yerleştir
                carCamera.lookAt(new THREE.Vector3(0, 1.5, 0)); // Kameranın arabaya doğru bakmasını sağla
                carMesh.add(carCamera);

                scene.userData.activeCamera = carCamera;

                const carLight = new THREE.PointLight(0xFFF0CC, 50, 50);
                carLight.position.set(0, 5 , 5);
                carMesh.add(carLight);

                carMesh.traverse( function(child){
                    if (child.isMesh && child.material && child.material.map) {
                        const carTexture = child.material.map;

                        const customCarMaterial = createCustomPhongMaterial(carTexture);
                        child.material = customCarMaterial;
                    }
                    if (child.isMesh){
                        child.castShadow = child.receiveShadow = true;
                        if (child.name.includes("Object") || child.name.includes("Studio_Car187.002")){
                            transparent(child.material);
                        }
                        if (child.name.includes("Studio_Car276")){
                            transparent(child.material, 0x5C0007);
                        }
                        if (child.name.includes("Studio_Car277")){
                            metallicPaint(child.material);
                        }
                        if (child.name.includes("Studio_Car148")){
                            emissiveLight(child, 0xffffff, 20.0);
                        }
                        if (child.name.includes("Studio_Car149")){
                            emissiveLight(child, 0xffffff, 20.0);
                        }
                        if (child.name.includes("headlight1") || child.name.includes("headlight2")) {
                            emissiveLight(child, 0xffffff, 20.0);

                            // Create the spotlight with dummy positions for now
                            const headlightSpot = spotlight(
                                new THREE.Vector3(0, 0, 0), // we'll override in postStep
                                new THREE.Vector3(0, 0, -10)
                            );

                            // Add it to the scene
                            scene.add(headlightSpot);
                            scene.add(headlightSpot.target);

                            // Now each physics step, update the spotlight so it "follows" this child
                            world.addEventListener("postStep", () => {
                                // 1) Get the child's current world position
                                const updatedPosition = child.getWorldPosition(new THREE.Vector3());

                                // 2) We'll define a local "forward" offset of -10 along Z,
                                //    then rotate it by the child's *world* quaternion.
                                const localDir = new THREE.Vector3(0, 10, 0);
                                const childQuat = child.getWorldQuaternion(new THREE.Quaternion());
                                localDir.applyQuaternion(childQuat);

                                // 3) Final target is updatedPosition + localDir
                                const updatedTarget = updatedPosition.clone().add(localDir);

                                // 4) Call the tilt-based spotlight update:
                                headlightSpot.updatePositionAndDirection(updatedPosition, updatedTarget);
                            });
                        }
                        if (child.name.includes("Studio_Car252_light1")) {
                            emissiveLight(child, 0xff3333, 5.0);
                        }
                        if (child.name.includes("Studio_Car252_light2")) {
                            emissiveLight(child, 0xff3333, 5.0);
                        }
                        if (child.name.includes("Studio_Car252_light3")) {
                            emissiveLight(child, 0xff3333, 5.0);
                        }
                        if (child.name.includes("Studio_Car236_light4")) {
                            emissiveLight(child, 0xff3333, 20.0);
                        }
                        if (child.name.includes("Studio_Car252_taillights1")) {
                            emissiveLight(child, 0xff3333, 20.0);
                        }
                        if (child.name.includes("platelight1")) {
                            const pointLight1 = pointLight(child.position, 0xCDDCFF, 0.01, 1, 5);
                            child.add(pointLight1);
                        }
                        if (child.name.includes("platelight2")) {
                            const pointLight2 = pointLight(child.position, 0xCDDCFF, 0.01, 1, 5);
                            child.add(pointLight2);
                        }
                        if (child.name.includes("Studio_Car252_taillights2")) {
                            emissiveLight(child, 0xff3333, 50.0);
                        }
                        if (child.name.includes("Studio_Car252_taillights3")) {
                            emissiveLight(child, 0xff3333, 50.0);
                        }
                        if (child.name.includes("Studio_Car252_taillights4")) {
                            emissiveLight(child, 0xff3333, 50.0);
                        }
                        if (child.name.includes("Studio_Car252_taillights5")) {
                            emissiveLight(child, 0xff3333, 50.0);
                        }
                        if (child.name.includes("Studio_Car252_taillights6")) {
                            emissiveLight(child, 0xff3333, 50.0);
                        }
                        if (child.name.includes("Studio_Car252_taillights7")) {
                            emissiveLight(child, 0xff3333, 50.0);
                        }
                        if (child.name.includes("Studio_Car252_taillights8")) {
                            emissiveLight(child, 0xff3333, 50.0);
                        }
                        if (child.name.includes("Studio_Car252_taillights9")) {
                            emissiveLight(child, 0xff3333, 50.0);
                        }
                    }
                });
                resolve();
            },
            null, function(error){
                console.error(error);
            });
        loadSportWheels(scene);
    });
}

export function loadSportWheels(scene) {
    fbxLoader.load('public/wheels.fbx', (object) => {
        object.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;

                // Lastik isimlerini kontrol ederek diziye ekle
                if (child.name.includes("wheel-LF")) {
                    wheelMeshes[0] = child;
                }
                if (child.name.includes("wheel-RF")) {
                    wheelMeshes[1] = child;
                }
                if (child.name.includes("wheel-LB")) {
                    wheelMeshes[2] = child;
                }
                if (child.name.includes("wheel-RB")) {
                    wheelMeshes[3] = child;
                }
            }
        });
        scene.add(object);
    } , null, function(error){
        console.error(error);
    });
}

export function loadHDR(scene) {
    rgbeLoader.load('public/hdri.hdr', function (texture) {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = texture;
        scene.background = texture;
        scene.environment.intensity = 0.2;
    });
}