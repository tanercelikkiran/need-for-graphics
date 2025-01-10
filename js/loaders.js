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
function loadShader(url) {
    return fetch(url).then(response => response.text());
}

const FogVertexShader = await loadShader("shaders/FogVertex.glsl");

const FogFragmentShader = await loadShader("shaders/FogFragment.glsl");

export function createFogMaterial(diffuseMap, fogColor = new THREE.Color(0.4, 0.4, 0.4),solidColor = new THREE.Color(0.0, 0.0, 0.0)) {
    return new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: FogVertexShader,
        fragmentShader: FogFragmentShader,
        uniforms: {
            uDiffuseMap: { value: diffuseMap },
            uFogNear: { value: 15.0 },
            uFogFar: { value: 50.0 },
            uFogColor: { value: fogColor },
            uSolidColor: { value: solidColor }, // Add solid color
            uHasTexture: { value: !!diffuseMap }, // Check if a texture is provided
        }
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