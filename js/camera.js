// camera.js — Camera system: animation, input, orbit controls.
// Consumes shared state from state.js, speed/turbo from vehicle.js, car mesh from loaders.js.
// Does NOT import from main.js.

import * as THREE from "three";
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { scene, renderer, composer, vehicle } from "./state.js";
import { getTurboVroom } from "./vehicle.js";
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

export { cameraCtx, transitionTo };

// ================================================
// KAMERA POZİSYONLARI - DİKEY HAREKET
// ================================================
const cameraStartZ = 6.3;   // Adjusted for a more dynamic view
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
export const cameraLookAtDuration = 3000;
export const cameraLookAtDuration2 = 6000;

// ================================================
// 9) KAMERA POZİSYONLARI - YATAY HAREKET
// ================================================
const cameraStartX = 0;
const cameraLeftTargetX = -1.2; // Wider camera movement for dramatic effect
const cameraRightTargetX = 1.2;
const cameraStartY = 2.0;

// Reusable objects for per-frame calculations (avoid GC pressure)
export const _tmpVec3A = new THREE.Vector3();
export const _tmpVec3B = new THREE.Vector3();
export const _tmpVec3C = new THREE.Vector3();
export const _tmpQuat = new THREE.Quaternion();

export let orbitControls = null;

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
    const activeCamera = scene.userData.activeCamera;
    if (!activeCamera) return;

    // Skip if orbit controls are active
    if (orbitControls && orbitControls.enabled) return;

    const elapsed = currentTime - cameraCtx.modeStartTime;

    switch (cameraCtx.mode) {
        case CameraMode.MOVING_FORWARD: {
            const velocity = vehicle.chassisBody.velocity.length();
            let turboEffect = 0;
            if (getTurboVroom()) {
                if (cameraCtx.startTurboTime === null) {
                    cameraCtx.startTurboTime = currentTime;
                }
                const turboElapsed = Math.min((currentTime - cameraCtx.startTurboTime) / 5000, 1);
                turboEffect = THREE.MathUtils.lerp(0.8, 2.4, turboElapsed);
            } else {
                cameraCtx.startTurboTime = null;
            }

            const cameraTargetZ = THREE.MathUtils.clamp(
                maxCameraTargetZ - velocity * speedFactor + turboEffect,
                minCameraTargetZ,
                maxCameraTargetZ + 3
            );

            if (elapsed >= cameraAnimationDuration3) {
                activeCamera.position.y = THREE.MathUtils.lerp(activeCamera.position.y, cameraStartY, 0.5);
                activeCamera.position.z = THREE.MathUtils.lerp(activeCamera.position.z, cameraTargetZ, 0.1);
            } else {
                const t = Math.min(elapsed / cameraAnimationDuration3, 1);
                const easeT = easeInOutSin(t);
                activeCamera.position.y = THREE.MathUtils.lerp(cameraCtx.startY, cameraStartY, easeT);
                activeCamera.position.z = THREE.MathUtils.lerp(cameraCtx.startZ, cameraTargetZ, easeT);
            }
            break;
        }

        case CameraMode.RETURNING_IDLE: {
            const t = Math.min(elapsed / cameraAnimationDuration1, 1);
            const easeT = easeInOutSin(t);
            activeCamera.position.z = THREE.MathUtils.lerp(cameraCtx.startZ, cameraBackZ, easeT);
            if (t === 1) cameraCtx.mode = CameraMode.IDLE;
            break;
        }

        case CameraMode.REVERSING: {
            const t = Math.min(elapsed / cameraAnimationDuration1, 1);
            const easeT = easeInOutSin(t);
            activeCamera.position.z = THREE.MathUtils.lerp(cameraCtx.startZ, backingCameraZ, easeT);
            if (t === 1) cameraCtx.mode = CameraMode.IDLE;
            break;
        }

        case CameraMode.BRAKING: {
            if (cameraCtx.brakingPhase === 0) {
                const t = Math.min(elapsed / cameraAnimationDuration1, 1);
                const easeT = easeInOutSin(t);
                activeCamera.position.y = THREE.MathUtils.lerp(cameraCtx.startY, cameraStartY, easeT);
                activeCamera.position.z = THREE.MathUtils.lerp(cameraCtx.startZ, brakingCameraZ, easeT);
                if (t === 1) {
                    cameraCtx.brakingPhase = 1;
                    cameraCtx.modeStartTime = currentTime;
                }
            } else if (cameraCtx.brakingPhase === 1) {
                if (elapsed >= cameraAnimationDuration1) {
                    cameraCtx.brakingPhase = 2;
                    cameraCtx.modeStartTime = currentTime;
                    cameraCtx.startZ = activeCamera.position.z;
                }
            } else if (cameraCtx.brakingPhase === 2) {
                const t = Math.min(elapsed / cameraAnimationDuration1, 1);
                const easeT = easeInOutSin(t);
                activeCamera.position.z = THREE.MathUtils.lerp(cameraCtx.startZ, rearingCameraZ, easeT);
                if (t === 1) cameraCtx.mode = CameraMode.IDLE;
            }
            break;
        }

        case CameraMode.MOVING_LEFT: {
            const t = Math.min(elapsed / cameraAnimationDuration2, 1);
            const easeT = easeInOutSin(t);
            activeCamera.position.x = THREE.MathUtils.lerp(cameraCtx.startX, cameraLeftTargetX, easeT);
            if (t === 1) cameraCtx.mode = CameraMode.IDLE;
            break;
        }

        case CameraMode.MOVING_RIGHT: {
            const t = Math.min(elapsed / cameraAnimationDuration2, 1);
            const easeT = easeInOutSin(t);
            activeCamera.position.x = THREE.MathUtils.lerp(cameraCtx.startX, cameraRightTargetX, easeT);
            if (t === 1) cameraCtx.mode = CameraMode.IDLE;
            break;
        }

        case CameraMode.RETURNING_X: {
            const t = Math.min(elapsed / cameraAnimationDuration2, 1);
            const easeT = easeInOutSin(t);
            activeCamera.position.x = THREE.MathUtils.lerp(cameraCtx.startX, cameraStartX, easeT);
            if (t === 1) cameraCtx.mode = CameraMode.IDLE;
            break;
        }

        case CameraMode.NAME_CAMERA: {
            // Position lerp: fly camera to elevated vantage point
            const posElapsed = currentTime - cameraCtx.modeStartTime;
            const posT = Math.min(posElapsed / 3000, 1);
            const posEase = easeInOutSin(posT);
            const nameTarget = new THREE.Vector3(60, 60, 40);
            activeCamera.position.lerpVectors(
                new THREE.Vector3(cameraCtx.startX, cameraCtx.startY, cameraCtx.startZ),
                nameTarget,
                posEase
            );

            // Quaternion slerp (existing logic below)
            if (cameraCtx.lookAtStartTime !== null) {
                const lookElapsed = currentTime - cameraCtx.lookAtStartTime;
                const t = Math.min(lookElapsed / cameraLookAtDuration, 1);
                const t2 = Math.min(lookElapsed / cameraLookAtDuration2, 1);

                _tmpVec3A.lerpVectors(cameraCtx.lookAtStart, cameraCtx.lookAtEnd, t);
                _tmpVec3B.copy(activeCamera.position);
                _tmpVec3C.subVectors(_tmpVec3A, _tmpVec3B).normalize();

                activeCamera.getWorldDirection(_tmpVec3A).normalize();
                _tmpQuat.setFromUnitVectors(_tmpVec3A, _tmpVec3C);
                activeCamera.quaternion.slerp(_tmpQuat, t2);

                if (t === 1) cameraCtx.lookAtStartTime = null;
            }
            break;
        }

        case CameraMode.IDLE:
        default:
            // No animation — camera follows car
            break;
    }

    // Name camera has its own position/orientation, skip lookAt
    if (cameraCtx.mode !== CameraMode.NAME_CAMERA) {
        _tmpVec3A.set(
            vehicle.chassisBody.position.x,
            vehicle.chassisBody.position.y + 0.9,
            vehicle.chassisBody.position.z
        );
        activeCamera.lookAt(_tmpVec3A);
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
