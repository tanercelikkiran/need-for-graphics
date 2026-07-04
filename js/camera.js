// camera.js — Camera system: animation, input, orbit controls.
// Consumes shared state from state.js, speed/turbo from vehicle.js, car mesh from loaders.js.
// Does NOT import from main.js.

import * as THREE from "three";
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { scene, renderer, composer, vehicle } from "./state.js";
import { getTurboVroom, getStartTurboTime, setStartTurboTime } from "./vehicle.js";
import { carMesh } from "./loaders.js";

// Camera state machine
export const CameraMode = Object.freeze({
    IDLE: 'IDLE',
    MOVING_FORWARD: 'MOVING_FORWARD',
    BRAKING: 'BRAKING',
    REVERSING: 'REVERSING',
    RETURNING_IDLE: 'RETURNING_IDLE',
    MOVING_LEFT: 'MOVING_LEFT',
    MOVING_RIGHT: 'MOVING_RIGHT',
    RETURNING_X: 'RETURNING_X',
    NAME_CAMERA: 'NAME_CAMERA',
});

// Camera context — holds current mode and per-mode animation state
const cameraCtx = {
    mode: CameraMode.IDLE,
    modeStartTime: null,

    // Z-axis animation state (vertical movement)
    startZ: 6.3,
    targetZ: 6.3,

    // X-axis animation state (horizontal movement)
    startX: 0,
    targetX: 0,

    // Y-axis animation state
    startY: 2.0,

    // Braking sub-phase (replaces isBrakingPhase: 0, 1, 2)
    brakingPhase: 0,

    // Turbo camera effect
    startTurboTime: null,

    // Name camera animation
    lookAtStart: new THREE.Vector3(),
    lookAtEnd: new THREE.Vector3(),
    lookAtStartTime: null,
    startQuat: new THREE.Quaternion(),
    endQuat: new THREE.Quaternion(),
};

function transitionTo(newMode) {
    const activeCamera = scene.userData.activeCamera;
    if (!activeCamera) return;

    // Snapshot current position for lerp start
    cameraCtx.startZ = activeCamera.position.z;
    cameraCtx.startX = activeCamera.position.x;
    cameraCtx.startY = activeCamera.position.y;
    cameraCtx.modeStartTime = performance.now();
    cameraCtx.mode = newMode;
}

export { cameraCtx };

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
export let cameraLookAtStart = new THREE.Vector3(); // Başlangıç bakış noktası
export let cameraLookAtEnd = new THREE.Vector3();   // Hedef bakış noktası
let cameraLookAtStartTime = null;            // Animasyon başlangıç zamanı
export const cameraLookAtDuration = 3000;
export const cameraLookAtDuration2 = 6000;
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

// Reusable objects for per-frame calculations (avoid GC pressure)
export const _tmpVec3A = new THREE.Vector3();
export const _tmpVec3B = new THREE.Vector3();
export const _tmpVec3C = new THREE.Vector3();
export const _tmpQuat = new THREE.Quaternion();

export let orbitControls = null;

// ================================================
// GETTER HELPERS (for animate() in main.js)
// ================================================
export function getIsMovingForward() { return isMovingForward; }
export function getIsMovingBackward() { return isMovingBackward; }
export function getIsMovingToIdle() { return isMovingToIdle; }
export function getIsStopped() { return isStopped; }
export function setIsStopped(v) { isStopped = v; }
export function setCameraAnimationStartTime(v) { cameraAnimationStartTime = v; }
export function setCurrentCameraZ(v) { currentCameraZ = v; }
export function getIsMovingLeft() { return isMovingLeft; }
export function getIsMovingRight() { return isMovingRight; }
export function getNameCameraBool() { return nameCameraBool; }
export function getCameraLookAtStartTime() { return cameraLookAtStartTime; }
export function setCameraLookAtStartTime(v) { cameraLookAtStartTime = v; }

// ================================================
// CAMERA INPUT — WASD / N key handlers
// ================================================
export function setupCameraInput(signal) {
    // Keydown handlers
    document.addEventListener('keydown', (event) => {
        const activeCamera = scene.userData.activeCamera;
        if (!activeCamera) return;
        const key = event.key.toLowerCase();

        // W — move camera forward (zoom out)
        if (key === 'w' && cameraCtx.mode !== CameraMode.MOVING_FORWARD) {
            transitionTo(CameraMode.MOVING_FORWARD);
        }

        // S — braking camera (zoom in closer)
        if (key === 's' && cameraCtx.mode !== CameraMode.BRAKING) {
            cameraCtx.brakingPhase = 0;
            transitionTo(CameraMode.BRAKING);
        }

        // A — move camera left
        if (key === 'a' && cameraCtx.mode !== CameraMode.MOVING_LEFT) {
            transitionTo(CameraMode.MOVING_LEFT);
        }

        // D — move camera right
        if (key === 'd' && cameraCtx.mode !== CameraMode.MOVING_RIGHT) {
            transitionTo(CameraMode.MOVING_RIGHT);
        }

        // N — toggle name camera
        if (key === 'n') {
            if (cameraCtx.mode !== CameraMode.NAME_CAMERA) {
                // Entering name camera
                cameraCtx.lookAtStart.copy(activeCamera.position.clone().add(
                    activeCamera.getWorldDirection(new THREE.Vector3())
                ));
                cameraCtx.lookAtEnd.set(60, 0, 130);
                cameraCtx.startQuat.copy(activeCamera.quaternion);
                activeCamera.lookAt(cameraCtx.lookAtEnd);
                cameraCtx.endQuat.copy(activeCamera.quaternion);
                activeCamera.quaternion.copy(cameraCtx.startQuat);
                cameraCtx.lookAtStartTime = performance.now();
                transitionTo(CameraMode.NAME_CAMERA);
                carMesh.remove(activeCamera);
                scene.add(activeCamera);
                orbitControls.enabled = false;
            } else {
                // Exiting name camera
                transitionTo(CameraMode.IDLE);
                scene.remove(activeCamera);
                carMesh.add(activeCamera);
            }
        }
    }, { signal });

    // Keyup handlers
    document.addEventListener('keyup', (event) => {
        const key = event.key.toLowerCase();

        // W released — return to idle Z position
        if (key === 'w') {
            transitionTo(CameraMode.RETURNING_IDLE);
        }

        // S released — reverse camera back
        if (key === 's') {
            cameraCtx.brakingPhase = 0;
            transitionTo(CameraMode.REVERSING);
        }

        // A/D released — return to center X position
        if (key === 'a' || key === 'd') {
            transitionTo(CameraMode.RETURNING_X);
        }
    }, { signal });
}

// ================================================
// ORBIT CONTROLS — O key toggle
// ================================================
export function setupOrbitToggle(signal) {
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
    }, { signal });
}

// ================================================
// UPDATE CAMERA (called every frame)
// ================================================
export function updateCamera() {
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

// ================================================
// CAMERA COMPOSER
// ================================================
export function setCameraComposer() {
    const activeCamera = scene.userData.activeCamera;
    if (activeCamera) {
        composer.passes[0].camera = activeCamera;
    }
}

// ================================================
// ORBIT CONTROLS SETUP
// ================================================
export function createOrbitControls() {
    if (scene.userData.activeCamera) {
        orbitControls = new OrbitControls(scene.userData.activeCamera, renderer.domElement);
        orbitControls.enabled = false; // Varsayılan olarak kapalı
    }
}

// ================================================
// EASING UTILITY
// ================================================
export function easeInOutSin(t) {
    return 0.5 * (1 - Math.cos(Math.PI * t));
}
