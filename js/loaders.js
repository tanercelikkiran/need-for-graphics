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
import {isBraking, world,useShadow} from "./main.js";

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
            diffuseMap: { value: diffuseMap },
            uFogNear: { value: 15.0 },
            uFogFar: { value: 50.0 },
            uFogColor: { value: fogColor },
            uSolidColor: { value: solidColor }, // Add solid color
            uHasTexture: { value: !!diffuseMap }, // Check if a texture is provided
        }
    });
}

const ShadowVertexShader = await loadShader("shaders/ShadowVertex.glsl");

const ShadowFragmentShader = await loadShader("shaders/ShadowFragment.glsl");

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



export function loadMap(scene) {
    const originalMaterials = new Map();
    return new Promise((resolve) => {
        gltfLoader.load(
            'public/city.glb',
            function (gltf) {
                scene.add(gltf.scene);
                console.log('Model loaded successfully!');
            scene.add(gltf.scene);
            console.log('Model loaded successfully!');


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


                //     if (child.isMesh && child.name.includes("PLight")) {
                //
                //         // Mevcut konumda PointLight oluştur
                //         const pointLight = new THREE.PointLight(0xFFF0CC, 4, 50, 1);
                //         pointLight.position.copy(child.position);
                //
                //         // PointLight'ı sahneye ekle
                //         scene.add(pointLight);
                //     }
            });
            world.addEventListener("postStep", () => {
                gltf.scene.traverse(function (child) {
                    if (child.isMesh && child.material) {
                        if (useShadow<2) {

                            if (child.material.map) {
                                const cityTexture = child.material.map;
                                const customCityMaterial = createFogMaterial(cityTexture);
                                child.material = customCityMaterial;
                            }
                        } else {
                            if (originalMaterials.has(child)) {
                                child.material = originalMaterials.get(child);
                            }
                        }
                    }
                });
            });

            resolve();
        },
        null,
        function (error) {
            console.error('An error happened:', error);
        });
    });
}

export function loadBMWintro(scene) {
    fbxLoader.load('public/bmw/bmwfinal.fbx', (object) => {
        object.traverse(function(child) {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;

                // Apply specific material changes for the BMW model if necessary
                if (child.name.includes("Glass")) {
                    transparent(child.material); // Example of applying a transparent material to a part
                }

                if (child.name.includes("HeadlightWindow")) {
                    transparent(child.material); // Example of applying a transparent material to a part
                }

                // Add any specific light effects or emissive materials to parts of the car
                if (child.name.includes("Rearlight")) {
                    child.material = new THREE.MeshStandardMaterial({
                        color: 0x550000, // Kırmızı bir ana renk
                        emissive: 0xff3333, // Emissive kırmızı ton
                        emissiveIntensity: 2, // Daha düşük başlangıç parlaklığı
                        roughness: 0.3, // Hafif yansımalar için
                        metalness: 0.1, // Biraz metalik görünüm
                    });

                }
                if (child.name.includes("Brakelight")) {
                    emissiveLight(child, 0xff3333, 10);
                }

                if (child.name.includes("Headl")) {
                    emissiveLight(child, 0xFFFFFF, 0.4); // Example for emissive lighting effect

                }
                if (child.name.includes("RearlightWindow")) {
                    transparent(child.material, 0xffffe0); // Example of applying a transparent material to a part
                }
                if (child.name.includes("HeadlightWindow")) {
                    transparent(child.material); // Example of applying a transparent material to a part
                }
                if (child.name.includes("platelight")){
                    const pointLight3 = pointLight(child.position, 0xCDDCFF, 0.05, 1, 5);
                    child.add(pointLight3);
                }
            }
        });
        scene.add(object);
    } , null, function(error){
        console.error(error);
    });
}

export function loadBike(scene) {
    fbxLoader.load('public/motorcycle/motorcycle.fbx', (object) => {

        const carLightmotor = new THREE.PointLight(0xFFF0CC, 50, 500);
        carLightmotor.position.set(0, 10 , 5);
        scene.add(carLightmotor);

        object.traverse(function(child) {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.name.includes("chassis_chassis")){
                    metallicPaint(child.material,0xFFFFFF);
                }
                if (child.name.includes("chassis_mate")){
                    metallicPaint(child.material,0xF8CD02);
                }

                if (child.name.includes("brakelight")) {
                    const originalMaterial = child.material;
                    world.addEventListener("postStep", () => {
                        if (isBraking) {
                            emissiveLight(child, 0xff3333, 50); // Fren yapıldığında parlaklık
                        }else{
                            child.material = originalMaterial;
                        }
                    });
                }
                if (child.name.includes("rearlight")) {
                    emissiveLight(child, 0xFFFFFF, 2);
                }

                if (child.name.includes("headlightSpot")) {
                    // Example for emissive lighting effect

                    const headlightSpotMotor = spotlight(
                        new THREE.Vector3(0, 0, 0), // we'll override in postStep
                        new THREE.Vector3(0, -0.05, -1)
                    );

                    // Add it to the scene
                    scene.add(headlightSpotMotor);
                    scene.add(headlightSpotMotor.target);

                    // Now each physics step, update the spotlight so it "follows" this child
                    world.addEventListener("postStep", () => {
                        const updatedPositionMotor = child.getWorldPosition(new THREE.Vector3());
                        const updatedDirectionMotor = new THREE.Vector3(0, -0.1, -1); // Varsayılan ileri yön
                        const updatedQuatMotor = child.getWorldQuaternion(new THREE.Quaternion());
                        updatedDirectionMotor.applyQuaternion(updatedQuatMotor);

                        headlightSpotMotor.updatePositionAndDirection(
                            updatedPositionMotor,
                            updatedPositionMotor.clone().add(updatedDirectionMotor)
                        );
                    });
                }
                if (child.name.includes("headlight")) {
                    emissiveLight(child, 0xFFFFFF, 2); // Example for emissive lighting effect

                }
            }
        });
        scene.add(object);
    } , null, function(error){
        console.error(error);
    });
}

export function loadJeep(scene) {
    return new Promise((resolve) => {
        fbxLoader.load('public/jeep/jeepWnowheels.fbx', (object) => {
            carMesh = object;
            scene.add(object);

            const carCamera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 1000);
            carCamera.position.set(0, 2, 6.3); // Kamerayı arabanın arkasına yerleştir
            carCamera.lookAt(new THREE.Vector3(0, 1.5, 0)); // Kameranın arabaya doğru bakmasını sağla
            carMesh.add(carCamera);

            scene.userData.activeCamera = carCamera;

            const carLightjeep = new THREE.PointLight(0xFFF0CC, 50, 500);
            carLightjeep.position.set(0, 10, 5);
            scene.add(carLightjeep);

            object.traverse(function (child) {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;

                    if (child.name.includes("Brakelight")) {
                        const originalMaterial = child.material;
                        world.addEventListener("postStep", () => {
                            if (isBraking) {
                                emissiveLight(child, 0xff3333, 50); // Fren yapıldığında parlaklık
                            } else {
                                child.material = originalMaterial;
                            }
                        });
                    }
                    if (child.name.includes("Taillight")) {
                        child.material = new THREE.MeshStandardMaterial({
                            color: 0x550000, // Kırmızı bir ana renk
                            emissive: 0xff3333, // Emissive kırmızı ton
                            emissiveIntensity: 5, // Daha düşük başlangıç parlaklığı
                            roughness: 0.3, // Hafif yansımalar için
                            metalness: 0.1, // Biraz metalik görünüm
                        });
                        world.addEventListener("postStep", () => {
                            if (isBraking) {
                                child.material.emissiveIntensity = 10;
                            } else {
                                child.material.emissiveIntensity = 5;
                            }
                        });

                    }

                    if (child.name.includes("HeadlightSpot")) {
                        // Example for emissive lighting effect

                        const headlightSpotJeep = spotlight(
                            new THREE.Vector3(0, 0, 0), // we'll override in postStep
                            new THREE.Vector3(0, -0.05, -1)
                        );
                        headlightSpotJeep.castShadow = true;
                        // Add it to the scene
                        scene.add(headlightSpotJeep);
                        scene.add(headlightSpotJeep.target);

                        // Now each physics step, update the spotlight so it "follows" this child
                        world.addEventListener("postStep", () => {
                            const updatedPositionJeep = child.getWorldPosition(new THREE.Vector3());
                            const updatedDirectionJeep = new THREE.Vector3(0, -0.1, 1); // Varsayılan ileri yön
                            const updatedQuatJeep = child.getWorldQuaternion(new THREE.Quaternion());
                            updatedDirectionJeep.applyQuaternion(updatedQuatJeep);

                            headlightSpotJeep.updatePositionAndDirection(
                                updatedPositionJeep,
                                updatedPositionJeep.clone().add(updatedDirectionJeep)
                            );
                        });
                    }
                    if (child.name.includes("Headlight")) {
                        emissiveLight(child, 0xFFFFFF, 2); // Example for emissive lighting effect

                    }
                    if (child.name.includes("LicensePlate")) {
                        child.material = new THREE.MeshStandardMaterial({
                            color: 0xffffff,
                            emissive: 0x000000,
                            roughness: 0.5,
                            metalness: 0.1,
                        });
                    }
                    if (child.name.includes("Trunklight")) {
                        emissiveLight(child, 0xFFFFFF, 5);
                    }
                    if (child.name.includes("platelight")) {
                        const pointLight4 = pointLight(child.position, 0xCDDCFF, 0.05, 1, 5);
                        child.add(pointLight4);
                    }
                }
            });
            scene.add(object);
        }, null, function (error) {
            console.error(error);
        });
    });
}

export function loadBMW(scene) {
    return new Promise((resolve) => {
        fbxLoader.load('public/bmw/bmwWnowheels.fbx', (object) => {
            carMesh = object;
            scene.add(object);

            const carCamera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 1000);
            carCamera.position.set(0, 2, 6.3); // Kamerayı arabanın arkasına yerleştir
            carCamera.lookAt(new THREE.Vector3(0, 1.5, 0)); // Kameranın arabaya doğru bakmasını sağla
            carMesh.add(carCamera);

            scene.userData.activeCamera = carCamera;

            const carLightBMW = new THREE.PointLight(0xFFF0CC, 50, 500);
            carLightBMW.position.set(0, 0 , 0);
            scene.add(carLightBMW);

            object.traverse(function(child) {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;

                    // Apply specific material changes for the BMW model if necessary
                    if (child.name.includes("Glass")) {
                        transparent(child.material); // Example of applying a transparent material to a part
                    }

                    if (child.name.includes("HeadlightWindow")) {
                        transparent(child.material); // Example of applying a transparent material to a part
                    }

                    // Add any specific light effects or emissive materials to parts of the car
                    if (child.name.includes("Rearlight")) {
                        child.material = new THREE.MeshStandardMaterial({
                            color: 0x550000, // Kırmızı bir ana renk
                            emissive: 0xff3333, // Emissive kırmızı ton
                            emissiveIntensity: 2, // Daha düşük başlangıç parlaklığı
                            roughness: 0.3, // Hafif yansımalar için
                            metalness: 0.1, // Biraz metalik görünüm
                        });
                        world.addEventListener("postStep", () => {
                            if (isBraking) {
                                child.material.emissiveIntensity = 5;
                            }else{
                                child.material.emissiveIntensity = 2;
                            }
                        });

                    }
                    if (child.name.includes("Brakelight")) {
                        const originalMaterial = child.material;
                        world.addEventListener("postStep", () => {
                            if (isBraking) {
                                emissiveLight(child, 0xff3333, 50); // Fren yapıldığında parlaklık
                            }else{
                                child.material = originalMaterial;
                            }
                        });
                    }
                    if (child.name.includes("Headlight")) {
                        // Example for emissive lighting effect
                        const headlightSpotBMW = spotlight(
                            new THREE.Vector3(0, 0, 0), // we'll override in postStep
                            new THREE.Vector3(0, -0.05, -1)
                        );
                        headlightSpotBMW.castShadow=true;

                        // Add it to the scene
                        scene.add(headlightSpotBMW);
                        scene.add(headlightSpotBMW.target);

                        // Now each physics step, update the spotlight so it "follows" this child
                        world.addEventListener("postStep", () => {
                            const updatedPositionBMW = child.getWorldPosition(new THREE.Vector3());
                            const updatedDirection = new THREE.Vector3(0, -0.1, 1); // Varsayılan ileri yön
                            const updatedQuat = child.getWorldQuaternion(new THREE.Quaternion());
                            updatedDirection.applyQuaternion(updatedQuat);

                            headlightSpotBMW.updatePositionAndDirection(
                                updatedPositionBMW,
                                updatedPositionBMW.clone().add(updatedDirection)
                            );
                        });
                    }
                    if (child.name.includes("Headl")) {
                        emissiveLight(child, 0xFFFFFF, 0.4); // Example for emissive lighting effect
                    }
                    if (child.name.includes("RearlightWindow")) {
                        transparent(child.material, 0xffffe0); // Example of applying a transparent material to a part
                    }
                    if (child.name.includes("HeadlightWindow")) {
                        transparent(child.material);
                    }
                    if (child.name.includes("platelight")){
                        const pointLight3 = pointLight(child.position, 0xCDDCFF, 0.05, 1, 5);
                        child.add(pointLight3);
                    }
                }
            });
            resolve();
        } , null, function(error){
            console.error(error);
        });
        loadWheels(scene, "public/bmw/bmwwheels.fbx" );
    } );
}

export function loadPorsche(scene) {
    return new Promise((resolve) => {
        fbxLoader.load("public/porsche/CarwNoWheels.fbx", function(object){
            carMesh = object;
            scene.add(object);

            const carCamera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 1000);
            carCamera.position.set(0, 2, 6.3); // Kamerayı arabanın arkasına yerleştir
            carCamera.lookAt(new THREE.Vector3(0, 1.5, 0)); // Kameranın arabaya doğru bakmasını sağla
            object.add(carCamera);

            scene.userData.activeCamera = carCamera;

                // const carLight = new THREE.PointLight(0xFFF0CC, 50, 500);
                // carLight.position.set(0, 10 , 5);
                // carMesh.add(carLight);

            object.traverse( function(child){
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
                            headlightSpot.castShadow=true;

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
                    if (child.name.includes("Studio_Car252_light")) {
                        world.addEventListener("postStep", () => {
                            if (isBraking) {
                                emissiveLight(child, 0xff3333, 20); // Fren yapıldığında parlaklık
                            }else{
                                emissiveLight(child, 0xff3333, 5);
                            }
                        });
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
                    if (child.name.includes("Studio_Car252_taillights") || child.name.includes("Studio_Car236_brakelight")) {
                        const originalMaterial = child.material;
                        world.addEventListener("postStep", () => {
                            if (isBraking) {
                                emissiveLight(child, 0xff3333, 50); // Fren yapıldığında parlaklık
                            }else{
                                child.material = originalMaterial;
                            }
                        });
                    }
                }
            });
            resolve();
        },
            null, function(error){
                console.error(error);
        });
        loadWheels(scene, "public/porsche/wheels.fbx" );
    });
}

export function loadWheels(scene, wheelPath) {
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