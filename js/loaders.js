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
import {carColor, isBraking, isTurboActive, selectedCarNo, world} from "./main.js";
import {FontLoader} from "three/addons/loaders/FontLoader.js";


let carMesh;
let wheelMeshes = [];
export {carMesh, wheelMeshes};

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

export let audioListener;
export let bmwAcc, porscheAcc, jeepAcc,bmwEngine, porscheEngine, jeepEngine,slide,turboSound;
export let korna;

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




export function loadMap(scene) {
    return new Promise((resolve) => {
        gltfLoader.load(
            'public/city.glb',
            function (gltf) {
                scene.add(gltf.scene);
                console.log('Model loaded successfully!');

                gltf.scene.traverse(function (child) {
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
                resolve();
            },
            null,
            function (error) {
                console.error('An error happened:', error);
            });
    });
}

export function loadJeepIntro(scene) {
    fbxLoader.load('public/jeep/jeepIntro.fbx', (object) =>{
        object.traverse(function (child) {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;

                if (child.name.includes("Brakelight")) {

                    emissiveLight(child, 0xff3333, 50); // Fren yapıldığında parlaklık
                }
                if (child.name.includes("Taillight")) {
                    child.material = new THREE.MeshStandardMaterial({
                        color: 0x550000, // Kırmızı bir ana renk
                        emissive: 0xff3333, // Emissive kırmızı ton
                        emissiveIntensity: 5, // Daha düşük başlangıç parlaklığı
                        roughness: 0.3, // Hafif yansımalar için
                        metalness: 0.1, // Biraz metalik görünüm
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
    }, null, function(error){
        console.error(error);
    });
}

export function loadBMWintro(scene) {
    fbxLoader.load('public/bmw/bmwIntro.fbx', (object) => {
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

export function loadPorscheIntro(scene) {
    fbxLoader.load("public/porsche/CarIntro.fbx", function(object){

        object.traverse(function(child) {
            if (child.isMesh){
                child.castShadow = child.receiveShadow = true;
                if (child.name.includes("Object") || child.name.includes("Studio_Car187.002")){
                    transparent(child.material);
                }
                if (child.name.includes("Studio_Car276")){
                    transparent(child.material, 0x5C0007);
                }
                if (child.name.includes("Studio_Car148")){
                    emissiveLight(child, 0xffffff, 20.0);
                }
                if (child.name.includes("Studio_Car149")){
                    emissiveLight(child, 0xffffff, 20.0);
                }
                if (child.name.includes("headlight1") || child.name.includes("headlight2")) {
                    emissiveLight(child, 0xffffff, 20.0);
                }
                if (child.name.includes("Studio_Car252_light")) {
                    emissiveLight(child, 0xff3333, 5);
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
                    emissiveLight(child, 0xff3333, 50); // Fren yapıldığında parlaklık
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

            object.traverse(function(child) {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;

                    if (child.material.name === 'Jeep_GladiatorRewardRecycled_2019Paint_Material'){
                        metallicPaint(child.material,carColor);
                    }
                    if (child.name.includes("Brakelight")) {
                        const originalMaterial = child.material;
                        world.addEventListener("postStep", () => {
                            if (isBraking || isTurboActive) {
                                emissiveLight(child, 0xff3333, 50); // Fren yapıldığında parlaklık
                            }else{
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
                            if (isBraking || isTurboActive) {
                                child.material.emissiveIntensity = 10;
                            }else{
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
                    if (child.name.includes("platelight")){
                        const pointLight4 = pointLight(child.position, 0xCDDCFF, 0.05, 1, 5);
                        child.add(pointLight4);
                    }
                }
            });
            resolve();
        } , null, function(error){
            console.error(error);
        });
        loadWheels(scene, "public/jeep/jeep.fbx" );
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
                    if (child.material.name === 'BMW:carpaint1'){
                        metallicPaint(child.material,carColor);
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
                            if (isBraking || isTurboActive) {
                                child.material.emissiveIntensity = 5;
                            }else{
                                child.material.emissiveIntensity = 2;
                            }
                        });

                    }
                    if (child.name.includes("Brakelight")) {
                        const originalMaterial = child.material;
                        world.addEventListener("postStep", () => {
                            if (isBraking || isTurboActive) {
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
                            metallicPaint(child.material,carColor);
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
                                if (isBraking || isTurboActive) {
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
                                if (isBraking || isTurboActive) {
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
        });0
        scene.add(object);
    } , null, function(error){
        console.error(error);
    });
}

export function loadHDR(scene) {
    rgbeLoader.load('public/hdrinew.hdr', function (texture) {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = texture;
        scene.background = texture;
    });
}

export function loadFonts() {
    return new Promise((resolve) => {
        fontloader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', function (font) {
            resolve(font);
        });
    });
}
