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

// -----------------------------
// Değişkenler
// -----------------------------
let isAccelerating = false;
let isBraking      = false;
let isSteeringLeft = false;
let isSteeringRight= false;

// Aracın motor ve direksiyon durumu
let currentEngineForce = 0;
let currentSteering    = 0;

// TEMEL AYARLAR
const maxEngineForce = 3000;
const engineRamp     = 100;  // Gaz veriş/çekiş ramp hızı
const brakeForce     = 50;   // Fren gücü

// DIREKSIYON / DAMPING
const maxSteerVal  = Math.PI / 5;  // ~36 derece (baz limit)
const steerSpeed   = 0.03;         // Direksiyonun dönüş hızı
const steerDamping = 0.03;         // Direksiyonu bırakınca ortalama sertliği

// HIZ BAZLI STEERING AYARLARI
const speedLimit         = 55;       // (m/s) Bu hızı geçince direksiyon iyice azalır (~198 km/h)
const minSteerFactor     = 0.15;     // Çok yüksek hızda direksiyon, normalin %15’ine kadar düşebilir
const mediumSpeed        = 20;       // 20 m/s (~72 km/h) altı -> Tam direksiyon
const mediumSteerFactor  = 1.0;      // Bu hızın altında tam direksiyon
// Non-linear formül için bir sabit
// (bu sayede hız arttıkça direksiyon, "dairesel" oranda azalır)
const steerFalloff = 0.0015;  // Deneme yanılma ile ayarlanır

// Fren anında direksiyonun ekstra sertleşmesi
const brakeSteerMultiplier = 0.6;  // Frenliyorken max direksiyon açısını biraz kıs

let isHandBraking = false;

const handbrakeForce = 100;   // El freninin fren kuvveti
const driftSlip     = 1.0;    // Drift için düşük sürtünme (örn. 1.0 normalden daha kaygan)
const normalSlip    = 5.0;    // Normal lastik frictionSlip (varsayım)

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
    if (isBraking && currentEngineForce > 0) {
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
    // 6) Araca Uygula
    //---------------------------
    // Frenleri sıfırla
    vehicle.setBrake(0, 0);
    vehicle.setBrake(0, 1);
    vehicle.setBrake(0, 2); // Arka sol
    vehicle.setBrake(0, 3); // Arka sağ
    // (dört tekerleğe fren yapmak istiyorsan 2 ve 3. index'e de setBrake uygula)

    // 3) Normal fren (ör. S tuşu) varsa ön tekerleklere uygula
    if (brakingValue > 0) {
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

//############################################################################################################
//####  MAIN FUNCTION  #######################################################################################
//############################################################################################################

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

        updateVehicleControls();

        const chassisBody = vehicle.chassisBody;
        chassisBody.threemesh.position.copy(new THREE.Vector3(chassisBody.position.x, chassisBody.position.y - (carSize.y)/2, chassisBody.position.z));
        chassisBody.threemesh.quaternion.copy(chassisBody.quaternion);

        stats.begin();
        const activeCamera = scene.userData.activeCamera;
        if (activeCamera) {
            composer.passes[0].camera = activeCamera;
            composer.render();
        }
        cannonDebugger.update();
        stats.end();
    }
    catch (e) {
    }

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
        }
    }).then(() => {
        createVehicle();
    })

    loadHDR(scene, renderer);
    animate();
}

main();