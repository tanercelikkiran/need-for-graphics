import {
    loadMap,
    loadHDR,
    carMesh,
    loadCar,
    loadCarIntro,
    manager,
    loadSounds,
    loadMoveableObject,
    createFogMaterial,
    updateMapMaterials,
} from './loaders.js';

import * as THREE from "three";
import * as CANNON from "cannon-es"

import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { metallicPaint } from "./material-properties.js";
import { DepthTexture } from "three";

import {
    scene, sceneIntro, sceneSandbox, renderer, composer, carColor, motionBlurPass, bloomPass,
    world, vehicle, useShadow, skyMesh, sunLight, hemisphereLight,
    objects, selectedCarNo,
    setScene, setSceneIntro, setSceneSandbox, setRenderer, setComposer, setCarColor,
    setMotionBlurPass, setBloomPass, setSkyMesh, setSunLight, setHemisphereLight,
    setWorld, setSelectedCarNo,
    setUseShadow, setObjects,
} from './state.js';

import {
    getXZSpeed, updateWheelFriction, createVehicle, createObjects,
    updateVehicleControls, updateTurbo, setupVehicleInput,
    syncObjectBodies, getTurboVroom, getStartTurboTime, setStartTurboTime,
} from './vehicle.js';

let cannonDebugger; // not shared with loaders.js, kept local
let stats; // not shared with loaders.js, kept local

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

let isSandbox = false;
let finalScore;

// ================================================
// KAMERA POZİSYONLARI - DİKEY HAREKET
// ================================================
const cameraStartZ = 6.3;   // Adjusted for a more dynamic view
let cameraTargetZ;                       // Anlık hedef Z (dinamik)
const maxCameraTargetZ = 7.8;   // Camera zooms out further
const minCameraTargetZ = 6.6;
const brakingCameraZ = 5.3;   // Closer view during braking
const rearingCameraZ = 5.8;
const backingCameraZ = 6.8;
const speedFactor = 0.03;  // Faster camera zooming
const cameraBackZ = 6.0;   // Slightly forward position on stop
const cameraAnimationDuration3 = 1500; // Faster animations
const cameraAnimationDuration2 = 500;
const cameraAnimationDuration1 = 800;
let cameraAnimationStartTime = null; // Animasyon için referans zaman
let isMovingForward = false;
let isMovingBackward = false;
let isBackingMorvard = false; // (Kod içinde özel durumu varsa)
let isMovingToIdle = false;
let isBrakingCamera = false;
let isStopped = false;
let isBrakingPhase = 0;     // Fren aşamasını izleme
let currentCameraZ = cameraStartZ;
let nameCameraBool = false;
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
let isMovingLeft = false;
let isMovingRight = false;
const cameraStartX = 0;
const cameraLeftTargetX = -1.2; // Wider camera movement for dramatic effect
const cameraRightTargetX = 1.2;
let cameraAnimationStartTimeX = null;
let cameraAnimationStartTimeC = null;
let currentCameraX = cameraStartX;
const cameraStartY = 2.0;
let currentCameraY = cameraStartY;

let score = 0;

let orbitControls;

let hdriChange = 0;

// Reusable objects for per-frame calculations (avoid GC pressure)
const _tmpVec3A = new THREE.Vector3();
const _tmpVec3B = new THREE.Vector3();
const _tmpVec3C = new THREE.Vector3();
const _tmpQuat = new THREE.Quaternion();

// AbortController for game scene event listeners — aborted on scene transitions
let gameAbortController = null;

const startMenu = document.getElementById('start-menu');
const sandboxMenu = document.getElementById('sandbox-menu');
const loadingScreen = document.getElementById('loading-screen');

const fixedTimeStep = 1 / 60; // Fixed time step of 60 Hz
const maxSubSteps = 10;       // Maximum number of sub-steps to catch up with the wall clock
let lastTime = performance.now();

let elapsedTime = 0;
let gameStarted = false;
const totalTime = 400;
let remainingTime = totalTime;
let scoreTime = 400;
let gameOver = false;
let countdownStarted = false;

function addLights(scene) {
    // Ambient Light (genel yumuşak aydınlatma)

    // Directional Light (güneş ışığı etkisi)
    setSunLight(new THREE.DirectionalLight(0xffffff, 0.5));
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
    setHemisphereLight(new THREE.HemisphereLight(0xaaaaaa, 0x444444, 0.4));
    hemisphereLight.position.set(0, 50, 0);
    scene.add(hemisphereLight);
}

function init() {
    if (gameAbortController) gameAbortController.abort();
    gameAbortController = new AbortController();
    const { signal } = gameAbortController;

    setScene(new THREE.Scene());
    addLights(scene);
    loadSounds(scene);
    setRenderer(new THREE.WebGLRenderer({ antialias: false }));
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);// HDR renk kodlaması
    renderer.toneMapping = THREE.ReinhardToneMapping; // Tonemapping
    renderer.toneMappingExposure = 1.2; // Tonemapping parlaklık ayarı
    renderer.shadowMap.enabled = true; // Gölge haritalarını etkinleştir
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    const renderScene = new RenderPass(scene, null);
    setComposer(new EffectComposer(renderer));
    composer.addPass(renderScene);

    const fxaaPass = new ShaderPass(FXAAShader);
    fxaaPass.uniforms['resolution'].value.set(1 / window.innerWidth, 1 / window.innerHeight);
    composer.addPass(fxaaPass);

    setBloomPass(new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.8,
        0.4,
        0.2
    ));
    composer.addPass(bloomPass);

    const skyGeo = new THREE.SphereGeometry(500, 32, 32);
    skyGeo.scale(-1, 1, 1); // flip faces inward if needed
    const skyFogMaterial = createFogMaterial(null);
    setSkyMesh(new THREE.Mesh(skyGeo, skyFogMaterial));
    scene.add(skyMesh);

    setMotionBlurPass(new ShaderPass(motionBlurShader));
    motionBlurPass.uniforms['delta'].value = 200; // Blur miktarı
    motionBlurPass.uniforms['velocityFactor'].value = 15; // Hız ile artan blur
    composer.renderTarget1.depthTexture = new DepthTexture();
    composer.renderTarget2.depthTexture = new DepthTexture();
    composer.addPass(motionBlurPass);
    motionBlurPass.enabled = false;

    // Minimap renderer
    minimapRenderer = new THREE.WebGLRenderer({ antialias: false });
    const setMinimapSize = () => {
        const minimapSize = Math.min(window.innerWidth, window.innerHeight) * 0.20;
        minimapRenderer.setSize(minimapSize, minimapSize);
        const minimap = document.getElementById("minimap");
        const minimapContainer = document.getElementById("minimap-container");
        minimap.style.width = `${minimapSize}px`;
        minimap.style.height = `${minimapSize}px`;
        minimapContainer.style.width = `${minimapSize}px`;
        minimapContainer.style.height = `${minimapSize}px`;
    };
    setMinimapSize();
    minimapRenderer.setClearColor(0x000000, 1);
    minimapRenderer.domElement.style.position = "absolute";
    minimapRenderer.domElement.style.bottom = "-0.5%";
    minimapRenderer.domElement.style.right = "-0.5%";
    minimapRenderer.domElement.style.borderRadius = "50%";
    minimapRenderer.domElement.style.zIndex = "1";
    window.addEventListener("resize", () => setMinimapSize(), { signal });
    document.getElementById("minimap").appendChild(minimapRenderer.domElement);

    window.addEventListener('resize', () => {
        const activeCamera = scene.userData.activeCamera;
        const width = window.innerWidth;
        const height = window.innerHeight;

        // Kamera oranını güncelle
        activeCamera.aspect = width / height;
        activeCamera.updateProjectionMatrix();

        // Renderer boyutunu güncelle
        renderer.setSize(width, height);

        // Composer Pass'lerini güncelle
        fxaaPass.uniforms['resolution'].value.set(1 / width, 1 / height);
        bloomPass.resolution.set(width, height);
    }, { signal });

    setupVehicleInput(signal);

    document.getElementById('menu-button').addEventListener('mousedown', function () {
        location.reload();
    }, { signal });

    // Camera key handlers (moved from updateCamera)
    document.addEventListener('keydown', (event) => {
        const activeCamera = scene.userData.activeCamera;
        if (!activeCamera) return;
        const key = event.key.toLowerCase();
        if (key === 'w' && !isMovingForward) {
            currentCameraZ = activeCamera.position.z;
            currentCameraY = activeCamera.position.y;
            isMovingForward = true;
            isBrakingCamera = false;
            isMovingBackward = false;
            isMovingToIdle = false;
            isBackingMorvard = false;
            cameraAnimationStartTime = performance.now();
        }
        if (key === 's' && !isBrakingCamera) {
            currentCameraZ = activeCamera.position.z;
            currentCameraY = activeCamera.position.y;
            isMovingForward = false;
            isBrakingCamera = true;
            isMovingBackward = false;
            isMovingToIdle = false;
            isBackingMorvard = false;
            cameraAnimationStartTime = performance.now();
        }
        if (key === 'a' && !isMovingLeft) {
            currentCameraX = activeCamera.position.x;
            isMovingLeft = true;
            isMovingRight = false;
            cameraAnimationStartTimeX = performance.now();
        }
        if (key === 'd' && !isMovingRight) {
            currentCameraX = activeCamera.position.x;
            isMovingRight = true;
            isMovingLeft = false;
            cameraAnimationStartTimeX = performance.now();
        }
        if (key === 'n') {
            if (!nameCameraBool) {
                currentCameraX = activeCamera.position.x;
                currentCameraY = activeCamera.position.y;
                currentCameraZ = activeCamera.position.z;
                carMesh.remove(activeCamera);
                scene.add(activeCamera);
                orbitControls.enabled = false;
                cameraLookAtStart.copy(activeCamera.position.clone().add(activeCamera.getWorldDirection(new THREE.Vector3())));
                cameraLookAtEnd.set(60, 0, 130);
                startQuaternion.copy(activeCamera.quaternion);
                activeCamera.lookAt(cameraLookAtEnd);
                endQuaternion.copy(activeCamera.quaternion);
                activeCamera.quaternion.copy(startQuaternion);
                cameraLookAtStartTime = performance.now();
                cameraAnimationStartTimeC = performance.now();
                nameCameraBool = true;
            } else {
                currentCameraX = activeCamera.position.x;
                currentCameraY = activeCamera.position.y;
                currentCameraZ = activeCamera.position.z;
                scene.remove(activeCamera);
                carMesh.add(activeCamera);
                cameraAnimationStartTimeC = performance.now();
                nameCameraBool = false;
            }
        }
    }, { signal });

    document.addEventListener('keyup', (event) => {
        const activeCamera = scene.userData.activeCamera;
        const key = event.key.toLowerCase();
        if (key === 'w') {
            if (activeCamera) {
                currentCameraZ = activeCamera.position.z;
                currentCameraY = activeCamera.position.y;
            }
            isMovingForward = false;
            isMovingBackward = true;
            isMovingToIdle = true;
            isBrakingCamera = false;
            isBackingMorvard = false;
            cameraAnimationStartTime = performance.now();
        }
        if (key === 's') {
            if (activeCamera) {
                currentCameraZ = activeCamera.position.z;
                currentCameraY = activeCamera.position.y;
            }
            isMovingForward = false;
            isMovingBackward = false;
            isMovingToIdle = true;
            isBrakingCamera = false;
            isBackingMorvard = true;
            isBrakingPhase = 0;
            cameraAnimationStartTime = performance.now();
        }
        if (key === 'a') {
            if (activeCamera) currentCameraX = activeCamera.position.x;
            isMovingLeft = false;
            isMovingRight = false;
            cameraAnimationStartTimeX = performance.now();
        }
        if (key === 'd') {
            if (activeCamera) currentCameraX = activeCamera.position.x;
            isMovingLeft = false;
            isMovingRight = false;
            cameraAnimationStartTimeX = performance.now();
        }
    }, { signal });
}

function createOrbitControls() {
    if (scene.userData.activeCamera) {
        orbitControls = new OrbitControls(scene.userData.activeCamera, renderer.domElement);
        orbitControls.enabled = false; // Varsayılan olarak kapalı
    }
}

function setCannonWorld() {
    setWorld(new CANNON.World());
    world.gravity.set(0, -9.82, 0);
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.useBoundingBoxes = true;
    world.defaultContactMaterial.friction = 0.1;

    // Create the ground plane
    const groundBody = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: new CANNON.Plane(),
    });
    groundBody.material = groundMaterial;
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // Rotate plane to be horizontal\
    groundBody.aabbNeedsUpdate = true;
    groundBody.collisionFilterGroup = materialGroups[0].group;
    groundBody.collisionFilterMask = materialGroups[0].mask;
    world.addBody(groundBody);

    let newFrictionSlip = surfaceFrictionValues.default;

    // cannonDebugger = new CannonDebugger(scene, world);

    world.addEventListener("beginContact", (event) => {
        const bodyA = event.bodyA;
        const bodyB = event.bodyB;

        let newFrictionSlip = surfaceFrictionValues.default;

        const materials = [bodyA.material?.name, bodyB.material?.name];
        if (materials.includes("grass")) {
            newFrictionSlip = surfaceFrictionValues.grass;
        } else if (materials.includes("ice")) {
            newFrictionSlip = surfaceFrictionValues.ice;
        } else if (materials.includes("gravel")) {
            newFrictionSlip = surfaceFrictionValues.gravel;
        } else if (materials.includes("mud")) {
            newFrictionSlip = surfaceFrictionValues.mud;
        }

        updateWheelFriction(vehicle, newFrictionSlip);
    });

    world.addEventListener("endContact", (event) => {
        // Varsayılan değeri geri yükle
        updateWheelFriction(vehicle, surfaceFrictionValues.default);
    });
}

const groundMaterial = new CANNON.Material("groundMaterial");
const bodyMaterial = new CANNON.Material("bodyMaterial");
const wheelMaterial = new CANNON.Material("wheelMaterial");
const objectMaterial = new CANNON.Material("objectMaterial");
const iceMaterial = new CANNON.Material("iceMaterial");
const mudMaterial = new CANNON.Material("mudMaterial");
const gravelMaterial = new CANNON.Material("gravelMaterial");
const grassMaterial = new CANNON.Material("grassMaterial");
const colliderMaterial = new CANNON.Material("colliderMaterial");

// Define collision groups (powers of 2)
const GROUP_GROUND = 1;  // Group 0
const GROUP_BODY = 2;    // Group 1
const GROUP_WHEEL = 4;   // Group 2
const GROUP_OBJECT = 8;  // Group 3
const GROUP_ICE = 16;    // Group 4
const GROUP_MUD = 32;    // Group 5
const GROUP_GRAVEL = 64; // Group 6
const GROUP_GRASS = 128; // Group 7

const surfaceFrictionValues = {
    ground: 4.8,
    ice: 0.1,
    mud: 1.0,
    gravel: 5.5,
    grass: 3.0,
    default: 4.8, // Varsayılan değer
};

const materialGroups = [
    { material: groundMaterial, group: GROUP_GROUND, mask: GROUP_BODY | GROUP_WHEEL | GROUP_OBJECT },
    { material: bodyMaterial, group: GROUP_BODY, mask: GROUP_GROUND | GROUP_ICE | GROUP_MUD | GROUP_GRAVEL | GROUP_GRASS | GROUP_OBJECT },
    { material: wheelMaterial, group: GROUP_WHEEL, mask: GROUP_GROUND | GROUP_ICE | GROUP_MUD | GROUP_GRAVEL | GROUP_GRASS | GROUP_OBJECT },
    { material: objectMaterial, group: GROUP_OBJECT, mask: GROUP_GROUND | GROUP_ICE | GROUP_MUD | GROUP_GRAVEL | GROUP_GRASS | GROUP_OBJECT | GROUP_BODY | GROUP_WHEEL },
    { material: iceMaterial, group: GROUP_ICE, mask: GROUP_BODY | GROUP_WHEEL | GROUP_OBJECT },
    { material: mudMaterial, group: GROUP_MUD, mask: GROUP_BODY | GROUP_WHEEL | GROUP_OBJECT },
    { material: gravelMaterial, group: GROUP_GRAVEL, mask: GROUP_BODY | GROUP_WHEEL | GROUP_OBJECT },
    { material: grassMaterial, group: GROUP_GRASS, mask: GROUP_BODY | GROUP_WHEEL | GROUP_OBJECT },
];

function createColliders() {
    return new Promise((resolve, reject) => {
        scene.traverse(function (child) {
            if (child.isMesh) {
                if (child.name.includes("Collider")) {
                    child.visible = false;
                    const halfExtents = new CANNON.Vec3(child.scale.x, child.scale.y, child.scale.z);
                    const box = new CANNON.Box(halfExtents);
                    const body = new CANNON.Body({ mass: 0 });
                    body.addShape(box);
                    body.position.copy(child.position);
                    body.quaternion.copy(child.quaternion);
                    body.material = colliderMaterial;
                    world.addBody(body);
                }
            }
            if (child.name.includes("Ice") || child.name.includes("Mud") || child.name.includes("Gravel") || child.name.includes("Grass")) {
                const boundingBox = new THREE.Box3().setFromObject(child);
                const size = new THREE.Vector3();
                boundingBox.getSize(size);
                const box = new CANNON.Box(new CANNON.Vec3(size.x / 2, 0.05, size.z / 2));
                const body = new CANNON.Body({ mass: 0 });
                body.aabbNeedsUpdate = true;
                body.addShape(box);
                body.position.copy(child.position);
                if (child.name.includes("Ice")) {
                    body.material = iceMaterial;
                    body.collisionFilterGroup = materialGroups[4].group;
                    body.collisionFilterMask = materialGroups[4].mask;
                }
                else if (child.name.includes("Mud")) {
                    body.material = mudMaterial;
                    body.collisionFilterGroup = materialGroups[5].group;
                    body.collisionFilterMask = materialGroups[5].mask;
                }
                else if (child.name.includes("Gravel")) {
                    body.material = gravelMaterial;
                    body.collisionFilterGroup = materialGroups[6].group;
                    body.collisionFilterMask = materialGroups[6].mask;
                }
                else if (child.name.includes("Grass")) {
                    body.material = grassMaterial;
                    body.collisionFilterGroup = materialGroups[7].group;
                    body.collisionFilterMask = materialGroups[7].mask;
                }
                world.addBody(body);
            }
        });
        resolve();
    });
}

function createFrictionPairs() {
    const frictionPairs = [
        [groundMaterial, bodyMaterial],
        [groundMaterial, wheelMaterial],
        [groundMaterial, objectMaterial],
        [iceMaterial, bodyMaterial],
        [iceMaterial, wheelMaterial],
        [iceMaterial, objectMaterial],
        [mudMaterial, bodyMaterial],
        [mudMaterial, wheelMaterial],
        [mudMaterial, objectMaterial],
        [gravelMaterial, bodyMaterial],
        [gravelMaterial, wheelMaterial],
        [gravelMaterial, objectMaterial],
        [grassMaterial, bodyMaterial],
        [grassMaterial, wheelMaterial],
        [grassMaterial, objectMaterial]
    ];

    frictionPairs.forEach(pair => {
        let friction = 0;

        switch (pair[0].name) {
            case "groundMaterial":
                friction = 0.3;
                break;
            case "iceMaterial":
                friction = 0.05;
                break;
            case "mudMaterial":
                friction = 0.2;
                break;
            case "gravelMaterial":
                friction = 0.95;
                break;
            case "grassMaterial":
                friction = 0.5;
                break;
        }

        const contact = new CANNON.ContactMaterial(pair[0], pair[1], {
            friction: friction,
            restitution: 0.2,
        });
        world.addContactMaterial(contact);
    });

}

function getUpAxis(body) {
    const localUp = new CANNON.Vec3(0, 1, 0); // Local up in body space
    let worldUp = new CANNON.Vec3(); // Placeholder for world up

    body.quaternion.vmult(localUp, worldUp); // Transform local up to world space

    return worldUp; // This is the normalized up axis
}

function updateCamera() {
    const currentTime = performance.now();

    if (cameraAnimationStartTime !== null) {
        const elapsedTime = currentTime - cameraAnimationStartTime;
        const activeCamera = scene.userData.activeCamera;

        if (activeCamera && orbitControls.enabled === false && nameCameraBool === false) {
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
            } else if (isBackingMorvard) {
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
                    if (getTurboVroom()) {
                        if (getStartTurboTime() === null) {
                            setStartTurboTime(performance.now()); // Turbo başladığında zamanı kaydet
                        }
                        const turboElapsed = Math.min((performance.now() - getStartTurboTime()) / 5000, 1); // 2 saniyede maksimuma ulaş
                        turboEffect = THREE.MathUtils.lerp(0.8, 2.4, turboElapsed); // 1'den 3'e doğru artış
                    } else {
                        setStartTurboTime(null); // Turbo durduğunda sıfırla
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
                    if (isBrakingPhase === 0) {
                        const t = Math.min(elapsedTime / cameraAnimationDuration1, 1);
                        const easeT = easeInOutSin(t);
                        activeCamera.position.y = THREE.MathUtils.lerp(currentCameraY, cameraStartY, easeT);
                        activeCamera.position.z = THREE.MathUtils.lerp(currentCameraZ, brakingCameraZ, easeT);

                        if (t === 1) {
                            isBrakingPhase = 1; // Faz 2'ye geçiş
                            cameraAnimationStartTime = performance.now();
                        }
                    } else if (isBrakingPhase === 1) {
                        if (elapsedTime >= cameraAnimationDuration1) {
                            isBrakingPhase = 2;
                            cameraAnimationStartTime = performance.now();
                            currentCameraZ = activeCamera.position.z;
                        }
                    } else if (isBrakingPhase === 2) {
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

        if (activeCamera && orbitControls.enabled === false && nameCameraBool === false) {
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
    if (cameraAnimationStartTimeC !== null && nameCameraBool) {
        const elapsedTimeC = currentTime - cameraAnimationStartTimeC;
        const activeCamera = scene.userData.activeCamera;

        if (activeCamera) {
            const t = Math.min(elapsedTimeC / 3000, 1); // 1 saniyelik animasyon
            const easeT = easeInOutSin(t);

            // Hedef pozisyon ve rotasyon
            _tmpVec3A.set(60, 60, 40);

            // Pozisyonu ve rotasyonu hesapla
            _tmpVec3B.set(currentCameraX, currentCameraY, currentCameraZ);
            activeCamera.position.lerpVectors(
                _tmpVec3B,
                _tmpVec3A,
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
    return 0.5 * (1 - Math.cos(Math.PI * t));
}

window.addEventListener('keydown', (e) => {
    if (e.key === 'k' || e.key === 'K') {
        setUseShadow((useShadow + 1) % 4);
        updateMapMaterials(useShadow, scene);
    }
});


function updateTimer(deltaTime) {
    elapsedTime += deltaTime;
    const totalSeconds = Math.floor(elapsedTime / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const milliseconds = Math.floor(elapsedTime / 10 % 100);
    document.getElementById('timer').textContent = `Time: ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(milliseconds).padStart(2, '0')}`;
}

function updateScore(deltaTime) {
    scoreTime -= deltaTime / 1000;
    const speed = getXZSpeed(vehicle.chassisBody);  // XZ düzlemindeki hız
    const seconds = Math.floor(scoreTime % 600);
    score += speed * 0.000001;
    const secondssqr = Math.pow(seconds, 2)
    finalScore = score * secondssqr;
    document.getElementById('score').textContent = `Score: ${finalScore.toFixed(0)}`;
}

function updateRemainingTime(deltaTime) {
    if (!gameOver) {
        remainingTime -= deltaTime / 1000;
        if (remainingTime <= 0) {
            remainingTime = 0;
            gameOver = true;
            document.getElementById('game-over').style.display = 'flex'; // Show game over
            document.getElementById("final-score").innerText = `Score: ${finalScore.toFixed(0)}`;
            const totalSeconds = Math.floor(elapsedTime / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = Math.floor(totalSeconds % 60);
            const milliseconds = Math.floor(elapsedTime / 10 % 100);
            document.getElementById("time").innerText = `Time: ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(milliseconds).padStart(2, '0')}`;
        }
        const seconds = Math.floor(remainingTime % 600);
        const timerText = document.getElementById('time-value');
        timerText.textContent = `${String(seconds).padStart(2, '0')}`;
    }
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
minimapCamera.position.set(0, 800, 0);
minimapCamera.lookAt(0, 0, 0);

// Minimap renderer (lazy-init inside init())
let minimapRenderer;

function updateMinimap() {
    // Minimap kamera, aracın pozisyonunu takip eder
    const carPosition = vehicle.chassisBody.position;
    minimapCamera.position.set(carPosition.x, 200, carPosition.z);
    minimapCamera.lookAt(carPosition.x, 0, carPosition.z);

    // Minimap sahnesini render et
    minimapRenderer.render(scene, minimapCamera);
}

//############################################################################################################
//####  MAIN FUNCTION  #######################################################################################
//############################################################################################################

function animate() {
    if (gameOver) {
        return;
    }
    //cannonDebugger.update();


    const time = performance.now();
    const deltaTime = (time - lastTime) / 1000; // Convert to seconds
    const milDeltaTime = (time - lastTime);
    lastTime = time;
    // Step the physics world
    world.step(fixedTimeStep, deltaTime, maxSubSteps);
    //stats.begin();
    try {
        updateTurbo(deltaTime);
        updateVehicleControls();
        updateCamera();
        updateMinimap();

        if (orbitControls && orbitControls.enabled) {
            orbitControls.update();
        }

        const chassisBody = vehicle.chassisBody;
        let worldUp = getUpAxis(chassisBody);
        _tmpVec3A.set(chassisBody.position.x - worldUp.x / 1.5, chassisBody.position.y - worldUp.y / 1.5, chassisBody.position.z - worldUp.z / 1.5);
        chassisBody.threemesh.position.copy(_tmpVec3A);
        chassisBody.threemesh.quaternion.copy(chassisBody.quaternion);

        // Aşağıdaki değerleri başta tanımladığınızı varsayıyoruz:
        const MinX = 261.86;
        const MaxX = 263.86;
        const MinY = 1;
        const MaxY = 10;
        const MinZ = -6.05;
        const MaxZ = 5.95;

        const carPos = chassisBody.position; // CANNON.Vec3: (x, y, z)

        if (
            carPos.x >= MinX && carPos.x <= MaxX &&
            carPos.y >= MinY && carPos.y <= MaxY &&
            carPos.z >= MinZ && carPos.z <= MaxZ && !gameOver
        ) {
            gameOver = true;
            document.getElementById('game-over').style.display = 'flex';
            document.querySelector("#game-over h1").innerText = "You beat it!";
            document.getElementById("final-score").innerText = `Score: ${finalScore.toFixed(0)}`;
            const totalSeconds = Math.floor(elapsedTime / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = Math.floor(totalSeconds % 60);
            const milliseconds = Math.floor(elapsedTime / 10 % 100);
            document.getElementById("time").innerText = `Time: ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(milliseconds).padStart(2, '0')}`;
        }

        syncObjectBodies();

        const velocity = vehicle.chassisBody.velocity;
        const speed = getXZSpeed(vehicle.chassisBody);
        motionBlurPass.uniforms['velocityFactor'].value = speed * 100;
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
        const activeCamera = scene.userData.activeCamera;
        if (loadingScreen.style.display === "none" && startMenu.style.display === "none" && gameStarted && !countdownStarted) {
            countdownStarted = true;
            let countdown = 1;
            //countdownı buraya yapacaksın
            const countdown3 = document.getElementById('countdown');
            const countdownNumber = document.getElementById('countdown-number');
            countdown3.style.display = 'none';

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
                _tmpVec3A.lerpVectors(cameraLookAtStart, cameraLookAtEnd, t);

                // Kameranın mevcut pozisyonu sabit kalıyor
                _tmpVec3B.copy(activeCamera.position);

                // Kameranın hedef yönünü hesapla
                _tmpVec3C.subVectors(_tmpVec3A, _tmpVec3B).normalize();

                // Kameranın quaternion dönüşünü hesapla
                activeCamera.getWorldDirection(_tmpVec3A).normalize();
                _tmpQuat.setFromUnitVectors(_tmpVec3A, _tmpVec3C);

                // Kameranın dönüşünü yumuşakça güncelle
                activeCamera.quaternion.slerp(_tmpQuat, t2);

                // Animasyon tamamlandıysa sıfırla
                if (t === 1) {
                    cameraLookAtStartTime = null; // Animasyon tamamlandı
                }
            }
        } else {
            _tmpVec3A.set(chassisBody.position.x, chassisBody.position.y + 0.9, chassisBody.position.z);
            activeCamera.lookAt(_tmpVec3A); // Arabaya bak
        }
        composer.render();
    }
    catch (e) {
        console.error("Game loop error:", e);
    }

    //stats.end();
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
        } else {
            hideHelpScreen();
        }
    }
});

function initIntro() {
    const introAbortController = new AbortController();
    const introAbortSignal = introAbortController.signal;

    setSceneIntro(new THREE.Scene());

    setRenderer(new THREE.WebGLRenderer({ antialias: true }));
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    try {
        const carTypes = ['bmw', 'porsche', 'jeep'];
        carTypes.forEach(type => loadCarIntro(sceneIntro, type));
    } catch (error) {
        console.error("Model yükleme sırasında hata oluştu:", error);
    }


    document.getElementById("start-text-2").addEventListener("click", () => {
        setSelectedCarNo((selectedCarNo + 1) % 3)
        updateCarVisibility(); // Görünürlüğü güncelle
    });

    function updateCarVisibility() {
        let bmwModel, porscheModel, jeepModel;

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
        } else if (selectedCarNo === 2) {
            if (bmwModel) bmwModel.visible = false;
            if (porscheModel) porscheModel.visible = false;
            if (jeepModel) jeepModel.visible = true;
        }
    }

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
    sceneIntro.add(ambientLight);

    const spotLight = new THREE.SpotLight(0xffffff, 2500, 0, Math.PI, 0.5);
    const lightTarget = new THREE.Object3D();
    lightTarget.position.set(0, 1, 0); // Işığın hedef noktası
    sceneIntro.add(lightTarget);
    spotLight.target = lightTarget;
    sceneIntro.add(spotLight);

    // Küresel koordinatlar
    let radius = 40; // Küre yarıçapı
    let theta = Math.PI / 2; // Yatay açı
    let phi = Math.PI / 4; // Dikey açı

    spotLight.position.x = lightTarget.position.x + radius * Math.sin(phi) * Math.cos(theta);
    spotLight.position.y = lightTarget.position.y + radius * Math.cos(phi);
    spotLight.position.z = lightTarget.position.z + radius * Math.sin(phi) * Math.sin(theta);

    spotLight.target.updateMatrixWorld();

    // Kamerayı ekleyin
    const camera = new THREE.PerspectiveCamera(12, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(1, 0.30, -21);
    camera.lookAt(0, 200, 0);
    sceneIntro.userData.activeCamera = camera;

    const renderScene = new RenderPass(sceneIntro, camera);
    const introComposer = new EffectComposer(renderer);
    introComposer.addPass(renderScene);

    const fxaaPass = new ShaderPass(FXAAShader);
    fxaaPass.uniforms['resolution'].value.set(1 / window.innerWidth, 1 / window.innerHeight);
    introComposer.addPass(fxaaPass);

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
        const intensityStep = 400;

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
                spotLight.intensity = Math.min(10000, spotLight.intensity + intensityStep); // Maksimum 10
                break;
            case 'h': // Parlaklığı azaltır
                spotLight.intensity = Math.max(200, spotLight.intensity - intensityStep); // Minimum 0
                break;
        }

        // Spot ışığın pozisyonunu küresel koordinatlara göre hesapla
        spotLight.position.x = lightTarget.position.x + radius * Math.sin(phi) * Math.cos(theta);
        spotLight.position.y = lightTarget.position.y + radius * Math.cos(phi);
        spotLight.position.z = lightTarget.position.z + radius * Math.sin(phi) * Math.sin(theta);

        // Işığın hedefe bakmasını sağla
        spotLight.target.updateMatrixWorld();
    }, { signal: introAbortSignal });
    window.addEventListener('resize', () => {
        // Yeni boyutları al
        const width = window.innerWidth;
        const height = window.innerHeight;

        // Kamera oranını güncelle
        camera.aspect = width / height;
        camera.updateProjectionMatrix();

        // Renderer boyutunu güncelle
        renderer.setSize(width, height);

        // BloomPass çözünürlüğünü güncelle
        bloomPass.resolution.set(width, height);
    });

    function animateIntro() {
        controls.update();
        introComposer.render();
        requestAnimationFrame(animateIntro);
    }

    animateIntro();

    document.getElementById('start-text-1').addEventListener('mousedown', function (event) {
        const timeValue = document.getElementById('time-remaining');
        const speedometer = document.getElementById('speedometer');
        const neonLine = document.getElementById('neonline');
        const neonLine2 = document.getElementById('neonline2');
        const neonTimer = document.getElementById('neontimer');
        const turbometer = document.getElementById('turbometer');
        const loadingFill = document.getElementById('loadingFill');
        const scoreboard = document.getElementById('scoreboard');
        const scoreboard2 = document.getElementById('scoreboard2');
        const minimapx = document.getElementById('minimap-container');
        const timerX = document.getElementById('timer');
        const scoreX = document.getElementById('score');
        if (event.button === 0 && !gameStarted) {
            startMenu.style.display = 'none';
            loadingScreen.style.display = 'flex';
            loadingFill.style.display = 'flex';

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

            introAbortController.abort();
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
    // Color picker — listeners registered once
    (function setupColorPicker() {
        const colorPicker = document.getElementById('color-picker');
        let colorPickerActive = false;

        document.getElementById('start-text-3').addEventListener('mousedown', function (event) {
            if (event.button === 0 && !gameStarted) {
                colorPicker.style.display = 'block';
                colorPicker.click();
                colorPickerActive = true;
            }
        });

        colorPicker.addEventListener('input', () => {
            if (!colorPickerActive || !sceneIntro) return;
            setCarColor(colorPicker.value);
            sceneIntro.traverse((object) => {
                if (object.isMesh && object.material) {
                    if (
                        object.material.name === 'BMW:carpaint1' ||
                        object.material.name === 'Jeep_GladiatorRewardRecycled_2019Paint_Material' ||
                        object.name.includes("Studio_Car277")
                    ) {
                        metallicPaint(object.material, carColor);
                    }
                }
            });
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && colorPickerActive) {
                colorPickerActive = false;
                colorPicker.style.display = 'none';
                if (!sceneIntro) return;
                sceneIntro.traverse((object) => {
                    if (object.isMesh && object.material) {
                        if (
                            object.material.name === 'BMW:carpaint1' ||
                            object.material.name === 'Jeep_GladiatorRewardRecycled_2019Paint_Material' ||
                            object.name.includes("Studio_Car277")
                        ) {
                            metallicPaint(object.material, carColor);
                        }
                    }
                });
            }
        });
    })();
    document.getElementById('start-text-5').addEventListener('mousedown', function (event) {
        if (isSandbox === false) {
            isSandbox = true;

            const minimapx = document.getElementById('minimap-container');
            const loadingFill = document.getElementById('loadingFill');;
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

            loadingScreen.style.display = 'flex';
            loadingFill.style.display = 'flex';

            manager.onLoad = () => {
                loadingScreen.style.display = 'none';
                loadingFill.style.display = 'none';
            };
            startMenu.style.display = "none";
            minimapx.style.display = "block";
            renderer.dispose(); // Renderer'ı temizle
            document.body.removeChild(renderer.domElement); // Renderer öğesini DOM'dan kaldır

            // Diğer sahne temizlemeleri
            sceneIntro.clear(); // Sahneyi temizle

            introAbortController.abort();
            sandBox(); // Sandbox sahnesini başlat


        }
        else {
            const messageBox = document.getElementById('sandbox-message');
            messageBox.style.display = 'block';
            setTimeout(() => {
                messageBox.style.display = 'none';
            }, 3000);
        }
    });
    document.getElementById('start-text-4').addEventListener('click', showHelpScreen);
    document.getElementById('start-text-6').addEventListener('mousedown', function (event) {
        hdriChange = (hdriChange + 1) % 3;
        const getHDRItext = document.getElementById("start-text-6");
        if (hdriChange === 0) {
            getHDRItext.textContent = "TIME:DAYTIME";
        } else if (hdriChange === 1) {
            getHDRItext.textContent = "TIME:SUNSET";
        } else if (hdriChange === 2) {
            getHDRItext.textContent = "TIME:NIGHT";
        }
    });
}

function sandBox() {
    const sandboxAbortController = new AbortController();
    const sandboxSignal = sandboxAbortController.signal;

    let selectedObject = null;
    let index = 0;
    let isDragging = false;
    let dragPlane; // Plane to project mouse movements
    let dragMode = "move"; // "move" or "rotate"

    let isShiftDown = false;

    sandboxMenu.style.display = "flex";

    // Initialize minimap renderer if not already created (sandbox can be entered before init())
    if (!minimapRenderer) {
        minimapRenderer = new THREE.WebGLRenderer({ antialias: false });
        const minimapSize = Math.min(window.innerWidth, window.innerHeight) * 0.20;
        minimapRenderer.setSize(minimapSize, minimapSize);
        minimapRenderer.setClearColor(0x000000, 1);
        minimapRenderer.domElement.style.position = "absolute";
        minimapRenderer.domElement.style.bottom = "-0.5%";
        minimapRenderer.domElement.style.right = "-0.5%";
        minimapRenderer.domElement.style.borderRadius = "50%";
        minimapRenderer.domElement.style.zIndex = "1";
        const minimap = document.getElementById("minimap");
        const minimapContainer = document.getElementById("minimap-container");
        minimap.style.width = `${minimapSize}px`;
        minimap.style.height = `${minimapSize}px`;
        minimapContainer.style.width = `${minimapSize}px`;
        minimapContainer.style.height = `${minimapSize}px`;
        minimap.appendChild(minimapRenderer.domElement);
    }

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    setSceneSandbox(new THREE.Scene());
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, 0);
    sceneSandbox.userData.activeCamera = camera;

    setRenderer(new THREE.WebGLRenderer());
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    const controls2 = new OrbitControls(camera, renderer.domElement);
    controls2.target.set(0, 1, 0);
    controls2.enableDamping = true;
    controls2.dampingFactor = 0.05;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); // Ortam ışığı
    sceneSandbox.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 10, 10);
    sceneSandbox.add(directionalLight);

    setUseShadow(2);

    try {
        loadMap(sceneSandbox).then(() => updateMapMaterials(useShadow, sceneSandbox));
        loadHDR(sceneSandbox);
    } catch (error) {
        console.error("Model yükleme sırasında hata oluştu:", error);
    }

    document.addEventListener('mousedown', (event) => {
        // Left mouse button (move) or right mouse button (rotate)
        if (event.button === 0) dragMode = "move";
        if (event.button === 2) dragMode = "rotate";

        // Calculate mouse position in normalized device coordinates
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        // Raycast to find intersected objects
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(objects);

        if (intersects.length > 0) {
            // Select object
            selectedObject = intersects[0].object;

            while (selectedObject.parent && !selectedObject.parent.isScene) {
                selectedObject = selectedObject.parent;
            }

            // Create a drag plane at the intersection point
            dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            const intersectionPoint = intersects[0].point;
            dragPlane.setFromNormalAndCoplanarPoint(
                camera.getWorldDirection(new THREE.Vector3()).negate(),
                intersectionPoint
            );

            isDragging = true;
            controls2.enabled = false; // Disable orbit controls
        } else {
            // No object selected
            if (selectedObject) {
                selectedObject = null;
            }
            controls2.enabled = true; // Enable orbit controls
        }
    }, { signal: sandboxSignal });

    document.addEventListener('mousemove', (event) => {
        if (!isDragging || !selectedObject) return;

        if (dragMode === "move") {
            // Calculate mouse position in normalized device coordinates
            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

            // Project the mouse onto a drag plane
            raycaster.setFromCamera(mouse, camera);
            const intersectionPoint = new THREE.Vector3();
            raycaster.ray.intersectPlane(dragPlane, intersectionPoint);

            if (intersectionPoint) {
                // Update object position
                selectedObject.position.copy(intersectionPoint);
            }
        } else if (dragMode === "rotate") {
            // Rotate the object based on mouse movement
            selectedObject.rotation.y += event.movementX * 0.01; // Rotate around Y-axis
            selectedObject.rotation.x += event.movementY * 0.01; // Rotate around X-axis

            if (isShiftDown) {
                selectedObject.rotation.z += event.movementX * 0.01; // Rotate around Z-axis
            }
        }
    }, { signal: sandboxSignal });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            dragMode = "move"; // Reset to move mode
        }
        controls2.enabled = true; // Re-enable orbit controls
    }, { signal: sandboxSignal });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Shift') {
            isShiftDown = true;
        }
        if (event.key.toLowerCase() === 'l') {
            loadMoveableObject(sceneSandbox, index, camera);
        }
        if (event.key === 'ArrowRight') {
            index = (index + 1) % 8
        }
        if (event.key === 'ArrowLeft') {
            index = (index - 1) % 8 < 0 ? 7 : (index - 1) % 8;
        }
        if (event.key === 'Delete') {
            sceneSandbox.remove(selectedObject);
            setObjects(objects.filter((object) => object.uuid !== selectedObject.uuid));
        }
    }, { signal: sandboxSignal });

    document.addEventListener('keyup', (event) => {
        if (event.key === 'Shift') {
            isShiftDown = false;
        }
    }, { signal: sandboxSignal });
    document.getElementById("sandbox-button-2").addEventListener("click", () => {
        loadMoveableObject(sceneSandbox, index, camera);
    }, { signal: sandboxSignal });

    document.getElementById('sandbox-button-1').addEventListener('mousedown', function (event) {
        const timeValue = document.getElementById('time-remaining');
        const speedometer = document.getElementById('speedometer');
        const neonLine = document.getElementById('neonline');
        const neonLine2 = document.getElementById('neonline2');
        const neonTimer = document.getElementById('neontimer');
        const turbometer = document.getElementById('turbometer');
        const loadingFill = document.getElementById('loadingFill');
        const scoreboard = document.getElementById('scoreboard');
        const scoreboard2 = document.getElementById('scoreboard2');
        const minimapx = document.getElementById('minimap-container');
        const timerX = document.getElementById('timer');
        const scoreX = document.getElementById('score');
        if (event.button === 0 && !gameStarted) {
            sandboxMenu.style.display = "none";
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

            sandboxAbortController.abort();
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
    window.addEventListener('resize', () => {
        // Yeni boyutları al
        const width = window.innerWidth;
        const height = window.innerHeight;

        // Kamera oranını güncelle
        camera.aspect = width / height;
        camera.updateProjectionMatrix();

        // Renderer boyutunu güncelle
        renderer.setSize(width, height);

        // BloomPass çözünürlüğünü güncelle
        bloomPass.resolution.set(width, height);
    }, { signal: sandboxSignal });

    function animateSandbox() {
        controls2.update();
        renderer.render(sceneSandbox, camera);
        minimapRenderer.render(sceneSandbox, minimapCamera);
        requestAnimationFrame(animateSandbox);
    }

    animateSandbox();

}

function main() {
    init();
    setCannonWorld();
    loadMap(scene).then(() => updateMapMaterials(useShadow, scene)).then(createColliders).then(() => createObjects(objectMaterial, materialGroups));
    createFrictionPairs();
    const HDR_PATHS = ['public/hdrinew.hdr', 'public/hdrisunset.hdr', 'public/hdrinight.hdr'];
    const HDR_INTENSITIES = [0.2, undefined, undefined];
    loadHDR(scene, HDR_PATHS[hdriChange], HDR_INTENSITIES[hdriChange]);

    const carTypes = ['bmw', 'porsche', 'jeep'];
    loadCar(scene, carTypes[selectedCarNo])
        .then(setCameraComposer)
        .then(() => createVehicle(bodyMaterial, wheelMaterial, materialGroups))
        .then(createOrbitControls);

    animate();
}

initIntro();