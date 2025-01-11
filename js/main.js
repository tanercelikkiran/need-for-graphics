import {
    loadMap,
    loadHDR,
    carMesh,
    wheelMeshes,
    loadPorsche,
    loadBMW,
    loadJeep,
    loadBike,
    loadBMWintro,
    createCustomPhongMaterial,
    createFogMaterial
} from './loaders.js';


import * as THREE from "three";
import * as CANNON from "cannon-es";
import CannonDebugger from "cannon-es-debugger";

import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import Stats from 'three/addons/libs/stats.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {metallicPaint} from "./material-properties.js";
import {DepthTexture} from "three";

export let scene, sceneIntro, renderer, composer, stats;
export let world, cannonDebugger, vehicle, carSize, isBraking;

let motionBlurPass;
let xMaterial;

const motionBlurShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'tDepth': { value: null },
        'delta': { value: 0.5 },
        'velocityFactor': { value: 1.0 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform sampler2D tDepth;
        uniform float delta;
        uniform float velocityFactor;
        varying vec2 vUv;
        void main() {
            vec4 color = texture2D(tDiffuse, vUv);
            float depth = texture2D(tDepth, vUv).r;
            vec2 velocity = vec2(velocityFactor * delta * depth); // Basit velocity
            vec4 blur = texture2D(tDiffuse, vUv + velocity);
            gl_FragColor = mix(color, blur, delta);
        }
    `
};

// ================================================
// 1) ARACIN GİRİŞ / DURUM FLAGLERİ
// ================================================
let isAccelerating   = false;
isBraking        = false;
let isSteeringLeft   = false;
let isSteeringRight  = false;
let isHandBraking    = false;

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
let brakingCameraZ          = 5.3;   // Closer view during braking
let rearingCameraZ          = 5.8;
let backingCameraZ          = 6.8;
let speedFactor             = 0.03;  // Faster camera zooming
let cameraBackZ             = 6.0;   // Slightly forward position on stop
let cameraAnimationDuration3 = 1500; // Faster animations
let cameraAnimationDuration2 = 500;
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
let nameCameraBool                  = false;
let cameraLookAtStart = new THREE.Vector3(); // Başlangıç bakış noktası
let cameraLookAtEnd = new THREE.Vector3();   // Hedef bakış noktası
let cameraLookAtStartTime = null;            // Animasyon başlangıç zamanı
const cameraLookAtDuration = 3000;
const cameraLookAtDuration2 = 6000;
let startQuaternion = new THREE.Quaternion(); // Başlangıç dönüşü
let endQuaternion = new THREE.Quaternion();

// ================================================
// 9) KAMERA POZİSYONLARI - YATAY HAREKET
// ================================================
let isMovingLeft             = false;
let isMovingRight            = false;
let cameraStartX             = 0;
let cameraLeftTargetX        = -1.2; // Wider camera movement for dramatic effect
let cameraRightTargetX       = 1.2;
let cameraAnimationStartTimeX = null;
let cameraAnimationStartTimeC = null;
let currentCameraX           = cameraStartX;
let cameraStartY= 2.0;
let currentCameraY           = cameraStartY;

// ================================================
// 10) TOP SPEED VE İVMELENME AYARLARI
// ================================================
let maxSpeed = 304 / 3.6; // Maksimum hız (304 km/h -> m/s)
let rearMaxSpeed = 70 / 3.6;
let engineDropFactor = 0.7;

// ================================================
// 11) TURBO GO VROOOOOOOOM
// ================================================

let turboLevel = 10000; // Nitro'nun başlangıç değeri
let isTurboActive = false; // Nitro kullanım durumu
const turboDecayRate = 100 / (5 * 60);
let turboVroom= false;
let startTurboTime = null;

let orbitControls;

const fixedTimeStep = 1 / 60; // Fixed time step of 60 Hz
const maxSubSteps = 10;       // Maximum number of sub-steps to catch up with the wall clock
let lastTime = performance.now();


let selectedCarNo = 0;

let porscheMass = 900;
let porscheWheelOptions = {
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

let bmwMass = 1100;
let bmwWheelOptions = {
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

let jeepMass = 1700;
let jeepWheelOptions = {
    mass: 15,
    radius: 0.7,
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

let sunLight;
let hemisphereLight;
function addLights(scene) {
    // Ambient Light (genel yumuşak aydınlatma)

    // Directional Light (güneş ışığı etkisi)
    sunLight = new THREE.DirectionalLight(0xffffff, 0.5);
    sunLight.position.set(1000, 2000, 1000); // Güneşin pozisyonu (X, Y, Z)
    sunLight.castShadow = true;

    // Gölgelerin çözünürlüğü ve sınırları
    sunLight.shadow.mapSize.width = 2048; // Genişlik
    sunLight.shadow.mapSize.height = 2048; // Yükseklik
    sunLight.shadow.camera.near = 0.05; // En yakın mesafe
    sunLight.shadow.camera.far = 3000; // En uzak mesafe

    // Gölgeler için kamera sınırları (örneğin yer seviyesinde)
    sunLight.shadow.camera.left = -300;
    sunLight.shadow.camera.right = 300;
    sunLight.shadow.camera.top = 300;
    sunLight.shadow.camera.bottom = -300;

    sunLight.shadow.bias = -0.0001;
    sunLight.shadow.radius = 2;

    scene.add(sunLight);

    // Hemisphere Light (gökyüzü ve zemin etkisi)
    hemisphereLight = new THREE.HemisphereLight(0xaaaaaa, 0x444444, 0.4);
    hemisphereLight.position.set(0, 50, 0);
    scene.add(hemisphereLight);


}
function init() {
    scene = new THREE.Scene();

    addLights(scene);

    renderer = new THREE.WebGLRenderer({antialias: false});
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);// HDR renk kodlaması
    renderer.toneMapping = THREE.ReinhardToneMapping; // Tonemapping
    renderer.toneMappingExposure = 1.2; // Tonemapping parlaklık ayarı
    renderer.shadowMap.enabled = true; // Gölge haritalarını etkinleştir
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    const renderScene = new RenderPass(scene, null);
    composer = new EffectComposer(renderer);
    composer.addPass(renderScene);

    const fxaaPass = new ShaderPass(FXAAShader);
    fxaaPass.uniforms['resolution'].value.set(1 / window.innerWidth, 1 / window.innerHeight);
    composer.addPass(fxaaPass);

    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.4,
        1,
        0.2
    );
    composer.addPass(bloomPass);

//     const skyGeo = new THREE.SphereGeometry(500, 32, 32);
//     skyGeo.scale(-1, 1, 1); // flip faces inward if needed
//
// // 2) Use the SAME FogMaterial you used for objects
// // or you can modify it if you want a different effect
//     const skyFogMaterial = createFogMaterial(null);
// // You might skip the texture and just set a baseColor in the shader.
//
//     const skyMesh = new THREE.Mesh(skyGeo, skyFogMaterial);
//     scene.add(skyMesh);

    motionBlurPass = new ShaderPass(motionBlurShader);
    motionBlurPass.uniforms['delta'].value = 200; // Blur miktarı
    motionBlurPass.uniforms['velocityFactor'].value = 15; // Hız ile artan blur
    composer.renderTarget1.depthTexture = new DepthTexture();
    composer.renderTarget2.depthTexture = new DepthTexture();
    composer.addPass(motionBlurPass);
    motionBlurPass.enabled = false;

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

function createOrbitControls() {
    if (scene.userData.activeCamera) {
        orbitControls = new OrbitControls(scene.userData.activeCamera, renderer.domElement);
        orbitControls.enabled = false; // Varsayılan olarak kapalı
    }
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

function createColliders(){
    scene.traverse(function(child){
        if (child.isMesh && child.name.includes("Collider")){
            child.visible = false;
            const halfExtents = new CANNON.Vec3(child.scale.x, child.scale.y, child.scale.z);
            const box = new CANNON.Box(halfExtents);
            const body = new CANNON.Body({mass:0});
            body.addShape(box);
            body.position.copy(child.position);
            body.quaternion.copy(child.quaternion);
            world.addBody(body);
        }
    });
}

function getUpAxis(body) {
    const localUp = new CANNON.Vec3(0, 1, 0); // Local up in body space
    let worldUp = new CANNON.Vec3(); // Placeholder for world up

    body.quaternion.vmult(localUp, worldUp); // Transform local up to world space
    console.log(worldUp);

    return worldUp; // This is the normalized up axis
}

function createVehicle() {

    let vehicleMass = 0;
    let wheelOptions = {};

    switch (selectedCarNo) {
        case 0:
            vehicleMass = porscheMass;
            wheelOptions = porscheWheelOptions;
            break;
        case 1:
            vehicleMass = bmwMass;
            wheelOptions = bmwWheelOptions;
            break;
        case 2:
            vehicleMass = jeepMass;
            wheelOptions = jeepWheelOptions;
            break;
    }

    carSize = new THREE.Vector3();
    const boundingBox = new THREE.Box3().setFromObject(carMesh);
    boundingBox.getSize(carSize);

    const chassisShape = new CANNON.Box(new CANNON.Vec3(carSize.x / 2, (carSize.y / 2) - 0.1, carSize.z / 2));
    const chassisBody = new CANNON.Body({
        mass: vehicleMass,
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
            -maxEngineForce*1
        )
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
    if (isBraking>0) {
        if (speed >= rearMaxSpeed) {
            currentEngineForce = 0;
        } else {
            const speedRatio = speed / rearMaxSpeed;
            const effectiveEngineForce = maxEngineForce * (1 - speedRatio * engineDropFactor);
            currentEngineForce = Math.min(currentEngineForce, effectiveEngineForce);
        }
    }else {
        if (speed >= maxSpeed) {
            currentEngineForce = 0;
        } else {
            const speedRatio = speed / maxSpeed;
            const effectiveEngineForce = maxEngineForce * (1 - speedRatio * engineDropFactor);
            currentEngineForce = Math.min(currentEngineForce, effectiveEngineForce);
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

document.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'shift' && turboLevel > 0) {
        isTurboActive = true;
    }
});

document.addEventListener('keyup', (event) => {
    if (event.key.toLowerCase() === 'shift') {
        isTurboActive = false;
    }
});

// document.addEventListener('keydown', (event) => {
//     if (event.key.toLowerCase() === 'k') {
//         motionBlurPass.enabled = !motionBlurPass.enabled;
//     }
// });

let turboBaseForce = maxEngineForce; // Nitro yokken motor gücü

function updateTurbo(deltaTime) {
    if (isTurboActive && turboLevel > 0 && isAccelerating) {
        turboVroom=true;
        maxEngineForce = turboBaseForce * 1.5;
        turboLevel -= turboDecayRate * deltaTime * 60; // Her karede nitro seviyesi azalır
        if (turboLevel <= 0) {
            turboLevel = 0;
            isTurboActive = false; // Turbo sıfırlandığında devre dışı
            turboVroom=false;
        }
    } else {
        maxEngineForce = turboBaseForce; // Nitro aktif değilse motor gücü varsayılana döner
        turboVroom=false;
    }
}

function updateCamera() {
    document.addEventListener('keydown', (event) => {
        const activeCamera = scene.userData.activeCamera;
        if (activeCamera) {
            switch (event.key.toLowerCase()) {
                case 'w':
                    if (!isMovingForward) {
                        currentCameraZ = activeCamera.position.z; // Mevcut pozisyonu kaydet
                        currentCameraY = activeCamera.position.y;
                        isMovingForward = true;
                        isBrakingCamera = false;
                        isMovingBackward = false;
                        isMovingToIdle = false;
                        isBackingMorvard = false;
                        cameraAnimationStartTime = performance.now(); // Animasyonun başlangıç zamanı
                    }
                    break;
                case 's':
                    if (!isBrakingCamera) {
                        currentCameraZ = activeCamera.position.z;
                        currentCameraY = activeCamera.position.y;
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
                case 'n':
                    if (!nameCameraBool){
                        currentCameraX = activeCamera.position.x;
                        currentCameraY = activeCamera.position.y;
                        currentCameraZ = activeCamera.position.z;
                        carMesh.remove(activeCamera); // Arabadan çıkar
                        scene.add(activeCamera);      // Sahneye ekle
                        orbitControls.enabled = false; // OrbitControls'u devre dışı bırak
                        nameCameraBool=true;
                        cameraLookAtStart.copy(activeCamera.position.clone().add(activeCamera.getWorldDirection(new THREE.Vector3())));
                        cameraLookAtEnd.set(60, 0, 130); // Hedef nokta
                        startQuaternion.copy(activeCamera.quaternion); // Mevcut dönüş
                        activeCamera.lookAt(cameraLookAtEnd);          // Hedefe bak
                        endQuaternion.copy(activeCamera.quaternion);   // Hedef dönüş
                        activeCamera.quaternion.copy(startQuaternion);
                        cameraLookAtStartTime = performance.now();
                        cameraAnimationStartTimeC = performance.now();
                    }else{
                        currentCameraX = activeCamera.position.x;
                        currentCameraY = activeCamera.position.y;
                        currentCameraZ = activeCamera.position.z;

                        scene.remove(activeCamera); // Sahneden çıkar
                        carMesh.add(activeCamera); // Arabaya ekle
                        nameCameraBool=false;
                        cameraAnimationStartTimeC = performance.now();
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
                    currentCameraY = activeCamera.position.y;
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
                    currentCameraY = activeCamera.position.y;
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

        if (activeCamera && orbitControls.enabled===false && nameCameraBool===false) {
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
                    let turboEffect = 0; // Başlangıç değeri
                    if (turboVroom) {
                        if (startTurboTime === null) {
                            startTurboTime = performance.now(); // Turbo başladığında zamanı kaydet
                        }
                        const turboElapsed = Math.min((performance.now() - startTurboTime) / 5000, 1); // 2 saniyede maksimuma ulaş
                        turboEffect = THREE.MathUtils.lerp(0.8, 2.4, turboElapsed); // 1'den 3'e doğru artış
                    } else {
                        startTurboTime = null; // Turbo durduğunda sıfırla
                    }

                    cameraTargetZ = THREE.MathUtils.clamp(
                        maxCameraTargetZ - velocity * speedFactor + turboEffect, // turboEffect burada ekleniyor
                        minCameraTargetZ,
                        maxCameraTargetZ + 3 // Turbo etkisiyle maksimum değer biraz artırıldı
                    );

                    if (elapsedTime >= cameraAnimationDuration3) {
                        // Animasyon tamamlandıktan sonra da hıza bağlı güncelleme
                        activeCamera.position.y = THREE.MathUtils.lerp(activeCamera.position.y, cameraStartY, 0.5);
                        activeCamera.position.z = THREE.MathUtils.lerp(
                            activeCamera.position.z,
                            cameraTargetZ,
                            0.1 // Daha yumuşak bir geçiş için sabit bir katsayı
                        );
                    } else {
                        // Animasyon sırasında
                        const t = Math.min(elapsedTime / cameraAnimationDuration3, 1);
                        const easeT = easeInOutSin(t);
                        activeCamera.position.y = THREE.MathUtils.lerp(currentCameraY, cameraStartY, easeT);
                        activeCamera.position.z = THREE.MathUtils.lerp(currentCameraZ, cameraTargetZ, easeT);
                    }
                } catch (e) {
                    console.error("Kamera hıza göre güncellenemedi:", e);
                }
            } else if (isBrakingCamera) {
                try {
                    if (isBrakingPhase===0) {
                        const t = Math.min(elapsedTime / cameraAnimationDuration1, 1);
                        const easeT = easeInOutSin(t);
                        activeCamera.position.y = THREE.MathUtils.lerp(currentCameraY, cameraStartY, easeT);
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

        if (activeCamera && orbitControls.enabled===false && nameCameraBool===false) {
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
    if (cameraAnimationStartTimeC!== null && nameCameraBool){
        const elapsedTimeC=currentTime-cameraAnimationStartTimeC;
        const activeCamera = scene.userData.activeCamera;

        if (activeCamera){
            const t = Math.min(elapsedTimeC / 3000, 1); // 1 saniyelik animasyon
            const easeT = easeInOutSin(t);

            // Hedef pozisyon ve rotasyon
            const targetPosition = new THREE.Vector3(60, 60, 40);

            // Pozisyonu ve rotasyonu hesapla
            activeCamera.position.lerpVectors(
                new THREE.Vector3(currentCameraX, currentCameraY, currentCameraZ),
                targetPosition,
                easeT
            );


            // Animasyonu sonlandır
            if (t === 1) {
                cameraAnimationStartTimeC = null;
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

let usePhong = false;

window.addEventListener('keydown', (e) => {
    if (e.key === 'k' || e.key === 'K') {
        usePhong = !usePhong;
        switchMaterials(usePhong);
    }
});


function switchMaterials(usePhong) {
    scene.traverse((child) => {
        if (child.isMesh && child.material && child.material.uniforms && (child.material.uniforms.uDiffuseMap ||  child.material.uniforms.diffuseMap)) {
            const texture = child.material.uniforms.uDiffuseMap.value;
            child.material.side = THREE.DoubleSide;
            if (usePhong) {
                // child.material = createCustomPhongMaterial(texture);
                const fragmentShader = `
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
`;
                const vertexShader = `precision highp float;

// Matrices
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 lightViewMatrix;       // Light's view matrix
uniform mat4 lightProjectionMatrix; // Light's projection matrix

in vec3 position;
in vec3 normal;
in vec2 uv;

out vec3 vWorldPos;       // Pass world position to fragment
out vec3 vWorldNormal;    // Pass normal in world space
out vec2 vUV;             // Pass UV
out vec4 vShadowCoord;    // Light's clip space position

void main() {
    // Compute world-space position
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos     = worldPos.xyz;

    // For correct lighting, transform normal by normalMatrix if needed.
    // For simplicity, assume no non-uniform scale. If you do, pass
    // a normalMatrix = inverseTranspose(modelMatrix) as uniform.
    vec3 worldNormal = mat3(modelMatrix) * normal;
    vWorldNormal     = normalize(worldNormal);

    // Pass UV
    vUV = uv;

    // Calculate shadow coordinate (light clip space)
    // 1) transform to light view space
    vec4 lightViewPos = lightViewMatrix * worldPos;
    // 2) transform to light projection space
    vShadowCoord = lightProjectionMatrix * lightViewPos;

    // Standard camera clip-space position
    gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;
                function createCustomShadowMaterial(diffuseTexture) {
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
                        vertexShader:   vertexShader,
                        fragmentShader: fragmentShader,
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
                xMaterial = createCustomShadowMaterial(texture)
                child.castShadow = true;
                child.receiveShadow = true;
                child.material = xMaterial;

            } else {
                renderer.toneMappingExposure = 0.2;
                child.material = createFogMaterial(texture);
            }
        }
    });
}


//############################################################################################################
//####  MAIN FUNCTION  #######################################################################################
//############################################################################################################

function animate() {
    cannonDebugger.update();
    const time = performance.now();
    const deltaTime = (time - lastTime) / 1000; // Convert to seconds
    lastTime = time;
    // Step the physics world
    world.step(fixedTimeStep, deltaTime, maxSubSteps);
    stats.begin();
    try {
        updateTurbo(deltaTime);
        updateVehicleControls();
        updateCamera();
        console.log(turboLevel);

        const chassisBody = vehicle.chassisBody;
        let worldUp = getUpAxis(chassisBody);
        chassisBody.threemesh.position.copy(new THREE.Vector3(chassisBody.position.x - worldUp.x/1.5, chassisBody.position.y - worldUp.y/1.5, chassisBody.position.z - worldUp.z/1.5));
        chassisBody.threemesh.quaternion.copy(chassisBody.quaternion);

        const velocity = vehicle.chassisBody.velocity;
        const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
        motionBlurPass.uniforms['velocityFactor'].value = speed*100;
        console.log(motionBlurPass.uniforms['tDiffuse'].value);
        if (velocity.length() > 0 && velocity.length() < 0.2 && !isMovingForward && !isMovingBackward) {
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
        if (nameCameraBool) {
            if (cameraLookAtStartTime !== null) {
                const elapsedTime = performance.now() - cameraLookAtStartTime;
                const t = Math.min(elapsedTime / cameraLookAtDuration, 1); // 0 ile 1 arasında interpolasyon oranı
                const elapsedTime2 = performance.now() - cameraLookAtStartTime;
                const t2 = Math.min(elapsedTime2 / cameraLookAtDuration2, 1);

                // Hedef bakış noktasını interpolasyonla güncelle
                const interpolatedLookAt = new THREE.Vector3().lerpVectors(cameraLookAtStart, cameraLookAtEnd, t);

                // Kameranın mevcut pozisyonu sabit kalıyor
                const cameraPosition = activeCamera.position.clone();

                // Kameranın hedef yönünü hesapla
                const targetDirection = new THREE.Vector3().subVectors(interpolatedLookAt, cameraPosition).normalize();

                // Kameranın quaternion dönüşünü hesapla
                const quaternion = new THREE.Quaternion().setFromUnitVectors(
                    activeCamera.getWorldDirection(new THREE.Vector3()).normalize(),
                    targetDirection
                );

                // Kameranın dönüşünü yumuşakça güncelle
                activeCamera.quaternion.slerp(quaternion, t2);

                // Animasyon tamamlandıysa sıfırla
                if (t === 1) {
                    cameraLookAtStartTime = null; // Animasyon tamamlandı
                }
            }
        } else {
            const lookAtTarget = new THREE.Vector3(chassisBody.position.x, chassisBody.position.y + 0.9, chassisBody.position.z);
            activeCamera.lookAt(lookAtTarget); // Arabaya bak
        }
        composer.render();
    }
    catch (e) {
    }

    stats.end();
    requestAnimationFrame(animate);
}

document.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'o') {
        const activeCamera = scene.userData.activeCamera;
        if (activeCamera) {
            orbitControls.enabled = !orbitControls.enabled;
            if (orbitControls.enabled) {
                console.log("OrbitControls etkinleştirildi.");
            } else {
                console.log("OrbitControls devre dışı bırakıldı.");
            }
        }
    }
});


function initIntro() {
    sceneIntro = new THREE.Scene();

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    try {
        loadBMWintro(sceneIntro);
    } catch (error) {
        console.error("Model yükleme sırasında hata oluştu:", error);
    }

    const spotLight = new THREE.SpotLight(0xffffff, 250);
    const lightTarget = new THREE.Object3D();
    lightTarget.position.set(0, 1, 0); // Işığın hedef noktası
    sceneIntro.add(lightTarget);
    spotLight.target = lightTarget;
    sceneIntro.add(spotLight);

    // Küresel koordinatlar
    let radius = 10; // Küre yarıçapı
    let theta = 3*Math.PI / 4; // Yatay açı
    let phi = Math.PI / 4; // Dikey açı

    spotLight.position.x = lightTarget.position.x + radius * Math.sin(phi) * Math.cos(theta);
    spotLight.position.y = lightTarget.position.y + radius * Math.cos(phi);
    spotLight.position.z = lightTarget.position.z + radius * Math.sin(phi) * Math.sin(theta);

    spotLight.target.updateMatrixWorld();

    // Kamerayı ekleyin
    const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(-5, 3, 0);
    camera.lookAt(0, 200, 0);
    sceneIntro.userData.activeCamera = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableZoom = false;

    document.addEventListener('keydown', (event) => {
        const key = event.key.toLowerCase();
        const step = Math.PI / 60; // Açı artışı/düşüşü
        const radiusStep = 0.3;
        const intensityStep=20;

        switch (key) {
            case 'arrowup':
                phi = Math.max(0.1, phi - step); // Yukarı basınca (phi değerini azalt, 0.1'in altına düşmesin)
                break;
            case 'arrowdown':
                phi = Math.min(Math.PI - 0.1, phi + step); // Aşağı basınca (phi değerini artır, π'nin üstüne çıkmasın)
                break;
            case 'arrowleft':
                theta += step; // Sola basınca (theta değerini azalt)
                break;
            case 'arrowright':
                theta -= step; // Sağa basınca (theta değerini artır)
                break;
            case 'y': // Kamera merkeze yaklaşır
                radius = Math.max(2.4, radius - radiusStep); // Minimum radius 2
                break;
            case 'u': // Kamera merkezden uzaklaşır
                radius = Math.min(50, radius + radiusStep); // Maksimum radius 50
                break;
            case 'g': // Parlaklığı artırır
                spotLight.intensity = Math.min(1000, spotLight.intensity + intensityStep); // Maksimum 10
                break;
            case 'h': // Parlaklığı azaltır
                spotLight.intensity = Math.max(10, spotLight.intensity - intensityStep); // Minimum 0
                break;
        }

        // Spot ışığın pozisyonunu küresel koordinatlara göre hesapla
        spotLight.position.x = lightTarget.position.x + radius * Math.sin(phi) * Math.cos(theta);
        spotLight.position.y = lightTarget.position.y + radius * Math.cos(phi);
        spotLight.position.z = lightTarget.position.z + radius * Math.sin(phi) * Math.sin(theta);

        // Işığın hedefe bakmasını sağla
        spotLight.target.updateMatrixWorld();
    });

    function animateIntro() {
        controls.update();
        renderer.render(sceneIntro, camera);
        requestAnimationFrame(animateIntro);
    }

    animateIntro();

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            // Kaynakları temizleme
            sceneIntro.traverse((object) => {
                if (object.isMesh) {
                    object.geometry.dispose();
                    if (object.material.isMaterial) {
                        object.material.dispose();
                    } else {
                        // Çoklu materyal durumu için
                        object.material.forEach(material => material.dispose());
                    }
                }
            });

            renderer.dispose(); // Renderer'ı temizle
            document.body.removeChild(renderer.domElement); // Renderer öğesini DOM'dan kaldır

            // Diğer sahne temizlemeleri
            sceneIntro.clear(); // Sahneyi temizle

            document.removeEventListener('keydown', this);
            main(); // Ana sahneyi başlat
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key.toLowerCase() === 'm') {
            // `sceneIntro` sahnesindeki tüm nesneleri dolaş
            sceneIntro.traverse((object) => {
                if (object.isMesh && object.material) {
                    if (object.material.name === 'BMW:carpaint1') {
                        // Materyalin rengini değiştir
                        const randomColor = Math.random() * 0xffffff; // Rastgele renk
                        metallicPaint(object.material, randomColor);

                    }
                }
            });
        }
    });
}

function main() {
    init();
    setCannonWorld();
    loadMap(scene).then(createColliders);
    loadHDR(scene, renderer);
    //loadPorsche(scene).then(setCameraComposer).then(createVehicle);
    loadBMW(scene).then(setCameraComposer).then(createVehicle).then(createOrbitControls);
    //loadJeep(scene).then(setCameraComposer).then(createVehicle);
    animate();
}

initIntro();
// main();