import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {RGBELoader} from "three/addons/loaders/RGBELoader.js";
import {
    emissiveLight,
    metallicPaint,
    neonEmissiveMaterial,
    pointLight,
    spotlight,
    transparent
} from "./material-properties.js";
import {carColor,
    isBraking,
    isTurboActive,
    selectedCarNo,
    world,
    objects,
    useShadow,
    scene,
    renderer,
    skyMesh,
    hemisphereLight,
    sunLight,
    motionBlurPass,
    bloomPass} from "./state.js";
import {FontLoader} from "three/addons/loaders/FontLoader.js";

let carMesh;
let wheelMeshes = [];
export {carMesh, wheelMeshes};

// Module-level references for event-driven material switching
let mapGltfScene = null;
let mapOriginalMaterials = null;

export const manager = new THREE.LoadingManager();
const loadingScreen = document.getElementById('loading-screen');
const loadingFill = document.getElementById('loadingFill');

manager.onStart = () => {
    console.log('Loading started');
};
manager.onLoad = () => {
    loadingScreen.style.display = 'none';
    loadingFill.style.display = 'none';
    console.log('Loading complete');
};
manager.onProgress = (url, itemsLoaded, itemsTotal) => {
    const progress = (itemsLoaded / itemsTotal) * 100;
    loadingFill.style.width = `${progress}%`;
    console.log(`Loading file: ${url}. Loaded ${itemsLoaded} of ${itemsTotal} files.`);
};
manager.onError = (url) => {
    console.error(`Error loading ${url}`);
};

const gltfLoader = new GLTFLoader(manager);
const fbxLoader = new FBXLoader(manager);
const rgbeLoader = new RGBELoader(manager);
const fontloader = new FontLoader(manager);

// Car material configurations
// Each entry maps mesh name patterns to material setup functions
const CAR_MATERIAL_CONFIGS = {
    bmw: {
        bodyPath: 'public/bmw/bmwWnowheels.fbx',
        wheelPath: 'public/bmw/bmwwheels.fbx',
        introPath: 'public/bmw/bmwIntro.fbx',
        paintMaterialName: 'BMW:carpaint1',
        cameraFar: 400,
        setupMesh: (child, carColor) => {
            if (child.name.includes("Glass")) transparent(child.material);
            if (child.name.includes("HeadlightWindow")) transparent(child.material);
            if (child.material.name === 'BMW:carpaint1') metallicPaint(child.material, carColor);
            if (child.name.includes("Rearlight")) {
                child.material = new THREE.MeshStandardMaterial({
                    color: 0x550000, emissive: 0xff3333, emissiveIntensity: 2,
                    roughness: 0.3, metalness: 0.1,
                });
            }
            if (child.name.includes("Brakelight")) {
                emissiveLight(child, 0xff3333, 2);
            }
            if (child.name.includes("Headl")) emissiveLight(child, 0xFFFFFF, 0.4);
            if (child.name.includes("RearlightWindow")) transparent(child.material, 0xffffe0);
            if (child.name.includes("platelight")) {
                child.add(pointLight(child.position, 0xCDDCFF, 0.05, 1, 5));
            }
        },
        headlightMeshNames: ['HeadlightSpot'],
        setupHeadlights: (child, scene) => {
            const headlightSpot = spotlight(
                new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.05, -1)
            );
            headlightSpot.castShadow = true;
            scene.add(headlightSpot);
            scene.add(headlightSpot.target);
            return headlightSpot;
        },
        headlightDirection: (child) => {
            const localDir = new THREE.Vector3(0, -0.1, 1);
            localDir.applyQuaternion(child.getWorldQuaternion(new THREE.Quaternion()));
            return localDir;
        },
    },
    porsche: {
        bodyPath: 'public/porsche/CarwNoWheels.fbx',
        wheelPath: 'public/porsche/wheels.fbx',
        introPath: 'public/porsche/CarIntro.fbx',
        cameraFar: 1000,
        setupMesh: (child, carColor) => {
            if (child.name.includes("Object") || child.name.includes("Studio_Car187.002"))
                transparent(child.material);
            if (child.name.includes("Studio_Car276")) transparent(child.material, 0x5C0007);
            if (child.name.includes("Studio_Car277")) metallicPaint(child.material, carColor);
            if (child.name.includes("Studio_Car148") || child.name.includes("Studio_Car149"))
                emissiveLight(child, 0xffffff, 20.0);
            if (child.name.includes("headlight1") || child.name.includes("headlight2"))
                emissiveLight(child, 0xffffff, 20.0);
            if (child.name.includes("Studio_Car252_light")) emissiveLight(child, 0xff3333, 5);
            if (child.name.includes("Studio_Car252_taillights1")) emissiveLight(child, 0xff3333, 20.0);
            if (child.name.includes("platelight1"))
                child.add(pointLight(child.position, 0xCDDCFF, 0.01, 1, 5));
            if (child.name.includes("platelight2"))
                child.add(pointLight(child.position, 0xCDDCFF, 0.01, 1, 5));
        },
        headlightMeshNames: ['headlight1', 'headlight2'],
        setupHeadlights: (child, scene) => {
            const headlightSpot = spotlight(
                new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -10)
            );
            headlightSpot.castShadow = true;
            scene.add(headlightSpot);
            scene.add(headlightSpot.target);
            return headlightSpot;
        },
        headlightDirection: (child) => {
            const localDir = new THREE.Vector3(0, 10, 0);
            localDir.applyQuaternion(child.getWorldQuaternion(new THREE.Quaternion()));
            return localDir;
        },
    },
    jeep: {
        bodyPath: 'public/jeep/jeepWnowheels.fbx',
        wheelPath: 'public/jeep/jeep.fbx',
        introPath: 'public/jeep/jeepIntro.fbx',
        paintMaterialName: 'Jeep_GladiatorRewardRecycled_2019Paint_Material',
        cameraFar: 1000,
        setupMesh: (child, carColor) => {
            if (child.material.name === 'Jeep_GladiatorRewardRecycled_2019Paint_Material')
                metallicPaint(child.material, carColor);
            if (child.name.includes("Brakelight")) emissiveLight(child, 0xff3333, 2);
            if (child.name.includes("Taillight")) {
                child.material = new THREE.MeshStandardMaterial({
                    color: 0x550000, emissive: 0xff3333, emissiveIntensity: 5,
                    roughness: 0.3, metalness: 0.1,
                });
            }
            if (child.name.includes("Headlight")) emissiveLight(child, 0xFFFFFF, 2);
            if (child.name.includes("LicensePlate")) {
                child.material = new THREE.MeshStandardMaterial({
                    color: 0xffffff, emissive: 0x000000, roughness: 0.5, metalness: 0.1,
                });
            }
            if (child.name.includes("Trunklight")) emissiveLight(child, 0xFFFFFF, 5);
            if (child.name.includes("platelight"))
                child.add(pointLight(child.position, 0xCDDCFF, 0.05, 1, 5));
        },
        setupHeadlights: (child, scene) => {
            const headlightSpot = spotlight(
                new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.05, -1)
            );
            headlightSpot.castShadow = true;
            scene.add(headlightSpot);
            scene.add(headlightSpot.target);
            return headlightSpot;
        },
        headlightMeshNames: ['HeadlightSpot'],
        headlightDirection: (child) => {
            const localDir = new THREE.Vector3(0, -0.1, 1);
            localDir.applyQuaternion(child.getWorldQuaternion(new THREE.Quaternion()));
            return localDir;
        },
    },
};

export let audioListener;
export let bmwAcc, porscheAcc, jeepAcc,bmwEngine, porscheEngine, jeepEngine,slide,turboSound;

export function loadSounds(scene) {
    audioListener = new THREE.AudioListener();
    scene.add(audioListener);

    const audioLoader = new THREE.AudioLoader();

    // BMW için hızlanma sesi
    bmwAcc = new THREE.Audio(audioListener);
    audioLoader.load('public/sfx/BMWacc.mp3', (buffer) => {
        bmwAcc.setBuffer(buffer);
        bmwAcc.setLoop(false);
        bmwAcc.setVolume(0.5);
    });

    // Porsche için hızlanma sesi
    porscheAcc = new THREE.Audio(audioListener);
    audioLoader.load('public/sfx/Porscheacc.mp3', (buffer) => {
        porscheAcc.setBuffer(buffer);
        porscheAcc.setLoop(false);
        porscheAcc.setVolume(0.5);
    });

    // Jeep için hızlanma sesi
    jeepAcc = new THREE.Audio(audioListener);
    audioLoader.load('public/sfx/Jeepacc.mp3', (buffer) => {
        jeepAcc.setBuffer(buffer);
        jeepAcc.setLoop(false);
        jeepAcc.setVolume(0.5);
    });

    // BMW Motor sesi
    bmwEngine = new THREE.Audio(audioListener);
    audioLoader.load('public/sfx/BMWEngine.mp3', (buffer) => {
        bmwEngine.setBuffer(buffer);
        bmwEngine.setLoop(true); // Motor sesi sürekli çalacak
        bmwEngine.setVolume(0.1);
        if(selectedCarNo===0){
            bmwEngine.play();
        }

    });
    // Porsche Motor sesi
    porscheEngine = new THREE.Audio(audioListener);
    audioLoader.load('public/sfx/PorscheEngine.mp3', (buffer) => {
        porscheEngine.setBuffer(buffer);
        porscheEngine.setLoop(true);
        porscheEngine.setVolume(0.1);
        if(selectedCarNo===1){
            porscheEngine.play();
        }
    });

    // Jeep Motor sesi
    jeepEngine = new THREE.Audio(audioListener);
    audioLoader.load('public/sfx/Jeepmotor.mp3', (buffer) => {
        jeepEngine.setBuffer(buffer);
        jeepEngine.setLoop(true);
        jeepEngine.setVolume(0.1);
        if(selectedCarNo===2){
            jeepEngine.play();
        }
    });
    slide = new THREE.Audio(audioListener);
    audioLoader.load('public/sfx/carslide.mp3', (buffer) => {
        slide.setBuffer(buffer);
        slide.setLoop(false);
        slide.setVolume(0.5);
    });
    turboSound = new THREE.Audio(audioListener);
    audioLoader.load('public/sfx/Turbo.mp3', (buffer) => {
        turboSound.setBuffer(buffer);
        turboSound.setLoop(false);
        turboSound.setVolume(0.5);
    });
}

async function loadShader(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to load shader: ${url} (${response.status})`);
    }
    return response.text();
}

let FogVertexShader, FogFragmentShader, ShadowVertexShader, ShadowFragmentShader;
try {
    [FogVertexShader, FogFragmentShader, ShadowVertexShader, ShadowFragmentShader] = await Promise.all([
        loadShader("shaders/FogVertex.glsl"),
        loadShader("shaders/FogFragment.glsl"),
        loadShader("shaders/ShadowVertex.glsl"),
        loadShader("shaders/ShadowFragment.glsl"),
    ]);
} catch (e) {
    console.error("Shader loading failed:", e);
}

export function createFogMaterial(diffuseMap, fogColor = new THREE.Color(0.4, 0.4, 0.4),solidColor = new THREE.Color(0.0, 0.0, 0.0)) {
    return new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader: FogVertexShader,
        fragmentShader: FogFragmentShader,
        uniforms: {
            diffuseMap: { value: diffuseMap },
            uFogNear: { value: 15.0 },
            uFogFar: { value: 50.0 },
            uFogColor: { value: fogColor },
            uFogDensity: { value: 0.9 },
            uSolidColor: { value: solidColor }, // Add solid color
            uHasTexture: { value: !!diffuseMap }, // Check if a texture is provided
        }
    });
}

export function createShadowMaterial(diffuseTexture,sunLight,hemisphereLight) {
    // The directional light’s camera is used for shadow generation.
    // We'll read from dirLight.shadow.map and pass it to the shader
    const shadowMap = sunLight.shadow.map ? sunLight.shadow.map.texture : null;

    // For the direction, if you want "light from above" you do -light.position
    // or simply normalize the direction you want:
    const lightDir = new THREE.Vector3().copy(sunLight.position).normalize().multiplyScalar(-1);

    // For the shadow camera, we need the view and projection matrices
    // We can compute them once, or each frame if the light moves
    const lightCam = sunLight.shadow.camera;
    lightCam.updateProjectionMatrix(); // ensure up to date
    lightCam.updateMatrixWorld();      // ensure up to date

    // Typically:
    // lightViewMatrix       = inverse(lightCam.matrixWorld)
    // lightProjectionMatrix = lightCam.projectionMatrix
    //
    // Three.js doesn't store it as "viewMatrix" directly, so we compute:
    const lightViewMatrix = new THREE.Matrix4().copy(lightCam.matrixWorldInverse);
    // The camera's world inverse is set by the renderer, but we can force-update:
    // If it's still not correct, you can compute it manually:
    // lightViewMatrix.invert(lightCam.matrixWorld);
    const lightProjMatrix = lightCam.projectionMatrix;

    return new THREE.RawShaderMaterial({
        glslVersion: THREE.GLSL3,
        vertexShader:   ShadowVertexShader,
        fragmentShader: ShadowFragmentShader,
        uniforms: {
            // Basic directional light
            dirLightColor:    { value: sunLight.color },
            dirLightDirection:{ value: lightDir },

            // Hemisphere
            hemiSkyColor:     { value: hemisphereLight .color },
            hemiGroundColor:  { value: hemisphereLight .groundColor },
            hemiIntensity:    { value: hemisphereLight .intensity },
            hemiUp:           { value: new THREE.Vector3(0,1,0) }, // Up vector

            // Shadow
            shadowMap:        { value: shadowMap },
            shadowBias:       { value: 0.001 }, // Tweak if you see acne
            shadowDarkness:   { value: 0.6 },   // 0 => fully lit, 1 => pitch black
            shadowMapSize:    { value: sunLight.shadow.mapSize.width },

            // Light projection
            lightViewMatrix:       { value: lightViewMatrix },
            lightProjectionMatrix: { value: lightProjMatrix },

            // Diffuse
            diffuseMap: { value: diffuseTexture },

            // We also need standard matrices:

        }
    });
}

/**
 * Switches city map materials based on the current visual mode.
 * Called once when useShadow changes, NOT every frame.
 * Modes: 0 = shadow shader, 1 = fog shader, 2 = standard, 3 = standard + motion blur
 */
export function updateMapMaterials(mode, scene) {
    if (!mapGltfScene || !mapOriginalMaterials) return;

    mapGltfScene.traverse(function (child) {
        if (!child.isMesh || !child.material) return;

        // Meshes with a diffuse texture that was wrapped in a custom shader
        if (child.material.uniforms && child.material.uniforms.diffuseMap) {
            const texture = child.material.uniforms.diffuseMap.value;

            if (mode === 0) {
                // Shadow mode
                child.castShadow = true;
                child.receiveShadow = true;
                child.material = createShadowMaterial(texture, sunLight, hemisphereLight);
            } else if (mode === 1) {
                // Fog mode
                child.material = createFogMaterial(texture);
            } else if (mode >= 2) {
                // Standard mode: restore original material
                if (mapOriginalMaterials.has(child)) {
                    child.material = mapOriginalMaterials.get(child);
                }
            }
            return;
        }

        // Meshes with a standard diffuse map (city buildings, etc.)
        if (child.material.map) {
            if (mode < 2) {
                // Fog/shadow modes: wrap texture in fog material
                child.material = createFogMaterial(child.material.map);
            } else {
                // Standard modes: restore original material
                if (mapOriginalMaterials.has(child)) {
                    child.material = mapOriginalMaterials.get(child);
                }
            }
        }
    });

    // Apply renderer settings once per mode switch (not per mesh)
    if (mode === 0) {
        // Shadow mode
        scene.remove(skyMesh);
        renderer.toneMappingExposure = 0.5;
        motionBlurPass.enabled = false;
        bloomPass.strength = 0.4;
        bloomPass.radius = 1.0;
    } else if (mode === 1) {
        // Fog mode
        const skyFogMaterial = createFogMaterial(null);
        skyMesh.material = skyFogMaterial;
        if (!scene.children.includes(skyMesh)) {
            scene.add(skyMesh);
        }
        renderer.toneMappingExposure = 0.2;
    } else if (mode >= 2) {
        // Standard mode
        scene.remove(skyMesh);
        renderer.toneMappingExposure = 1.2;
        bloomPass.strength = 0.8;
        bloomPass.radius = 0.4;
        motionBlurPass.enabled = mode > 2;
    }
}

export function loadMap(scene) {
    const originalMaterials = new Map();
    return new Promise((resolve, reject) => {
        gltfLoader.load(
            'public/city.glb',
            function (gltf) {
                scene.add(gltf.scene);

            gltf.scene.traverse(function (child) {
                if (!originalMaterials.has(child)) {
                    originalMaterials.set(child, child.material);
                }
                if (child.isMesh && child.material && child.material.map) {
                    // child.material.map is your base color (diffuse) texture
                    const cityTexture = child.material.map;

                    // Create a custom shader material that uses that texture
                    const customCityMaterial = createFogMaterial(cityTexture);

                    // Apply to this mesh
                    child.material = customCityMaterial;
                }

                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
                if (child.name.includes("A1")) {
                    child.traverse((subChild) => {
                        if (subChild.isMesh) {
                            subChild.material = new THREE.MeshStandardMaterial({
                                color: 0x00ff00,
                                roughness: 0.2,
                                metalness: 0.8,
                            });
                        }
                    });
                }
                if (child.isMesh && child.name.includes("Collider")) {
                    child.visible = false; // Make the child invisible
                }
            });

            // Store references for event-driven material switching (no postStep listener)
            mapGltfScene = gltf.scene;
            mapOriginalMaterials = originalMaterials;

            resolve();
        },
        null,
        function (error) {
            console.error('An error happened:', error);
            reject(error);
        });
    });
}

export function loadHDR(scene, hdrPath = 'public/hdrinew.hdr', intensity) {
    rgbeLoader.load(hdrPath, function (texture) {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = texture;
        scene.background = texture;
        if (intensity !== undefined) {
            scene.environment.intensity = intensity;
        }
    });
}

export function loadCar(scene, carType) {
    const config = CAR_MATERIAL_CONFIGS[carType];
    return new Promise((resolve, reject) => {
        fbxLoader.load(config.bodyPath, (object) => {
            carMesh = object;
            scene.add(object);
            object.position.set(-390, 5, 23.5);

            const carCamera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, config.cameraFar);
            carCamera.position.set(0, 2, 6.3);
            carCamera.lookAt(new THREE.Vector3(0, 1.5, 0));
            object.add(carCamera);
            scene.userData.activeCamera = carCamera;

            const headlightUpdates = [];
            const brakeLightMeshes = [];

            object.traverse(function(child) {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    config.setupMesh(child, carColor);

                    // Collect headlight meshes for consolidated postStep update
                    if (config.setupHeadlights && config.headlightMeshNames.some(name => child.name.includes(name))) {
                        const spot = config.setupHeadlights(child, scene);
                        headlightUpdates.push({ child, spot, config });
                    }

                    // Collect brake/tail light meshes for consolidated postStep toggle
                    if (
                        child.name.includes("Brakelight") ||
                        child.name.includes("Studio_Car252_taillights") ||
                        child.name.includes("Studio_Car236_brakelight") ||
                        (child.name.includes("Rearlight") && carType === 'bmw') ||
                        (child.name.includes("Taillight") && carType === 'jeep') ||
                        (child.name.includes("Studio_Car252_light") && carType === 'porsche')
                    ) {
                        brakeLightMeshes.push({ child, carType });
                    }
                }
            });

            // Single consolidated postStep listener for headlights
            const _hlPos = new THREE.Vector3();
            const _hlTarget = new THREE.Vector3();

            if (headlightUpdates.length > 0) {
                world.addEventListener("postStep", () => {
                    for (const { child, spot, config: cfg } of headlightUpdates) {
                        child.getWorldPosition(_hlPos);
                        const dir = cfg.headlightDirection(child);
                        _hlTarget.copy(_hlPos).add(dir);
                        spot.updatePositionAndDirection(_hlPos, _hlTarget);
                    }
                });
            }

            // Single consolidated postStep listener for brake/tail lights
            if (brakeLightMeshes.length > 0) {
                world.addEventListener("postStep", () => {
                    const braking = isBraking || isTurboActive;
                    for (const { child, carType: ct } of brakeLightMeshes) {
                        if (ct === 'bmw' && child.name.includes("Rearlight")) {
                            child.material.emissiveIntensity = braking ? 5 : 2;
                        } else if (ct === 'jeep' && child.name.includes("Taillight")) {
                            child.material.emissiveIntensity = braking ? 10 : 5;
                        } else if (ct === 'porsche' && child.name.includes("Studio_Car252_light")) {
                            child.material.emissiveIntensity = braking ? 20 : 5;
                        } else {
                            child.material.emissiveIntensity = braking ? 50 : 2;
                        }
                    }
                });
            }

            // Wait for wheels to load before resolving
            loadWheels(scene, config.wheelPath).then(() => resolve());
        }, null, function(error) { console.error(error); reject(error); });
    });
}

export function loadCarIntro(scene, carType) {
    const config = CAR_MATERIAL_CONFIGS[carType];
    fbxLoader.load(config.introPath, (object) => {
        object.traverse(function(child) {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                config.setupMesh(child, carColor);
            }
        });
        scene.add(object);
    }, null, function(error) { console.error(error); });
}

export function loadWheels(scene, wheelPath) {
    return new Promise((resolve, reject) => {
    fbxLoader.load(wheelPath, (object) => {
        object.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;

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
        resolve();
    } , null, function(error){
        console.error(error);
        reject(error);
    });
    });
}

const MOVEABLE_OBJECT_PATHS = [
    "public/moveableObjects/oil_barrel_2.glb",
    "public/moveableObjects/simple_crate.glb",
    "public/moveableObjects/simple_long_crate.glb",
    "public/moveableObjects/concrete_barrier_hq.glb",
    "public/moveableObjects/plastic_chair.glb",
    "public/moveableObjects/stop-sign-ts.glb",
    "public/moveableObjects/traffic_cone_game_ready.glb",
    "public/moveableObjects/trash_can.glb",
];

export function loadMoveableObject(scene, index, camera) {
    loadObject(scene, camera, MOVEABLE_OBJECT_PATHS[index]);
}

function loadObject(scene, camera,  objectPath) {
    gltfLoader.load(objectPath, (gltf) => {
        const position = new THREE.Vector3();
        camera.getWorldPosition(position);
        // Set the position and quaternion of the object to the front of the camera
        gltf.scene.position.copy(position);
        objects.push(gltf.scene);
        scene.add(gltf.scene);
        gltf.scene.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
    }, null, function (error) {
        console.error(error);
    });
}

export function loadFonts() {
    return new Promise((resolve) => {
        fontloader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', function (font) {
            resolve(font);
        });
    });
}
