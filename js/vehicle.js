// vehicle.js — Vehicle physics, controls, input, and turbo logic.
// Consumes shared state from state.js and assets from loaders.js.
// Does NOT import from main.js (avoids circular dependency).

import * as THREE from "three";
import * as CANNON from "cannon-es";
import {
    scene, world, vehicle, carSize, isBraking, isTurboActive, selectedCarNo, objects,
    setVehicle, setCarSize, setIsBraking, setIsTurboActive,
} from "./state.js";
import { carMesh, wheelMeshes, bmwAcc, porscheAcc, jeepAcc, turboSound } from "./loaders.js";

// ================================================
// 1) ARACIN GIRIS / DURUM FLAGLERI
// ================================================
let isAccelerating = false;
let isSteeringLeft = false;
let isSteeringRight = false;
let isHandBraking = false;

// ================================================
// 2) ARACIN ANLIK MOTOR & DIREKSIYON
// ================================================
let currentEngineForce = 0;
let currentSteering = 0;

// ================================================
// 3) TEMEL AYARLAR
// ================================================
let maxEngineForce = 4500;  // Sports cars have more powerful engines
const engineRamp = 800;   // Faster throttle response
const brakeForce = 50;   // Stronger braking force

// ================================================
// 4) DIREKSIYON VE DAMPING AYARLARI
// ================================================
const maxSteerVal = Math.PI / 7;  // Steering range remains the same (~45 degrees)
const steerSpeed = 0.01;         // Reduced steering speed (slower turns)
const steerDamping = 0.1;         // Increased damping (slower return to center)
// ================================================
// 5) HIZ BAZLI DIREKSIYON AYARLARI
// ================================================
const speedLimit = 80;       // Higher speed before steering reduces (~288 km/h)
const minSteerFactor = 0.2;      // Steering effectiveness drops less at high speeds
const mediumSpeed = 30;       // Medium speed (~108 km/h)
const mediumSteerFactor = 1.0;      // Full steering effectiveness below mediumSpeed
const steerFalloff = 0.001;    // Slightly less aggressive falloff

// ================================================
// 6) FREN ANINDA EKSTRA DIREKSIYON KISITLAMASI
// ================================================
const brakeSteerMultiplier = 0.7;    // Slightly more forgiving during braking

// ================================================
// 7) EL FRENI & DRIFT AYARLARI
// ================================================
const handbrakeForce = 400;          // Stronger handbrake for drifting
const driftSlip = 0.7;          // Lower friction for drifting
const normalSlip = 4.8;          // Slightly more slippery tires for agility

// ================================================
// 8) TOP SPEED VE IVMELENME AYARLARI
// ================================================
let maxSpeed = 304 / 3.6; // Maksimum hiz (304 km/h -> m/s)
const rearMaxSpeed = 70 / 3.6;
const engineDropFactor = 0.7;

// ================================================
// 9) TURBO
// ================================================
let turboLevel = 100;
const turboDecayRate = 100 / (5 * 60);
let turboVroom = false;
let startTurboTime = null;
let turboBaseForce = maxEngineForce;

// ================================================
// OBJECT BODIES (populated by createObjects)
// ================================================
let objectBodies = [];

// ================================================
// CAR CONFIGS
// ================================================
// 0 = BMW, 1 = Porsche, 2 = Jeep
const baseWheelOptions = {
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
};

const CAR_CONFIGS = [
    { mass: 1504, wheelOverrides: { suspensionStiffness: 50 } },           // BMW
    { mass: 1420, wheelOverrides: {} },                                    // Porsche
    { mass: 2306, wheelOverrides: { radius: 0.42 } },                      // Jeep
];

// ================================================
// EXPORTED FUNCTIONS
// ================================================

export function getXZSpeed(body) {
    const v = body.velocity;
    return Math.sqrt(v.x * v.x + v.z * v.z);
}

export function getTurboVroom() { return turboVroom; }
export function getStartTurboTime() { return startTurboTime; }
export function setStartTurboTime(v) { startTurboTime = v; }

export function updateWheelFriction(veh, newFrictionSlip) {
    veh.wheelInfos.forEach((wheel) => {
        wheel.frictionSlip = newFrictionSlip;
    });
    veh.updateWheelTransform(0);
    veh.updateWheelTransform(1);
    veh.updateWheelTransform(2);
    veh.updateWheelTransform(3);
}

/**
 * Create the CANNON.RaycastVehicle for the selected car.
 * @param {CANNON.Material} bodyMaterial - chassis contact material
 * @param {CANNON.Material} wheelMaterial - wheel contact material
 * @param {Array} materialGroups - collision group definitions
 */
export function createVehicle(bodyMaterial, wheelMaterial, materialGroups) {

    const config = CAR_CONFIGS[selectedCarNo];
    const vehicleMass = config.mass;
    const wheelOptions = { ...baseWheelOptions, ...config.wheelOverrides };

    setCarSize(new THREE.Vector3());
    const boundingBox = new THREE.Box3().setFromObject(carMesh);
    boundingBox.getSize(carSize);

    let chassisShape;
    if (selectedCarNo === 0) {
        chassisShape = new CANNON.Box(new CANNON.Vec3(carSize.x / 2, (carSize.y / 2) - 0.02, carSize.z / 2));
    } else if (selectedCarNo === 1) {
        chassisShape = new CANNON.Box(new CANNON.Vec3(carSize.x / 2, (carSize.y / 2) - 0.02, carSize.z / 2));
    } else if (selectedCarNo === 2) {
        chassisShape = new CANNON.Box(new CANNON.Vec3(carSize.x / 2, (carSize.y / 2) - 0.20, carSize.z / 2));
    }

    const chassisBody = new CANNON.Body({
        mass: vehicleMass,
    });
    let chassisOffset;
    if (selectedCarNo === 0) {
        chassisOffset = new CANNON.Vec3(0, 0.12, 0);
    } else if (selectedCarNo === 1) {
        chassisOffset = new CANNON.Vec3(0, 0.10, 0);
    } else if (selectedCarNo === 2) {
        chassisOffset = new CANNON.Vec3(0, 0.45, 0);
    }
    chassisBody.addShape(chassisShape, chassisOffset);
    let pos = carMesh.position.clone();
    chassisBody.position.copy(pos);
    carMesh.rotation.y = Math.PI;
    chassisBody.quaternion.setFromEuler(carMesh.rotation.x, carMesh.rotation.y, carMesh.rotation.z);
    chassisBody.angularVelocity.set(0, 0, 0); // Initial angular velocity
    chassisBody.threemesh = carMesh;
    chassisBody.material = bodyMaterial;
    chassisBody.collisionFilterGroup = materialGroups[1].group;
    chassisBody.collisionFilterMask = materialGroups[1].mask;

    setVehicle(new CANNON.RaycastVehicle({
        chassisBody: chassisBody,
        indexRightAxis: 0,
        indexUpAxis: 1,
        indexForwardAxis: 2
    }));

    let wheelCenter = new THREE.Vector3();
    let wheelSize = new THREE.Vector3();
    let wheelBodies = [];

    wheelMeshes.forEach(function (wheelMesh) {
        const boundingBox = new THREE.Box3().setFromObject(wheelMesh);
        boundingBox.getCenter(wheelCenter);
        boundingBox.getSize(wheelSize);

        const shape = new CANNON.Cylinder(wheelSize.y / 2, wheelSize.y / 2, wheelSize.x, 40);
        const wheelBody = new CANNON.Body({
            mass: wheelOptions.mass,
            type: CANNON.Body.KINEMATIC,
        });
        const q = new CANNON.Quaternion();
        q.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), -Math.PI / 2);
        wheelBody.addShape(shape, new CANNON.Vec3(), q);
        wheelBody.position.copy(wheelCenter);
        wheelBody.threemesh = wheelMesh;
        wheelBody.material = wheelMaterial;
        wheelBody.collisionFilterGroup = materialGroups[2].group;
        wheelBody.collisionFilterMask = materialGroups[2].mask;
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
            // Lastiklerin fiziksel pozisyon ve donusunu guncelle
            vehicle.updateWheelTransform(index);
            const wheelTransform = vehicle.wheelInfos[index].worldTransform;

            // Fizik motoru lastiklerinin pozisyonunu ve donusunu uygulayin
            wheelBody.position.copy(wheelTransform.position);
            wheelBody.quaternion.copy(wheelTransform.quaternion);

            // Gorsel lastikleri fizik motoruyla senkronize edin
            if (wheelBodies[index].threemesh) {
                wheelBodies[index].threemesh.position.copy(wheelBody.position);
                wheelBodies[index].threemesh.quaternion.copy(wheelBody.quaternion);
            }
        });
    });

    vehicle.addToWorld(world);
}

/**
 * Create physics bodies for moveable objects.
 * @param {CANNON.Material} objectMaterial - contact material for objects
 * @param {Array} materialGroups - collision group definitions
 */
export function createObjects(objectMaterial, materialGroups) {
    for (let i = 0; i < objects.length; i++) {
        let object = objects[i];
        scene.add(object);
        let size = new THREE.Vector3();
        let meshQuaternion = new THREE.Quaternion();
        meshQuaternion.copy(object.quaternion);
        object.quaternion.set(0, 0, 0, 1);
        let boundingBox = new THREE.Box3().setFromObject(object);
        boundingBox.getSize(size);

        object.quaternion.copy(meshQuaternion);

        const boxShape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));
        const boxBody = new CANNON.Body({
            mass: 5,
            material: objectMaterial
        });
        const offset = new CANNON.Vec3(0, size.y * 0.5, 0);
        boxBody.addShape(boxShape, offset);
        boxBody.position.copy(object.position);
        boxBody.quaternion.copy(object.quaternion);
        boxBody.threemesh = object;
        boxBody.material = objectMaterial;
        boxBody.collisionFilterGroup = materialGroups[3].group;
        boxBody.collisionFilterMask = materialGroups[3].mask;

        objectBodies.push(boxBody);
        world.addBody(boxBody);
    }
}

export function playAccelerationSound(carIndex) {
    if (carIndex === 0 && bmwAcc) {
        bmwAcc.play();
    } else if (carIndex === 1 && porscheAcc) {
        porscheAcc.play();
    } else if (carIndex === 2 && jeepAcc) {
        jeepAcc.play();
    }
}


export function updateVehicleControls() {
    //---------------------------
    // 1) Aracin anlik hizini olc
    //---------------------------
    // Sadece XZ duzlemindeki hiz (m/s)
    const speed = getXZSpeed(vehicle.chassisBody);

    //---------------------------
    // 2) Direksiyon oranini hesapla
    //---------------------------

    // 2B) "speedRatio2": speedLimit'e gore
    //    - 0 -> speed=0, 1 -> speed=speedLimit ya da ustu
    let speedRatio2 = speed / speedLimit;
    if (speedRatio2 > 1) speedRatio2 = 1;  // clamp

    // 2C) Non-linear (ornegin dairesel) dusus.
    //    1 / (1 + steerFalloff * speed^2) -> Yuksek hizda agresif dusus
    const nonLinearFactor = 1 / (1 + steerFalloff * speed * speed);

    // Simdi bu 3 "faktor"u birlestirelim.
    // Ornegin:
    // - Dusuk hizda (0~mediumSpeed) tam direksiyon (mediumSteerFactor=1).
    // - mediumSpeed ustunde artarak kisitla, speedLimit'te minSteerFactor'e kadar dus.
    // - Non-linear factor de devrede, ama istersen "blend" edebilirsin.

    // Asagida basit bir blend ornegi:
    // direksiyonFactor = nonLinearFactor * lineerFactor
    // lineerFactor = lerp(mediumSteerFactor, minSteerFactor, speedRatio2)
    const linearFactor = mediumSteerFactor +
        (minSteerFactor - mediumSteerFactor) * speedRatio2;

    let steerFactor = nonLinearFactor * linearFactor;
    // steerFactor asiri dusuk olmasin
    if (steerFactor < 0.5) steerFactor = 0.5;

    // 2D) Frenliyorsak (isBraking) direksiyon limitini biraz daha kis
    if (isBraking) {
        steerFactor *= brakeSteerMultiplier;  // ~%60'a dusur
    }

    // Sonuc olarak bu frame'deki maks direksiyon
    const effectiveMaxSteer = maxSteerVal * steerFactor;

    //---------------------------
    // 3) Motor Gucu
    //---------------------------
    if (isAccelerating) {
        playAccelerationSound(selectedCarNo);
        currentEngineForce = Math.min(
            currentEngineForce + engineRamp,
            maxEngineForce
        );
    } else if (isBraking) {
        if (bmwAcc && bmwAcc.isPlaying) bmwAcc.stop();
        if (porscheAcc && porscheAcc.isPlaying) porscheAcc.stop();
        if (jeepAcc && jeepAcc.isPlaying) jeepAcc.stop();
        // Geri vitese mi alsin yoksa fren mi yapsin?
        // Basitce "geri" yaklaşımlardan biri:

        currentEngineForce = Math.max(
            currentEngineForce - engineRamp,
            -maxEngineForce * 1
        )
    } else {
        if (bmwAcc && bmwAcc.isPlaying) bmwAcc.stop();
        if (porscheAcc && porscheAcc.isPlaying) porscheAcc.stop();
        if (jeepAcc && jeepAcc.isPlaying) jeepAcc.stop();
        // Ne gaz ne fren
        const dampingFactor = 0.995; // Hizini azalmak icin katsayi
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
    // Eger hizimiz ileri yonluyse ve S basiliysa, fren uygula
    if (isBraking) {
        brakingValue = brakeForce;
    }

    //---------------------------
    // 5) Direksiyon
    //---------------------------
    if (isSteeringLeft) {
        // Sola dogru yavasca art
        currentSteering = Math.min(currentSteering + steerSpeed, effectiveMaxSteer);
    } else if (isSteeringRight) {
        // Saga dogru yavasca art
        currentSteering = Math.max(currentSteering - steerSpeed, -effectiveMaxSteer);
    } else {
        // Ortalamaya don (damping)
        if (currentSteering > 0) {
            currentSteering = Math.max(currentSteering - steerDamping, 0);
        } else {
            currentSteering = Math.min(currentSteering + steerDamping, 0);
        }
    }

    //---------------------------
    // 5.5) Ivmelenme
    //---------------------------

    if (selectedCarNo === 0) {
        maxSpeed = 243 / 3.6;
    } else if (selectedCarNo === 1) {
        maxSpeed = 304 / 3.6;
    } else if (selectedCarNo === 2) {
        maxSpeed = 156 / 3.6;
    }
    if (isBraking) {
        if (speed >= rearMaxSpeed) {
            currentEngineForce = 0;
        } else {
            const speedRatio = speed / rearMaxSpeed;
            const effectiveEngineForce = maxEngineForce * (1 - speedRatio * engineDropFactor);
            currentEngineForce = Math.min(currentEngineForce, effectiveEngineForce);
        }
    } else {
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
    // Frenleri sifirla
    vehicle.setBrake(0, 0);
    vehicle.setBrake(0, 1);
    vehicle.setBrake(0, 2); // Arka sol
    vehicle.setBrake(0, 3); // Arka sag
    // ( dort tekerlege fren yapmak istiyorsan 2 ve 3. index'e de setBrake uygula)

    // 3) Normal fren (or. S tusu) varsa on tekerleklere uygula
    if (isBraking) {
        vehicle.setBrake(brakingValue, 0);  // front-left
        vehicle.setBrake(brakingValue, 1);  // front-right
    }

    // 4) El freni aktifse, arka tekerleklere yuksek fren
    if (isHandBraking) {
        vehicle.setBrake(handbrakeForce, 2); // rear-left
        vehicle.setBrake(handbrakeForce, 3); // rear-right
    }

    // Motor kuvveti -> genelde on tekerler
    vehicle.applyEngineForce(currentEngineForce, 0);
    vehicle.applyEngineForce(currentEngineForce, 1);

    // Direksiyon
    vehicle.setSteeringValue(currentSteering, 0);
    vehicle.setSteeringValue(currentSteering, 1);
    updateSpeedometer();
    updateSpeedSlider();
    updateTurbometer();
    updateTurboSlider();
}

export function updateSpeedometer() {
    const speed = getXZSpeed(vehicle.chassisBody);  // XZ duzlemindeki hiz
    const speedKmH = Math.round(speed * 3.6);  // m/s'den km/h'ye donusum (3.6 ile carp)
    const speedometerText = document.getElementById('speed-value');
    speedometerText.textContent = `Speed ${speedKmH}KM`;
}

export function updateSpeedSlider() {
    const speed = getXZSpeed(vehicle.chassisBody);  // XZ duzlemindeki hiz
    const sliderFill = document.getElementById('speed-slider-fill');
    const tSpeed = 304 / 3.6;
    const fillPercentage = (speed / tSpeed) * 100;
    sliderFill.style.width = `${fillPercentage}%`;
}

export function updateTurbometer() {
    const turbometerText = document.getElementById('turbo-value');
    turbometerText.textContent = `Turbo ${turboLevel.toFixed(0)}%`;
}

export function updateTurboSlider() {
    const turbosliderFill = document.getElementById('turbo-slider-fill');
    turbosliderFill.style.width = `${turboLevel}%`;
}

export function updateTurbo(deltaTime) {
    if (isTurboActive && turboLevel > 0 && isAccelerating) {
        turboVroom = true;
        turboSound.play();
        maxEngineForce = turboBaseForce * 1.5;
        turboLevel -= turboDecayRate * deltaTime * 60; // Her karede nitro seviyesi azalir
        if (turboLevel <= 0) {
            turboLevel = 0;
            setIsTurboActive(false); // Turbo sifirlandiginda devre disi
            turboVroom = false;
        }
    } else {
        maxEngineForce = turboBaseForce; // Nitro aktif degilse motor gucu varsayilana doner
        turboVroom = false;
        turboSound.stop();
        if (turboLevel < 100) {
            turboLevel += 0.01 * deltaTime * 60;
            if (turboLevel > 100) {
                turboLevel = 100;
            }
        }
    }
}

/**
 * Sync physics object bodies to their Three.js meshes.
 * Called once per frame from animate().
 */
export function syncObjectBodies() {
    objectBodies.forEach((body) => {
        body.threemesh.position.copy(body.position);
        body.threemesh.quaternion.copy(body.quaternion);
    });
}

/**
 * Register WASD/Space/Shift input handlers for vehicle control.
 * @param {AbortSignal} signal - abort signal for cleanup on scene transitions
 */
export function setupVehicleInput(signal) {
    document.addEventListener('keydown', (event) => {
        const key = event.key.toLowerCase();
        switch (key) {
            case 'w':
                isAccelerating = true;
                setIsBraking(false);
                break;
            case 's':
                setIsBraking(true);
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
                // Istege bagli: Arka tekerlekleri kaygan yapmak
                vehicle.wheelInfos[2].frictionSlip = driftSlip; // Rear-left
                vehicle.wheelInfos[3].frictionSlip = driftSlip; // Rear-right
                break;
        }
    }, { signal });

    document.addEventListener('keyup', (event) => {
        const key = event.key.toLowerCase();
        switch (key) {
            case 'w':
                isAccelerating = false;
                break;
            case 's':
                setIsBraking(false);
                break;
            case 'a':
                isSteeringLeft = false;
                break;
            case 'd':
                isSteeringRight = false;
                break;
            case ' ':
                // Space birakildi -> el freni off
                isHandBraking = false;
                // Tekerlekleri tekrar normal suretune ayarla
                vehicle.wheelInfos[2].frictionSlip = normalSlip;
                vehicle.wheelInfos[3].frictionSlip = normalSlip;
                break;
        }
    }, { signal });

    // Turbo key handlers
    document.addEventListener('keydown', (event) => {
        if (event.key.toLowerCase() === 'shift' && turboLevel > 0) {
            setIsTurboActive(true);
        }
    }, { signal });

    document.addEventListener('keyup', (event) => {
        if (event.key.toLowerCase() === 'shift') {
            setIsTurboActive(false);
        }
    }, { signal });
}
