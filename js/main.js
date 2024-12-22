import {loadMap, loadCar, loadHDR, carMesh, wheelMeshes, loadWheels} from './loaders.js';

import * as THREE from "three";
import * as CANNON from "cannon-es";
import CannonDebugger from "cannon-es-debugger";

import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import Stats from 'three/addons/libs/stats.module.js';

export let activeCamera, scene, renderer, composer, orbit, stats;
export let world, cannonDebugger, vehicle, carSize;

function init() {
    scene = new THREE.Scene();

    renderer = new THREE.WebGLRenderer({antialias: false});
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);// HDR renk kodlaması
    renderer.toneMapping = THREE.ReinhardToneMapping; // Tonemapping
    renderer.toneMappingExposure = 1.2; // Tonemapping parlaklık ayarı
    renderer.shadowMap.enabled = false;
    document.body.appendChild(renderer.domElement);


    const renderScene = new RenderPass(scene, null);
    composer = new EffectComposer(renderer);
    composer.addPass(renderScene);

    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.8,
        0.4,
        0.2
    );
    composer.addPass(bloomPass);

    stats = new Stats();
    stats.showPanel(0); // 0 = FPS, 1 = MS, 2 = MB, 3+ = özel
    document.body.appendChild(stats.dom);

    window.addEventListener('resize', function() {
        const activeCamera = scene.userData.activeCamera;
        if (activeCamera) {
            activeCamera.aspect = window.innerWidth / window.innerHeight;
            activeCamera.updateProjectionMatrix();
        }
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

function setCannonWorld(){
    world = new CANNON.World();
    world.gravity.set(0, -9.82, 0);
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.defaultContactMaterial.friction = 0.1;

    const groundMaterial = new CANNON.Material("groundMaterial");
    const wheelMaterial = new CANNON.Material("wheelMaterial");
    const wheelGroundContactMaterial = new CANNON.ContactMaterial(
        wheelMaterial,
        groundMaterial,
        {
            friction: 0.3,
            restitution: 0,
            contactEquationStiffness: 1000
        }
    );
    world.addContactMaterial(wheelGroundContactMaterial);

// Create the ground plane
    const groundBody = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: new CANNON.Plane(),
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // Rotate plane to be horizontal
    world.addBody(groundBody);

    cannonDebugger = new CannonDebugger(scene, world);
}

function createVehicle() {
    carSize = new THREE.Vector3();
    const boundingBox = new THREE.Box3().setFromObject(carMesh);
    boundingBox.getSize(carSize);

    const chassisShape = new CANNON.Box(new CANNON.Vec3(carSize.x / 2, (carSize.y / 2) - 0.1, carSize.z / 2));
    const chassisBody = new CANNON.Body({
        mass: 1500,
    });
    chassisBody.addShape(chassisShape);
    let pos = carMesh.position.clone();
    chassisBody.position.copy(pos);
    chassisBody.angularVelocity.set(0, 0, 0); // Initial angular velocity
    chassisBody.threemesh = carMesh;

    vehicle = new CANNON.RaycastVehicle({
        chassisBody: chassisBody,
        indexRightAxis: 0,
        indexUpAxis: 1,
        indexForwardAxis: 2
    });

    const wheelOptions = {
        mass: 0,
        radius: 0.4,
        directionLocal: new CANNON.Vec3(0, -1, 0),
        suspensionStiffness: 30,
        suspensionRestLength: 0.3,
        frictionSlip: 5,
        dampingRelaxation: 2.3,
        dampingCompression: 4.4,
        maxSuspensionForce: 100000,
        rollInfluence: 0.01,
        axleLocal: new CANNON.Vec3(-1, 0, 0),
        chassisConnectionPointLocal: new CANNON.Vec3(0, 0, 0),
        maxSuspensionTravel: 0.3,
        customSlidingRotationalSpeed: -30
    }

    let wheelCenter = new THREE.Vector3();
    let wheelSize = new THREE.Vector3();
    let wheelBodies = [];

    wheelMeshes.forEach(function(wheelMesh){
        const boundingBox = new THREE.Box3().setFromObject(wheelMesh);
        boundingBox.getCenter(wheelCenter);
        boundingBox.getSize(wheelSize);

        const shape = new CANNON.Cylinder(wheelSize.y / 2, wheelSize.y / 2, wheelSize.x, 20);
        const wheelBody = new CANNON.Body({
            mass: wheelOptions.mass,
            type: CANNON.Body.KINEMATIC,
        });
        wheelBody.collisionFilterGroup = 0;
        const q = new CANNON.Quaternion();
        q.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), -Math.PI / 2);
        wheelBody.addShape(shape, new CANNON.Vec3(), q);
        wheelBody.position.copy(wheelCenter);
        wheelBody.threemesh = wheelMesh;
        world.addBody(wheelBody);
        wheelBodies.push(wheelBody);



        wheelOptions.chassisConnectionPointLocal.set(wheelCenter.x, 0, wheelCenter.z);

        vehicle.addWheel({
            body: wheelBody,
            ...wheelOptions,
            chassisConnectionPointLocal: new CANNON.Vec3(wheelCenter.x, 0, wheelCenter.z)
        });
    });

    vehicle.wheelBodies = wheelBodies;

    world.addEventListener('postStep', function () {
        vehicle.wheelBodies.forEach((wheelBody, index) => {
            // Lastiklerin fiziksel pozisyon ve dönüşünü güncelle
            vehicle.updateWheelTransform(index);
            const wheelTransform = vehicle.wheelInfos[index].worldTransform;

            // Fizik motoru lastiklerinin pozisyonunu ve dönüşünü uygulayın
            wheelBody.position.copy(wheelTransform.position);
            wheelBody.quaternion.copy(wheelTransform.quaternion);

            // Görsel lastikleri fizik motoruyla senkronize edin
            if (wheelBodies[index].threemesh) {
                wheelBodies[index].threemesh.position.copy(wheelBody.position);
                wheelBodies[index].threemesh.quaternion.copy(wheelBody.quaternion);

            }

        });
    });

    vehicle.addToWorld(world);
}

//############################################################################################################
//####  MAIN FUNCTION  #######################################################################################
//############################################################################################################

// Vehicle controls
let forwardForce = 0;
let steeringValue = 0;
const maxSteerVal = Math.PI / 8; // Maximum steering angle
const maxForce =1000; // Maximum engine force

document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    switch (event.key) {
        case 'w': // Move forward
            forwardForce = maxForce;
            vehicle.setBrake(0, 0);
            vehicle.setBrake(0, 1);
            vehicle.applyEngineForce(forwardForce, 0);
            vehicle.applyEngineForce(forwardForce, 1);
            break;
        case 's': // Move backward
            forwardForce = -maxForce;
            vehicle.setBrake(0, 0);
            vehicle.setBrake(0, 1);
            vehicle.applyEngineForce(forwardForce, 0);
            vehicle.applyEngineForce(forwardForce, 1);
            break;
        case 'a': // Steer left
            steeringValue = maxSteerVal;
            vehicle.setSteeringValue(steeringValue, 0); // Front-left
            vehicle.setSteeringValue(steeringValue, 1); // Front-right
            break;
        case 'd': // Steer right
            steeringValue = -maxSteerVal;
            vehicle.setSteeringValue(steeringValue, 0);
            vehicle.setSteeringValue(steeringValue, 1);
            break;
    }
});

document.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();
    switch (event.key) {
        case 'w':
            vehicle.setBrake(25, 0);
            vehicle.setBrake(25, 1);
            break;
        case 's':
            vehicle.setBrake(25, 0);
            vehicle.setBrake(25, 1);
            break;
        case 'a':
            steeringValue = 0;
            vehicle.setSteeringValue(steeringValue, 0);
            vehicle.setSteeringValue(steeringValue, 1);
            break;
        case 'd':
            steeringValue = 0;
            vehicle.setSteeringValue(steeringValue, 0);
            vehicle.setSteeringValue(steeringValue, 1);
            break;
    }
});
let cameraStartZ = 6.3; // Başlangıç Z pozisyonu (ilk değer)
let cameraTargetZ = 8; // Hedef Z pozisyonu
let cameraAnimationDuration = 3000; // 1 saniye (ms)
let cameraAnimationStartTime = null;
let isReturning = false; // Kameranın geri dönüp dönmediğini kontrol etmek için
let currentCameraZ = cameraStartZ; // Kameranın mevcut Z pozisyonu

document.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'w') {
        const activeCamera = scene.userData.activeCamera;
        if (activeCamera) {
            currentCameraZ = activeCamera.position.z; // Mevcut pozisyonu kaydet
        }
        cameraAnimationStartTime = performance.now(); // Animasyonu başlat
        isReturning = false; // Geri dönüş durumu sıfırla
    }
});

document.addEventListener('keyup', (event) => {
    if (event.key.toLowerCase() === 'w') {
        const activeCamera = scene.userData.activeCamera;
        if (activeCamera) {
            currentCameraZ = activeCamera.position.z; // Mevcut pozisyonu kaydet
        }
        cameraAnimationStartTime = performance.now(); // Animasyonu başlat
        isReturning = true; // Geri dönüş animasyonu başlasın
    }
});


function animate() {
    world.step(1/60);

    const currentTime = performance.now();

    if (cameraAnimationStartTime !== null) {
        const elapsedTime = currentTime - cameraAnimationStartTime;
        const t = Math.min(elapsedTime / cameraAnimationDuration, 1); // 0 ile 1 arasında interpolasyon
        const activeCamera = scene.userData.activeCamera;

        if (activeCamera) {
            if (!isReturning) {
                // İleri animasyon: Mevcut pozisyondan 8'e
                activeCamera.position.z = THREE.MathUtils.lerp(currentCameraZ, cameraTargetZ, t);
            } else {
                // Geri dönüş animasyonu: Mevcut pozisyondan 6.4'e
                activeCamera.position.z = THREE.MathUtils.lerp(currentCameraZ, cameraStartZ, t);
            }

            if (t === 1) {
                cameraAnimationStartTime = null; // Animasyon tamamlandı
            }
        }
    }

    try {
        const chassisBody = vehicle.chassisBody;
        chassisBody.threemesh.position.copy(new THREE.Vector3(chassisBody.position.x, chassisBody.position.y - (carSize.y)/2, chassisBody.position.z));
        chassisBody.threemesh.quaternion.copy(chassisBody.quaternion);

        console.log("Bi sıkıntı yok he");
    }
    catch (e) {
        console.error("Bi sıkıntı mı var");
    }


    stats.begin();
    const activeCamera = scene.userData.activeCamera;
    if (activeCamera) {
        composer.passes[0].camera = activeCamera;
        composer.render();
        console.log("Aktif Kamera var");
    } else {
        console.error("Aktif kamera bulunamadı.");
    }
    cannonDebugger.update();
    stats.end();
    requestAnimationFrame(animate);
}

function main() {
    init();
    setCannonWorld();
    loadMap(scene);
    loadCar(scene).then(() => {
        return loadWheels(scene);
    }).then(() => {

        const activeCamera=scene.userData.activeCamera;
        if (activeCamera) {
            composer.passes[0].camera = activeCamera; // RenderPass için aktif kamerayı ayarla
            console.log("Kamera başarıyla ayarlandı.");
        }
    }).then(() => {
        createVehicle();
    })

    loadHDR(scene, renderer);
    animate();
}



main();