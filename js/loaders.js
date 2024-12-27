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

export function loadMap(scene) {
    gltfLoader.load(
        'public/cityfinal.glb',
        function (gltf) {
            scene.add(gltf.scene);
            console.log('Model loaded successfully!');

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

 export function loadCar(scene, orbit) {
    return new Promise((resolve) => {
        fbxLoader.load("public/CarwNoWheels.fbx", function(object){
                carMesh = object;
                scene.add(object);


                const carCamera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 1000);
                carCamera.position.set(0, 2, 6.3); // Kamerayı arabanın arkasına yerleştir
                carCamera.lookAt(new THREE.Vector3(0, 1.5, 0)); // Kameranın arabaya doğru bakmasını sağla
                carMesh.add(carCamera);

                scene.userData.activeCamera = carCamera;

                console.log("Kamera başarıyla eklendi ve aktif kamera ayarlandı.");

                const carLight = new THREE.PointLight(0xFFF0CC, 50, 50);
                carLight.position.set(0, 5 , 5);
                carMesh.add(carLight);

                carMesh.traverse( function(child){
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

                            // Arabanın yönünü al
                            const carDirection = new THREE.Vector3();
                            carMesh.getWorldDirection(carDirection);

                            // Spotlight oluştur
                            const spotlight1 = spotlight(
                                child.getWorldPosition(new THREE.Vector3()),
                                new THREE.Vector3(), // Placeholder (fonksiyon içinde düzeltilecek)
                                carDirection
                            );
                            scene.add(spotlight1.target);
                            scene.add(spotlight1);

                            // Spotlight pozisyon ve yönünü sürekli güncelle
                            world.addEventListener("postStep", function () {
                                const updatedPosition = child.getWorldPosition(new THREE.Vector3());
                                const updatedDirection = new THREE.Vector3();
                                carMesh.getWorldDirection(updatedDirection);

                                spotlight1.updatePositionAndDirection(updatedPosition, updatedDirection);
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
            },
            null, function(error){
                console.error(error);
            });
        setTimeout(() => {
            resolve();
        }, 8000); // 5-second delay
    });
}


export function loadWheels(scene) {
    return new Promise((resolve, reject) => {
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

            // Lastik modelini sahneye ekle (isteğe bağlı, debug için)
            scene.add(object);

            console.log("Wheels loaded successfully!");
            resolve();
        }, null, (error) => {
            console.error('Error loading wheels:', error);
            reject(error);
        });
    });
}



export function loadHDR(scene) {
    new RGBELoader().load('public/hdri.hdr', function (texture) {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = texture;
        scene.background = texture;
        scene.environment.intensity = 0.2;
    });
}