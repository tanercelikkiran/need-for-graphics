import {loadMap, loadSportCar, loadHDR, carMesh, wheelMeshes} from './loaders.js';

import * as THREE from "three";
import * as CANNON from "cannon-es";
import CannonDebugger from "cannon-es-debugger";

import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import Stats from 'three/addons/libs/stats.module.js';

export let scene, renderer, composer, stats;
export let world, cannonDebugger, vehicle, carSize;

// ================================================
// 1) ARACIN GİRİŞ / DURUM FLAGLERİ
// ================================================
let isAccelerating   = false;
let isBraking        = false;
let isSteeringLeft   = false;
let isSteeringRight  = false;
let isHandBraking    = false;

let brakeTest=0;

// ================================================
// 2) ARACIN ANLIK MOTOR & DİREKSİYON
// ================================================
let currentEngineForce = 0;
let currentSteering    = 0;

// ================================================
// 3) TEMEL AYARLAR
// ================================================
let maxEngineForce = 4500;  // Sports cars have more powerful engines
let engineRamp     = 800;   // Faster throttle response
let brakeForce     = 50;   // Stronger braking force

// ================================================
// 4) DİREKSİYON VE DAMPING AYARLARI
// ================================================
let maxSteerVal  = Math.PI / 7;  // Steering range remains the same (~45 degrees)
let steerSpeed   = 0.005;         // Reduced steering speed (slower turns)
let steerDamping = 0.05;         // Increased damping (slower return to center)
// ================================================
// 5) HIZ BAZLI DİREKSİYON AYARLARI
// ================================================
let speedLimit         = 80;       // Higher speed before steering reduces (~288 km/h)
let minSteerFactor     = 0.2;      // Steering effectiveness drops less at high speeds
let mediumSpeed        = 30;       // Medium speed (~108 km/h)
let mediumSteerFactor  = 1.0;      // Full steering effectiveness below mediumSpeed
let steerFalloff       = 0.001;    // Slightly less aggressive falloff

// ================================================
// 6) FREN ANINDA EKSTRA DİREKSİYON KISITLAMASI
// ================================================
let brakeSteerMultiplier = 0.7;    // Slightly more forgiving during braking

// ================================================
// 7) EL FRENİ & DRIFT AYARLARI
// ================================================
let handbrakeForce = 400;          // Stronger handbrake for drifting
let driftSlip      = 0.7;          // Lower friction for drifting
let normalSlip     = 4.8;          // Slightly more slippery tires for agility

// ================================================
// 8) KAMERA POZİSYONLARI - DİKEY HAREKET
// ================================================
let cameraStartZ            = 6.3;   // Adjusted for a more dynamic view
let cameraTargetZ;                       // Anlık hedef Z (dinamik)
let maxCameraTargetZ        = 7.8;   // Camera zooms out further
let minCameraTargetZ        = 6.6;
let brakingCameraZ          = 5.5;   // Closer view during braking
let rearingCameraZ          = 5.8;
let backingCameraZ          = 7.0;
let speedFactor             = 0.08;  // Faster camera zooming
let cameraBackZ             = 6.0;   // Slightly forward position on stop
let cameraAnimationDuration3 = 1500; // Faster animations
let cameraAnimationDuration2 = 400;
let cameraAnimationDuration1 = 800;
let cameraAnimationStartTime = null; // Animasyon için referans zaman
let isMovingForward         = false;
let isMovingBackward        = false;
let isBackingMorvard        = false; // (Kod içinde özel durumu varsa)
let isMovingToIdle          = false;
let isBrakingCamera         = false;
let isStopped               = false;
let isBrakingPhase          = 0;     // Fren aşamasını izleme
let currentCameraZ          = cameraStartZ;

// ================================================
// 9) KAMERA POZİSYONLARI - YATAY HAREKET
// ================================================
let isMovingLeft             = false;
let isMovingRight            = false;
let cameraStartX             = 0;
let cameraLeftTargetX        = -1.2; // Wider camera movement for dramatic effect
let cameraRightTargetX       = 1.2;
let cameraAnimationStartTimeX = null;
let currentCameraX           = cameraStartX;

// ================================================
// 10) TOP SPEED VE İVMELENME AYARLARI
// ================================================
let maxSpeed = 304 / 3.6; // Maksimum hız (304 km/h -> m/s)
let engineDropFactor = 0.7;


const fixedTimeStep = 1 / 60; // Fixed time step of 60 Hz
const maxSubSteps = 10;       // Maximum number of sub-steps to catch up with the wall clock
let lastTime = performance.now();

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

    document.addEventListener('keydown', (event) => {
        const key = event.key.toLowerCase();
        switch (key) {
            case 'w':
                isAccelerating = true;
                isBraking = false;
                break;
            case 's':
                isBraking = true;
                isAccelerating = false;
                break;
            case 'a':
                isSteeringLeft = true;
                break;
            case 'd':
                isSteeringRight = true;
                break;
            case ' ':
                // Space -> el freni aktif
                isHandBraking = true;
                // İsteğe bağlı: Arka tekerlekleri kaygan yapmak
                vehicle.wheelInfos[2].frictionSlip = driftSlip; // Rear-left
                vehicle.wheelInfos[3].frictionSlip = driftSlip; // Rear-right
                break;
        }
    });

    document.addEventListener('keyup', (event) => {
        const key = event.key.toLowerCase();
        switch (key) {
            case 'w':
                isAccelerating = false;
                break;
            case 's':
                isBraking = false;
                break;
            case 'a':
                isSteeringLeft = false;
                break;
            case 'd':
                isSteeringRight = false;
                break;
            case ' ':
                // Space bırakıldı -> el freni off
                isHandBraking = false;
                // Tekerlekleri tekrar normal sürtünmeye ayarla
                vehicle.wheelInfos[2].frictionSlip = normalSlip;
                vehicle.wheelInfos[3].frictionSlip = normalSlip;
                break;
        }
    });

}

function setCannonWorld(){
    world = new CANNON.World();
    world.gravity.set(0, -9.82, 0);
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.useBoundingBoxes = true;
    world.defaultContactMaterial.friction = 0.1;

    world.addEventListener("beginContact", (event) => {
        console.log("Begin Contact:", event.bodyA, event.bodyB);
    });

    world.addEventListener("endContact", (event) => {
        console.log("End Contact:", event.bodyA, event.bodyB);
    });

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
    groundBody.aabbNeedsUpdate = true;

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
    const chassisOffset = new CANNON.Vec3(0, 0.2, 0);
    chassisBody.addShape(chassisShape,chassisOffset);
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
        mass: 15,
        radius: 0.35,
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

            switch (index) {
                case 2:
                    //rotation
                    wheelBodies[index].threemesh.rotation.z += -Math.PI;
            }
        });
    });

    vehicle.addToWorld(world);
}

function updateVehicleControls() {
    //---------------------------
    // 1) Aracın anlık hızını ölç
    //---------------------------
    const velocity = vehicle.chassisBody.velocity;
    // Sadece XZ düzlemindeki hızı (m/s)
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);


    //---------------------------
    // 2) Direksiyon oranını hesapla
    //---------------------------

    // 2A) "speedRatio1": mediumSpeed'e göre basit linear
    //    - 0 -> speed=0, 1 -> speed=mediumSpeed
    //    - mediumSpeed üzerinde, 1'i aşar
    let speedRatio1 = speed / mediumSpeed;

    // 2B) "speedRatio2": speedLimit'e göre
    //    - 0 -> speed=0, 1 -> speed=speedLimit ya da üstü
    let speedRatio2 = speed / speedLimit;
    if (speedRatio2 > 1) speedRatio2 = 1;  // clamp

    // 2C) Non-linear (örneğin dairesel) düşüş.
    //    1 / (1 + steerFalloff * speed^2) -> Yüksek hızda agresif düşüş
    const nonLinearFactor = 1 / (1 + steerFalloff * speed * speed);

    // Şimdi bu 3 “faktör”ü birleştirelim.
    // Örneğin:
    // - Düşük hızda (0~mediumSpeed) tam direksiyon (mediumSteerFactor=1).
    // - mediumSpeed üstünde artarak kısıtla, speedLimit'te minSteerFactor'e kadar düş.
    // - Non-linear factor de devrede, ama istersen "blend" edebilirsin.

    // Aşağıda basit bir blend örneği:
    // direksiyonFactor = nonLinearFactor * lineerFactor
    // lineerFactor = lerp(mediumSteerFactor, minSteerFactor, speedRatio2)
    const linearFactor = mediumSteerFactor +
        (minSteerFactor - mediumSteerFactor) * speedRatio2;

    let steerFactor = nonLinearFactor * linearFactor;
    // steerFactor aşırı düşük olmasın
    if (steerFactor < 0.05) steerFactor = 0.05;

    // 2D) Frenliyorsak (isBraking) direksiyon limitini biraz daha kıs
    if (isBraking) {
        steerFactor *= brakeSteerMultiplier;  // ~%60'a düşür
    }

    // Sonuç olarak bu frame'deki maks direksiyon
    const effectiveMaxSteer = maxSteerVal * steerFactor;

    //---------------------------
    // 3) Motor Gücü
    //---------------------------
    if (isAccelerating) {
        currentEngineForce = Math.min(
            currentEngineForce + engineRamp,
            maxEngineForce
        );
    } else if (isBraking) {
        // Geri vitese mi alsın yoksa fren mi yapsın?
        // Basitçe "geri" yaklaşımlardan biri:
        currentEngineForce = Math.max(
            currentEngineForce - engineRamp,
            -maxEngineForce / 2
        );
    } else {
        // Ne gaz ne fren
        const dampingFactor = 0.995; // Hızı azaltmak için katsayı
        const velocity = vehicle.chassisBody.velocity;
        vehicle.chassisBody.velocity.set(
            velocity.x * dampingFactor,
            velocity.y,
            velocity.z * dampingFactor
        );
        if (currentEngineForce > 0) {
            currentEngineForce = Math.max(currentEngineForce - engineRamp, 0);
        } else {
            currentEngineForce = Math.min(currentEngineForce + engineRamp, 0);
        }
    }

    //---------------------------
    // 4) Fren Uygula?
    //---------------------------
    let brakingValue = 0;
    // Eğer hızımız ileri yönlüyse ve S basılıysa, fren uygula
    if (isBraking > 0) {
        brakingValue = brakeForce;
    }

    //---------------------------
    // 5) Direksiyon
    //---------------------------
    if (isSteeringLeft) {
        // Sola doğru yavaşça art
        currentSteering = Math.min(currentSteering + steerSpeed, effectiveMaxSteer);
    } else if (isSteeringRight) {
        // Sağa doğru yavaşça art
        currentSteering = Math.max(currentSteering - steerSpeed, -effectiveMaxSteer);
    } else {
        // Ortalamaya dön (damping)
        if (currentSteering > 0) {
            currentSteering = Math.max(currentSteering - steerDamping, 0);
        } else {
            currentSteering = Math.min(currentSteering + steerDamping, 0);
        }
    }

    //---------------------------
    // 5.5) İvmelenme
    //---------------------------

    if (velocity.length() >= maxSpeed){
        currentEngineForce=0;
        // const speedLimiterFactor = maxSpeed / speed; // Fazla hızı oransal olarak azalt
        // vehicle.chassisBody.velocity.set(
        //     velocity.x * speedLimiterFactor,
        //     velocity.y * speedLimiterFactor,
        //     velocity.z * speedLimiterFactor
        // );
    } else {
        const speedRatio= velocity.length() / maxSpeed;
        const effectiveEngineForce= maxEngineForce*(1-speedRatio*engineDropFactor);
        currentEngineForce=Math.min(currentEngineForce, effectiveEngineForce);
    }

    //---------------------------
    // 6) Araca Uygula
    //---------------------------
    // Frenleri sıfırla
    vehicle.setBrake(0, 0);
    vehicle.setBrake(0, 1);
    vehicle.setBrake(0, 2); // Arka sol
    vehicle.setBrake(0, 3); // Arka sağ
    // (dört tekerleğe fren yapmak istiyorsan 2 ve 3. index'e de setBrake uygula)

    // 3) Normal fren (ör. S tuşu) varsa ön tekerleklere uygula
    if (isBraking) {
        vehicle.setBrake(brakingValue, 0);  // front-left
        vehicle.setBrake(brakingValue, 1);  // front-right
    }

    // 4) El freni aktifse, arka tekerleklere yüksek fren
    if (isHandBraking) {
        vehicle.setBrake(handbrakeForce, 2); // rear-left
        vehicle.setBrake(handbrakeForce, 3); // rear-right
    }

    // Motor kuvveti -> genelde ön tekerler
    vehicle.applyEngineForce(currentEngineForce, 0);
    vehicle.applyEngineForce(currentEngineForce, 1);

    // Direksiyon
    vehicle.setSteeringValue(currentSteering, 0);
    vehicle.setSteeringValue(currentSteering, 1);
}

function updateCamera() {

    document.addEventListener('keydown', (event) => {
        const activeCamera = scene.userData.activeCamera;
        if (activeCamera) {
            switch (event.key.toLowerCase()) {
                case 'w':
                    if (!isMovingForward) {
                        currentCameraZ = activeCamera.position.z; // Mevcut pozisyonu kaydet
                        isMovingForward = true;
                        isBrakingCamera = false;
                        isMovingBackward = false;
                        isMovingToIdle = false;
                        isBackingMorvard = false;
                        cameraAnimationStartTime = performance.now(); // Animasyonun başlangıç zamanı
                    }
                    break;
                case 's':
                    if (!isBraking) {
                        currentCameraZ = activeCamera.position.z;
                        isMovingForward = false;// Mevcut pozisyonu kaydet
                        isBrakingCamera = true;
                        isMovingBackward = false;
                        isMovingToIdle = false;
                        isBackingMorvard = false;
                        cameraAnimationStartTime = performance.now(); // Animasyonun başlangıç zamanı
                    }
                    break;
                case 'a': // Kamera sola hareket
                    if (!isMovingLeft) {
                        currentCameraX = activeCamera.position.x; // Mevcut pozisyonu kaydet
                        isMovingLeft = true;
                        isMovingRight = false;
                        cameraAnimationStartTimeX = performance.now(); // Animasyonun başlangıç zamanı
                    }
                    break;
                case 'd': // Kamera sağa hareket
                    if (!isMovingRight) {
                        currentCameraX = activeCamera.position.x; // Mevcut pozisyonu kaydet
                        isMovingRight = true;
                        isMovingLeft = false;
                        cameraAnimationStartTimeX = performance.now(); // Animasyonun başlangıç zamanı
                    }
                    break;
            }
        }
    });
    document.addEventListener('keyup', (event) => {
        const activeCamera = scene.userData.activeCamera;
        switch (event.key.toLowerCase()) {
            case 'w':
                if (activeCamera) {
                    currentCameraZ = activeCamera.position.z; // Mevcut pozisyonu kaydet
                }
                // Animasyonu başlat
                isMovingForward = false;
                isMovingBackward = true;
                isMovingToIdle = true;//
                isBrakingCamera = false;
                isBackingMorvard = false;
                cameraAnimationStartTime = performance.now();// Geri dönüş animasyonu başlasın
                break;
            case 's':
                if (activeCamera) {
                    currentCameraZ = activeCamera.position.z; // Mevcut pozisyonu kaydet
                }
                // Animasyonu başlat
                isMovingForward = false;
                isMovingBackward = false;
                isMovingToIdle = true;//
                isBrakingCamera = false;
                isBackingMorvard = true;
                isBrakingPhase=0;
                cameraAnimationStartTime = performance.now();// Geri dönüş animasyonu başlasın
                break;
            case 'a':
                currentCameraX = activeCamera.position.x; // Mevcut pozisyonu kaydet
                isMovingLeft = false;
                isMovingRight = false;
                cameraAnimationStartTimeX = performance.now(); // Geri dönüş animasyonu başlasın
                break;
            case 'd':
                currentCameraX = activeCamera.position.x; // Mevcut pozisyonu kaydet
                isMovingLeft = false;
                isMovingRight = false;
                cameraAnimationStartTimeX = performance.now(); // Geri dönüş animasyonu başlasın
                break;
        }
    });

    const currentTime = performance.now();

    if (cameraAnimationStartTime !== null) {
        const elapsedTime = currentTime - cameraAnimationStartTime;
        const activeCamera = scene.userData.activeCamera;

        if (activeCamera) {
            if (isMovingBackward) {
                // W tuşundan el çekince geri dönüş: Mevcut pozisyondan 6'ya
                const t = Math.min(elapsedTime / cameraAnimationDuration1, 1);
                const easeT = easeInOutSin(t);
                activeCamera.position.z = THREE.MathUtils.lerp(currentCameraZ, cameraBackZ, easeT);

                if (t === 1) {
                    isMovingBackward = false;
                    cameraAnimationStartTime = null; // Animasyon tamamlandı
                    // Geri dönüş tamamlandı
                }
            }else if (isBackingMorvard) {
                // W tuşundan el çekince geri dönüş: Mevcut pozisyondan 6'ya
                const t = Math.min(elapsedTime / cameraAnimationDuration1, 1);
                const easeT = easeInOutSin(t);
                activeCamera.position.z = THREE.MathUtils.lerp(currentCameraZ, backingCameraZ, easeT);

                if (t === 1) {
                    isBackingMorvard = false;
                    cameraAnimationStartTime = null; // Animasyon tamamlandı
                    // Geri dönüş tamamlandı
                }
            } else if (isMovingToIdle && isStopped) {
                // Araba durunca idle pozisyonuna dönüş: Mevcut pozisyondan 6.3'e
                const t = Math.min(elapsedTime / cameraAnimationDuration1, 1);
                const easeT = easeInOutSin(t);
                activeCamera.position.z = THREE.MathUtils.lerp(currentCameraZ, cameraStartZ, easeT);

                if (t === 1) {
                    isMovingToIdle = false;
                    cameraAnimationStartTime = null; // Animasyon tamamlandı
                    // Idle pozisyonuna ulaşıldı
                }
            } else if (isMovingForward) {
                try {
                    const velocity = vehicle.chassisBody.velocity.length();
                    cameraTargetZ = THREE.MathUtils.clamp(
                        maxCameraTargetZ - velocity * speedFactor,
                        minCameraTargetZ,
                        maxCameraTargetZ
                    );

                    if (elapsedTime >= cameraAnimationDuration3) {
                        // Animasyon tamamlandıktan sonra da hıza bağlı güncelleme
                        activeCamera.position.z = THREE.MathUtils.lerp(
                            activeCamera.position.z,
                            cameraTargetZ,
                            0.1 // Daha yumuşak bir geçiş için sabit bir katsayı
                        );
                    } else {
                        // Animasyon sırasında
                        const t = Math.min(elapsedTime / cameraAnimationDuration3, 1);
                        const easeT = easeInOutSin(t);
                        activeCamera.position.z = THREE.MathUtils.lerp(currentCameraZ, cameraTargetZ, easeT);
                    }
                } catch (e) {
                    console.error("Kamera hıza göre güncellenemedi:", e);
                }
            } else if (isBrakingCamera) {
                try {
                    if (isBrakingPhase===0) {
                        const velocity = vehicle.chassisBody.velocity.length();
                        const t = Math.min(elapsedTime / cameraAnimationDuration1, 1);
                        const easeT = easeInOutSin(t);
                        activeCamera.position.z = THREE.MathUtils.lerp(currentCameraZ, brakingCameraZ, easeT);

                        if (t === 1) {
                            isBrakingPhase = 1; // Faz 2'ye geçiş
                            cameraAnimationStartTime = performance.now();
                        }
                    }else if (isBrakingPhase===1) {
                        if (elapsedTime >= cameraAnimationDuration1) {
                            isBrakingPhase = 2;
                            cameraAnimationStartTime = performance.now();
                            currentCameraZ = activeCamera.position.z;
                        }
                    }else if (isBrakingPhase===2){
                        const t = Math.min(elapsedTime / cameraAnimationDuration1, 1);
                        const easeT = easeInOutSin(t);
                        activeCamera.position.z = THREE.MathUtils.lerp(currentCameraZ, rearingCameraZ, easeT);

                        if (t === 1) {
                            isBrakingCamera = false; // Animasyon tamamlandı
                            cameraAnimationStartTime = null;
                        }
                    }
                }
                catch (e) {
                    console.error("Bizde geri vites yok");
                }
            }
        }
    }
    if (cameraAnimationStartTimeX !== null) {
        const elapsedTimeX = currentTime - cameraAnimationStartTimeX;
        const activeCamera = scene.userData.activeCamera;

        if (activeCamera) {
            if (isMovingLeft) {
                const t = Math.min(elapsedTimeX / cameraAnimationDuration2, 1);
                const easeT = easeInOutSin(t);
                activeCamera.position.x = THREE.MathUtils.lerp(currentCameraX, cameraLeftTargetX, easeT);

                if (t === 1) {
                    cameraAnimationStartTimeX = null; // Animasyon tamamlandı
                }
            } else if (isMovingRight) {
                const t = Math.min(elapsedTimeX / cameraAnimationDuration2, 1);
                const easeT = easeInOutSin(t);
                activeCamera.position.x = THREE.MathUtils.lerp(currentCameraX, cameraRightTargetX, easeT);

                if (t === 1) {
                    cameraAnimationStartTimeX = null; // Animasyon tamamlandı
                }
            } else {
                // Geri dönüş hareketi
                const t = Math.min(elapsedTimeX / cameraAnimationDuration2, 1);
                const easeT = easeInOutSin(t);
                activeCamera.position.x = THREE.MathUtils.lerp(currentCameraX, cameraStartX, easeT);

                if (t === 1) {
                    cameraAnimationStartTimeX = null; // Animasyon tamamlandı
                }
            }
        }
    }
}

function setCameraComposer() {
    const activeCamera = scene.userData.activeCamera;
    if (activeCamera) {
        composer.passes[0].camera = activeCamera;
    }
}

function easeInOutSin(t) {
    return 0.5*(1 - Math.cos(Math.PI * t));
}

//############################################################################################################
//####  MAIN FUNCTION  #######################################################################################
//############################################################################################################

function animate() {
    const time = performance.now();
    const deltaTime = (time - lastTime) / 1000; // Convert to seconds
    lastTime = time;
    // Step the physics world
    world.step(fixedTimeStep, deltaTime, maxSubSteps);
    stats.begin();
    try {

        updateVehicleControls();
        updateCamera();

        const chassisBody = vehicle.chassisBody;
        chassisBody.threemesh.position.copy(new THREE.Vector3(chassisBody.position.x, chassisBody.position.y - (carSize.y)/2, chassisBody.position.z));
        chassisBody.threemesh.quaternion.copy(chassisBody.quaternion);

        const velocity = vehicle.chassisBody.velocity.length();
        console.log(velocity);
        console.log(currentEngineForce);
        if (velocity > 0 && velocity < 0.2 && !isMovingForward && !isMovingBackward) {
            // Eğer araba duruyorsa idle pozisyonuna geç
            if (!isStopped) {
                isStopped = true;
                cameraAnimationStartTime = performance.now();
                currentCameraZ = scene.userData.activeCamera.position.z; // Mevcut pozisyonu kaydet
            }
        } else {
            isStopped = false; // Araba hareket ediyorsa idle durumdan çık
        }
        const activeCamera=scene.userData.activeCamera;
        const lookAtTarget = new THREE.Vector3(chassisBody.position.x, chassisBody.position.y+0.9, chassisBody.position.z);
        activeCamera.lookAt(lookAtTarget);
        composer.render();
    }
    catch (e) {
    }

    stats.end();
    requestAnimationFrame(animate);
}

function main() {
    init();
    setCannonWorld();
    loadMap(scene);
    loadHDR(scene, renderer);
    loadSportCar(scene).then(setCameraComposer).then(createVehicle);
    animate();
}

main();