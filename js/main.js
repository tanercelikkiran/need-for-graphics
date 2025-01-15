import {
    loadMap,
    loadHDR,
    carMesh,
    wheelMeshes,
    loadPorsche,
    loadBMW,
    loadJeep,
    loadBMWintro,
    loadPorscheIntro,
    loadJeepIntro,
    manager,
    bmwAcc,
    porscheAcc,
    jeepAcc,
    loadSounds,
    bmwEngine,
    porscheEngine,
    jeepEngine,
    slide,
    turboSound,
    loadHDRsunset, loadHDRnight
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

export let scene, sceneIntro, renderer, composer, stats,carColor;
export let world, cannonDebugger, vehicle, carSize, isBraking, isTurboActive;

let motionBlurPass;

carColor= 0x5C0007;

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

let isSandbox=false;

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
let steerSpeed   = 0.01;         // Reduced steering speed (slower turns)
let steerDamping = 0.1;         // Increased damping (slower return to center)
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

let turboLevel = 100; // Nitro'nun başlangıç değeri
isTurboActive = false; // Nitro kullanım durumu
const turboDecayRate = 100 / (5 * 60);
let turboVroom= false;
let startTurboTime = null;
let score=0;

let orbitControls;

let hdriChange=0;

const startMenu = document.getElementById('start-menu');
const loadingScreen = document.getElementById('loading-screen');

const fixedTimeStep = 1 / 60; // Fixed time step of 60 Hz
const maxSubSteps = 10;       // Maximum number of sub-steps to catch up with the wall clock
let lastTime = performance.now();

let elapsedTime = 0;
let gameStarted=false;
const totalTime = 600;
let remainingTime=totalTime;
let scoreTime=600;
let gameOver=false;

export let selectedCarNo = 0;

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
    suspensionStiffness: 50,
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
    radius: 0.42,
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


function addLights(scene) {
    // Ambient Light (genel yumuşak aydınlatma)

    // Directional Light (güneş ışığı etkisi)
    const sunLight = new THREE.DirectionalLight(0xffffff, 0.5);
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
    const hemisphereLight = new THREE.HemisphereLight(0xaaaaaa, 0x444444, 0.4);
    hemisphereLight.position.set(0, 50, 0);
    scene.add(hemisphereLight);
}
function init() {
    scene = new THREE.Scene();

    addLights(scene);

    loadSounds(scene);

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
        0.8,
        0.4,
        0.2
    );
    composer.addPass(bloomPass);

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

const groundMaterial = new CANNON.Material("groundMaterial");
const bodyMaterial = new CANNON.Material("bodyMaterial");
const wheelMaterial = new CANNON.Material("wheelMaterial");
const colliderMaterial = new CANNON.Material("colliderMaterial");

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

// Create the ground plane
    const groundBody = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: new CANNON.Plane(),
    });
    groundBody.material = groundMaterial;
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // Rotate plane to be horizontal\
    groundBody.aabbNeedsUpdate = true;
    world.addBody(groundBody);

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
        // if (child.name.includes("Colliding")) {
        //     console.log(`Creating collider for: ${child.name}`); // Sorun gidermek için log ekleyin
        //
        //     // Mesh'in bounding box'ını hesaplayarak doğru boyutlandırma yapıyoruz
        //     const boundingBox = new THREE.Box3().setFromObject(child);
        //     const size = new THREE.Vector3();
        //     boundingBox.getSize(size); // x, y, z boyutlarını al
        //
        //     // Eğer boyutlar sıfırsa, uyarı ver ve bu objeyi atla
        //     if (size.x === 0 || size.y === 0 || size.z === 0) {
        //         console.warn(`Skipping ${child.name}: Invalid size`, size);
        //         return;
        //     }
        //
        //     // Cannon.js gövdesi için boyutlandırma
        //     const halfExtents = new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2);
        //     const box = new CANNON.Box(halfExtents);
        //
        //     // Dinamik gövdeyi oluştur
        //     const body = new CANNON.Body({
        //         mass: 0, // Hareket edebilmesi için kütle belirtiyoruz
        //         shape: box,
        //     });
        //
        //     // Pozisyon ve rotasyonu eşitle
        //     body.position.copy(child.position);
        //     body.quaternion.copy(child.quaternion);
        //
        //     // Cannon.js dünyasına gövdeyi ekle
        //     world.addBody(body);
        //
        //     // Gövdenin sahnedeki pozisyon ve rotasyonunu mesh'e eşitle
        //     world.addEventListener("postStep", () => {
        //         child.position.copy(body.position);
        //         child.quaternion.copy(body.quaternion);
        //     });
        //
        //     console.log(`Collider created for: ${child.name}`); // Başarı mesajı
        //     console.log(`Bounding Box for ${child.name}:`, size);
        //     console.log(`Scale for ${child.name}:`, child.scale);
        //     console.log(`Mesh Name: ${child.name}, Position: ${child.position.toArray()}`);
        //     console.log(`Mesh Name: ${child.name}, Quaternion: ${child.quaternion.toArray()}`);
        // }
    });
}

function createFrictionPairs(){
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

    const wheelColliderContactMaterial = new CANNON.ContactMaterial(
        wheelMaterial,
        colliderMaterial,
        {
            friction: 0.5,
            restitution: 0,
            contactEquationStiffness: 1000
        }
    );
    world.addContactMaterial(wheelColliderContactMaterial);
}

function getUpAxis(body) {
    const localUp = new CANNON.Vec3(0, 1, 0); // Local up in body space
    let worldUp = new CANNON.Vec3(); // Placeholder for world up

    body.quaternion.vmult(localUp, worldUp); // Transform local up to world space

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


    let chassisShape;
    if(selectedCarNo===0){
        chassisShape = new CANNON.Box(new CANNON.Vec3(carSize.x / 2, (carSize.y / 2) - 0.02, carSize.z / 2));
    }else if (selectedCarNo===1){
        chassisShape = new CANNON.Box(new CANNON.Vec3(carSize.x / 2, (carSize.y / 2) - 0.02, carSize.z / 2));
    }else if (selectedCarNo===2){
        chassisShape = new CANNON.Box(new CANNON.Vec3(carSize.x / 2, (carSize.y / 2) - 0.20, carSize.z / 2));
    }

    const chassisBody = new CANNON.Body({
        mass: vehicleMass,
    });
    let chassisOffset;
    if(selectedCarNo===0){
        chassisOffset = new CANNON.Vec3(0, 0.12, 0);
    }else if (selectedCarNo===1){
        chassisOffset = new CANNON.Vec3(0, 0.10, 0);
    }else if (selectedCarNo===2){
        chassisOffset = new CANNON.Vec3(0, 0.45, 0);
    }
    chassisBody.addShape(chassisShape,chassisOffset);
    let pos = carMesh.position.clone();
    chassisBody.position.copy(pos);
    chassisBody.angularVelocity.set(0, 0, 0); // Initial angular velocity
    chassisBody.threemesh = carMesh;
    chassisBody.material = bodyMaterial;

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
        wheelBody.material = wheelMaterial;
        world.addBody(wheelBody);
        wheelBodies.push(wheelBody);

        wheelOptions.chassisConnectionPointLocal.set(wheelCenter.x, -0.12, wheelCenter.z);

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

function playAccelerationSound(selectedCarNo) {
    if (selectedCarNo === 0 && bmwAcc) {
        bmwAcc.play();
    } else if (selectedCarNo === 1 && porscheAcc) {
        porscheAcc.play();
    } else if (selectedCarNo === 2 && jeepAcc) {
        jeepAcc.play();
    }
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
    if (steerFactor < 0.5) steerFactor = 0.5;

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
        playAccelerationSound(selectedCarNo);
        currentEngineForce = Math.min(
            currentEngineForce + engineRamp,
            maxEngineForce
        );
    } else if (isBraking) {
        // Geri vitese mi alsın yoksa fren mi yapsın?
        // Basitçe "geri" yaklaşımlardan biri:
        if (bmwAcc && bmwAcc.isPlaying) bmwAcc.stop();
        if (porscheAcc && porscheAcc.isPlaying) porscheAcc.stop();
        if (jeepAcc && jeepAcc.isPlaying) jeepAcc.stop();

        currentEngineForce = Math.max(
            currentEngineForce - engineRamp,
            -maxEngineForce*1
        )
    } else {
        // Ne gaz ne fren
        if (bmwAcc && bmwAcc.isPlaying) bmwAcc.stop();
        if (porscheAcc && porscheAcc.isPlaying) porscheAcc.stop();
        if (jeepAcc && jeepAcc.isPlaying) jeepAcc.stop();

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
        slide.play();
    } else if (isSteeringRight) {
        // Sağa doğru yavaşça art
        currentSteering = Math.max(currentSteering - steerSpeed, -effectiveMaxSteer);
        slide.play();
    } else {
        slide.stop();
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

    if (selectedCarNo===0){
        maxSpeed=243/3.6;
    }else if (selectedCarNo===1){
        maxSpeed=304/3.6;
    }else if (selectedCarNo===2){
        maxSpeed=156/3.6;
    }
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
        slide.play();
    }

    // Motor kuvveti -> genelde ön tekerler
    vehicle.applyEngineForce(currentEngineForce, 0);
    vehicle.applyEngineForce(currentEngineForce, 1);

    // Direksiyon
    vehicle.setSteeringValue(currentSteering, 0);
    vehicle.setSteeringValue(currentSteering, 1);
    if (loadingScreen.style.display === "none" && startMenu.style.display === "none") {
        updateSpeedometer();
        updateSpeedSlider();
        updateTurbometer();
        updateTurboSlider();
    }
}
function updateSpeedometer() {
    const velocity = vehicle.chassisBody.velocity;
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);  // XZ düzlemindeki hız
    const speedKmH = Math.round(speed * 3.6);  // m/s'den km/h'ye dönüşüm (3.6 ile çarp)
    const speedometerText = document.getElementById('speed-value');
    speedometerText.textContent = `Speed ${speedKmH}KM`;
}

function updateSpeedSlider() {
    const velocity = vehicle.chassisBody.velocity;
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);  // XZ düzlemindeki hız
    const sliderFill = document.getElementById('speed-slider-fill');
    const tSpeed=304/3.6;
    const fillPercentage= (speed/tSpeed)*100;
    sliderFill.style.width = `${fillPercentage}%`;
}

function updateTurbometer() {
    const turbometerText = document.getElementById('turbo-value');
    turbometerText.textContent = `Turbo ${turboLevel.toFixed(0)}%`;
}

function updateTurboSlider() {
    const turbosliderFill = document.getElementById('turbo-slider-fill');
    turbosliderFill.style.width = `${turboLevel}%`;
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

document.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'k') {
        motionBlurPass.enabled = !motionBlurPass.enabled;
    }
});

let turboBaseForce = maxEngineForce; // Nitro yokken motor gücü

function updateTurbo(deltaTime) {
    if (isTurboActive && turboLevel > 0 && isAccelerating) {
        turboVroom=true;
        turboSound.play();
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
        turboSound.stop();
        if (turboLevel < 100) {
            turboLevel += 0.01 * deltaTime * 60;
            if (turboLevel > 100) {
                turboLevel = 100;
            }
        }
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
                        cameraLookAtStart.copy(activeCamera.position.clone().add(activeCamera.getWorldDirection(new THREE.Vector3())));
                        cameraLookAtEnd.set(60, 0, 130); // Hedef nokta
                        startQuaternion.copy(activeCamera.quaternion); // Mevcut dönüş
                        activeCamera.lookAt(cameraLookAtEnd);          // Hedefe bak
                        endQuaternion.copy(activeCamera.quaternion);   // Hedef dönüş
                        activeCamera.quaternion.copy(startQuaternion);
                        cameraLookAtStartTime = performance.now();
                        cameraAnimationStartTimeC = performance.now();
                        nameCameraBool=true;
                    }else{
                        currentCameraX = activeCamera.position.x;
                        currentCameraY = activeCamera.position.y;
                        currentCameraZ = activeCamera.position.z;

                        scene.remove(activeCamera); // Sahneden çıkar
                        carMesh.add(activeCamera); // Arabaya ekle
                        cameraAnimationStartTimeC = performance.now();
                        nameCameraBool=false;
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


function updateTimer(deltaTime) {
    elapsedTime += deltaTime;
    const totalSeconds = Math.floor(elapsedTime / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const miliseconds= Math.floor(elapsedTime/10 % 100);
    document.getElementById('timer').textContent = `Time: ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(miliseconds).padStart(2, '0')}`;
}

function updateScore(deltaTime) {
    scoreTime-= deltaTime/1000;
    const velocity = vehicle.chassisBody.velocity;
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);  // XZ düzlemindeki hız
    const seconds = Math.floor(scoreTime % 600);
    score+=speed*0.000001;
    const secondssqr = Math.pow(seconds, 2)
    const finalScore=score*secondssqr;
    document.getElementById('score').textContent =`Score: ${finalScore.toFixed(0)}`;
}

function updateRemainingTime(deltaTime) {
    if (!gameOver) {
        remainingTime -= deltaTime/1000;
        if (remainingTime <= 0) {
            remainingTime = 0;
            gameOver = true;
            document.getElementById('game-over').style.display = 'flex'; // Show game over
        }
        const seconds = Math.floor(remainingTime % 600);
        const timerText = document.getElementById('time-value');
        timerText.textContent = `${String(seconds).padStart(2, '0')}`;
    }

    document.getElementById('menu-button').addEventListener('mousedown', function(event) {
        location.reload();
    });
}

// Minimap için kamera oluşturma
const minimapCamera = new THREE.OrthographicCamera(
    -50,
    50,
    50,
    -50,
    0.1,
    1000
);

// Kamerayı konumlandırma
minimapCamera.position.set(0, 200, 0);
minimapCamera.lookAt(0, 0, 0);


// Minimap renderer oluştur
const minimapRenderer = new THREE.WebGLRenderer({ antialias: false });
const minimapSize = Math.min(window.innerWidth, window.innerHeight) * 0.19;
minimapRenderer.setSize(minimapSize, minimapSize);
minimapRenderer.setClearColor(0x000000, 1);
minimapRenderer.domElement.style.position = "absolute";
minimapRenderer.domElement.style.bottom = "3%";
minimapRenderer.domElement.style.right = "3%";
minimapRenderer.domElement.style.borderRadius = "50%";
minimapRenderer.domElement.style.zindex = "1";

document.getElementById("minimap").appendChild(minimapRenderer.domElement);

function updateMinimap() {
    // Minimap kamera, aracın pozisyonunu takip eder
    const carPosition = vehicle.chassisBody.position;
    minimapCamera.position.set(carPosition.x, 100, carPosition.z);
    minimapCamera.lookAt(carPosition.x, 0, carPosition.z);

    // Minimap sahnesini render et
    minimapRenderer.render(scene, minimapCamera);
}



//############################################################################################################
//####  MAIN FUNCTION  #######################################################################################
//############################################################################################################

function animate() {
    if (gameOver){
        return;
    }
    cannonDebugger.update();

    const time = performance.now();
    const deltaTime = (time - lastTime)/1000; // Convert to seconds
    const milDeltaTime = (time - lastTime);
    lastTime = time;
    // Step the physics world
    world.step(fixedTimeStep, deltaTime, maxSubSteps);
    stats.begin();
    try {
        updateTurbo(deltaTime);
        updateVehicleControls();
        updateCamera();
        //console.log(turboLevel);
        updateMinimap();

        const chassisBody = vehicle.chassisBody;
        let worldUp = getUpAxis(chassisBody);
        chassisBody.threemesh.position.copy(new THREE.Vector3(chassisBody.position.x - worldUp.x/1.5, chassisBody.position.y - worldUp.y/1.5, chassisBody.position.z - worldUp.z/1.5));
        chassisBody.threemesh.quaternion.copy(chassisBody.quaternion);

        const velocity = vehicle.chassisBody.velocity;
        const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
        motionBlurPass.uniforms['velocityFactor'].value = speed*100;
        //console.log(motionBlurPass.uniforms['tDiffuse'].value);
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
        if (loadingScreen.style.display === "none" && startMenu.style.display === "none" && gameStarted) {
            let countdown=3;
            //countdownı buraya yapacaksın
            const countdown3 = document.getElementById('countdown');
            const countdownNumber = document.getElementById('countdown-number');
            countdown3.style.display = 'flex';

            const countdownInterval = setInterval(() => {
                if (countdown >= 0) {
                    countdownNumber.textContent = String(countdown);
                } else {
                    clearInterval(countdownInterval);
                    // Elementleri gizlemek için görünürlüğü değiştirin
                    countdown3.style.display = 'none';
                    countdownNumber.style.display = 'none';
                    document.getElementById('countdown').style.display = 'none';

                    // Fonksiyonlarınızı çağırın
                    updateTimer(milDeltaTime);
                    updateRemainingTime(milDeltaTime);
                    updateScore(milDeltaTime);
                }
                countdown--;
            }, 1000);

        }




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

const helpScreen = document.getElementById('help-screen');
const helpText = document.getElementById('help-content');
function showHelpScreen() {
    helpScreen.style.display = 'flex';
    helpText.style.display = 'flex';
}
function hideHelpScreen() {
    helpScreen.style.display = 'none';
}
document.addEventListener('keydown', (h) => {
    if (h.key.toLowerCase() === 'h') {
        if (helpScreen.style.display === 'none') {
            showHelpScreen();
        }else {
            hideHelpScreen();
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
        loadPorscheIntro(sceneIntro);
        loadJeepIntro(sceneIntro);
    } catch (error) {
        console.error("Model yükleme sırasında hata oluştu:", error);
    }


    document.getElementById("start-text-2").addEventListener("click", () => {
        selectedCarNo = (selectedCarNo+1)%3
        updateCarVisibility(); // Görünürlüğü güncelle
    });

    function updateCarVisibility() {
        let bmwModel, porscheModel,jeepModel;

        // Sahnedeki modelleri bul
        sceneIntro.traverse((child) => {
            if (child.isObject3D && child.children.length > 0) {
                if (!bmwModel && child.name.includes("BMW")) {
                    bmwModel = child;
                }
                if (!porscheModel && child.name.includes("Porsche")) {
                    porscheModel = child;
                }
                if (!jeepModel && child.name.includes("Jeep")) {
                    jeepModel = child;
                }
            }
        });

        // Görünürlüğü ayarla
        if (selectedCarNo === 0) {
            if (bmwModel) bmwModel.visible = true;
            if (porscheModel) porscheModel.visible = false;
            if (jeepModel) jeepModel.visible = false;
        } else if (selectedCarNo === 1) {
            if (bmwModel) bmwModel.visible = false;
            if (porscheModel) porscheModel.visible = true;
            if (jeepModel) jeepModel.visible = false;
        }else if (selectedCarNo === 2) {
            if (bmwModel) bmwModel.visible = false;
            if (porscheModel) porscheModel.visible = false;
            if (jeepModel) jeepModel.visible = true;
        }
    }

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
    sceneIntro.add(ambientLight);

    const spotLight = new THREE.SpotLight(0xffffff, 5000,0,Math.PI,0.5);
    const lightTarget = new THREE.Object3D();
    lightTarget.position.set(0, 1, 0); // Işığın hedef noktası
    sceneIntro.add(lightTarget);
    spotLight.target = lightTarget;
    sceneIntro.add(spotLight);

    // Küresel koordinatlar
    let radius = 40; // Küre yarıçapı
    let theta = Math.PI/2; // Yatay açı
    let phi = Math.PI / 4; // Dikey açı

    spotLight.position.x = lightTarget.position.x + radius * Math.sin(phi) * Math.cos(theta);
    spotLight.position.y = lightTarget.position.y + radius * Math.cos(phi);
    spotLight.position.z = lightTarget.position.z + radius * Math.sin(phi) * Math.sin(theta);

    spotLight.target.updateMatrixWorld();

    // Kamerayı ekleyin
    const camera = new THREE.PerspectiveCamera(12, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0.55, 0.30, -21);
    camera.lookAt(0, 200, 0);
    sceneIntro.userData.activeCamera = camera;

    const renderScene = new RenderPass(sceneIntro, camera);
    const introComposer = new EffectComposer(renderer);
    introComposer.addPass(renderScene);

    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.8, // strength
        0.4, // radius
        0.2  // threshold
    );
    introComposer.addPass(bloomPass);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    // controls.enableZoom = false;

    document.addEventListener('keydown', (event) => {
        const key = event.key.toLowerCase();
        const step = Math.PI / 60; // Açı artışı/düşüşü
        const radiusStep = 1.2;
        const intensityStep=400;

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
                radius = Math.max(9.6, radius - radiusStep); // Minimum radius 2
                break;
            case 'u': // Kamera merkezden uzaklaşır
                radius = Math.min(200, radius + radiusStep); // Maksimum radius 50
                break;
            case 'g': // Parlaklığı artırır
                spotLight.intensity = Math.min(20000, spotLight.intensity + intensityStep); // Maksimum 10
                break;
            case 'h': // Parlaklığı azaltır
                spotLight.intensity = Math.max(400, spotLight.intensity - intensityStep); // Minimum 0
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
        introComposer.render();
        requestAnimationFrame(animateIntro);
    }

    animateIntro();

    document.getElementById('start-text-1').addEventListener('mousedown', function(event) {
        const timeValue = document.getElementById('time-remaining');
        const speedometer = document.getElementById('speedometer');
        const  neonLine= document.getElementById('neonline');
        const  neonLine2= document.getElementById('neonline2');
        const neonTimer = document.getElementById('neontimer');
        const turbometer = document.getElementById('turbometer');
        const loadingFill = document.getElementById('loadingFill');
        const scoreboard = document.getElementById('scoreboard');
        const scoreboard2 = document.getElementById('scoreboard2');
        const minimapx = document.getElementById('minimap');
        const timerX = document.getElementById('timer');
        const scoreX = document.getElementById('score');
        if (event.button === 0 && !gameStarted ) {
            startMenu.style.display = 'none';
            loadingScreen.style.display = 'flex';
            loadingFill.style.display = 'flex';

            /*manager.onProgress = (url, itemsLoaded, itemsTotal) => {
                const fillPercentage = Math.floor((itemsLoaded / itemsTotal) * 100);
                updateLoadingSlider(fillPercentage);
                //loadingFill.style.width = `${fillPercentage}%`;
            };*/

            manager.onLoad = () => {
                loadingScreen.style.display = 'none';
                loadingFill.style.display = 'none';
            };
            gameStarted = true;
            elapsedTime = 0;  // Reset elapsedTime when the game starts
            remainingTime = totalTime; // Reset remaining time
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
            main();
            timeValue.style.display = 'block';
            speedometer.style.display = 'block';
            neonLine.style.display = 'block';
            neonLine2.style.display = 'block';
            neonTimer.style.display = 'block';
            turbometer.style.display = 'block';
            scoreboard.style.display = "block";
            scoreboard2.style.display = "block";
            minimapx.style.display = "block";
            scoreX.style.display = "inline-block";
            timerX.style.display = "inline-block";
        }
    });
    document.getElementById('start-text-3').addEventListener('mousedown', function(event) {
        if (event.button === 0 && !gameStarted) {
            const colorPicker = document.getElementById('color-picker');
            colorPicker.style.display = 'block'; // Color picker'ı görünür yap
            colorPicker.click(); // Programmatically trigger the color picker
            colorPicker.addEventListener('input', (event) => {
                const selectedColor = event.target.value; // Seçilen renk
                carColor=selectedColor;
                sceneIntro.traverse((object) => {
                    if (object.isMesh && object.material) {
                        if (object.material.name === 'BMW:carpaint1') {
                            // Materyalin rengini değiştir
                            metallicPaint(object.material, carColor);
                        }
                        else if (object.material.name === 'Jeep_GladiatorRewardRecycled_2019Paint_Material') {
                            // Materyalin rengini değiştir
                            metallicPaint(object.material, carColor);
                        }
                        else if (object.name.includes("Studio_Car277")) {
                            // Materyalin rengini değiştir
                            metallicPaint(object.material, carColor);
                        }
                    }
                });
            });


            document.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' && colorPicker.style.display === 'block') {
                    sceneIntro.traverse((object) => {
                        if (object.isMesh && object.material) {
                            if (object.material.name === 'BMW:carpaint1') {
                                // Materyalin rengini değiştir
                                const color = colorPicker.value;
                                carColor=color;
                                metallicPaint(object.material, carColor);
                            }
                        }
                    });
                }
            });
        }
    });
    document.getElementById('start-text-5').addEventListener('mousedown', function(event) {
        if(isSandbox===false){
            isSandbox=true;

        }else{
            const messageBox = document.getElementById('sandbox-message');
            messageBox.style.display = 'block';
            setTimeout(() => {
                messageBox.style.display = 'none';
            }, 3000);
        }
    });
    document.getElementById('start-text-4').addEventListener('click', showHelpScreen);
    document.getElementById('start-text-6').addEventListener('mousedown', function(event) {
        hdriChange=(hdriChange+1)%3;
        const getHDRItext=document.getElementById("start-text-6");
        if(hdriChange===0) {
            getHDRItext.textContent="TIME:DAYTIME";
        }else if(hdriChange===1) {
            getHDRItext.textContent="TIME:SUNSET";
        }else if(hdriChange===2) {
            getHDRItext.textContent="TIME:NIGHT";
        }
    });
}

function main() {
    init();
    setCannonWorld();
    loadMap(scene).then(createColliders);
    createFrictionPairs();
    if(hdriChange===0){
        loadHDR(scene, renderer);
    }else if(hdriChange===1){
        loadHDRsunset(scene, renderer);
    }else if(hdriChange===2){
        loadHDRnight(scene, renderer);
    }
    if (selectedCarNo===0){
        loadBMW(scene).then(setCameraComposer).then(createVehicle).then(createOrbitControls);
    }else if (selectedCarNo===1){
        loadPorsche(scene).then(setCameraComposer).then(createVehicle).then(createOrbitControls);
    }else if (selectedCarNo===2){
        loadJeep(scene).then(setCameraComposer).then(createVehicle).then(createOrbitControls);
    }
    animate();
}

initIntro();
// main();
