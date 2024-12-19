import {loadMap, loadCar, loadHDR, carMesh, wheelMeshes} from './loaders.js';

import * as THREE from "three";
import * as CANNON from "cannon-es";
import CannonDebugger from "cannon-es-debugger";

import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import Stats from 'three/addons/libs/stats.module.js';

let camera, scene, renderer, composer, orbit, stats;
let world, cannonDebugger, vehicle, carSize, carCenter;

function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 500);

    renderer = new THREE.WebGLRenderer({antialias: false});
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);// HDR renk kodlaması
    renderer.toneMapping = THREE.ReinhardToneMapping; // Tonemapping
    renderer.toneMappingExposure = 1.2; // Tonemapping parlaklık ayarı
    renderer.shadowMap.enabled = false;
    document.body.appendChild(renderer.domElement);

    orbit = new OrbitControls(camera, renderer.domElement);
    camera.position.set(1, 2, 5);
    orbit.update();

    const renderScene = new RenderPass(scene, camera);
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
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
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
    groundBody.quaternion.setFromEuler(-Math.PI / 2, Math.PI/24, 0); // Rotate plane to be horizontal
    world.addBody(groundBody);

    cannonDebugger = new CannonDebugger(scene, world);
}

function createVehicle() {
    carCenter = new THREE.Vector3();
    carSize = new THREE.Vector3();
    const boundingBox = new THREE.Box3().setFromObject(carMesh);

    boundingBox.getSize(carSize);

    const chassisShape = new CANNON.Box(new CANNON.Vec3(carSize.x / 2,  carSize.y / 2, carSize.z / 2));
    const chassisBody = new CANNON.Body({
        mass: 1500,
        shape: chassisShape
    });

    //Get the center of the car

    boundingBox.getCenter(carCenter);
    chassisBody.position.set(carCenter.x/2, carCenter.y/2 + 0.5, carCenter.z/2);

    vehicle = new CANNON.RaycastVehicle({
        chassisBody: chassisBody,
        indexRightAxis: 0,
        indexUpAxis: 1,
        indexForwardAxis: 2
    });

    const wheelOptions = {
        mass: 20,
        radius: 0.4,
        directionLocal: new CANNON.Vec3(0, -1, 0),
        suspensionStiffness: 30,
        suspensionRestLength: 0.3,
        frictionSlip: 5,
        dampingRelaxation: 2.3,
        dampingCompression: 4.4,
        maxSuspensionForce: 100000,
        rollInfluence: 0.01,
        axleLocal: new CANNON.Vec3(1, 0, 0),
        chassisConnectionPointLocal: new CANNON.Vec3(1, 1, 2), // To be set for each wheel
        maxSuspensionTravel: 0.3,
        customSlidingRotationalSpeed: -30
    }

    let wheelCenter = new THREE.Vector3();
    let wheelSize = new THREE.Vector3();

    //Front-left wheel
    const wheelBoundingBox = new THREE.Box3().setFromObject(wheelMeshes.leftFront);
    wheelBoundingBox.getSize(wheelSize);
    wheelBoundingBox.getCenter(wheelCenter);
    wheelOptions.chassisConnectionPointLocal.set(wheelCenter.x, 0, wheelCenter.z);
    vehicle.addWheel(wheelOptions);

    //Front-right wheel
    wheelBoundingBox.setFromObject(wheelMeshes.rightFront);
    wheelBoundingBox.getSize(wheelSize);
    wheelBoundingBox.getCenter(wheelCenter);
    wheelOptions.chassisConnectionPointLocal.set(wheelCenter.x, 0, wheelCenter.z);
    vehicle.addWheel(wheelOptions);

    //Rear-left wheel
    wheelBoundingBox.setFromObject(wheelMeshes.leftBack);
    wheelBoundingBox.getSize(wheelSize);
    wheelBoundingBox.getCenter(wheelCenter);
    wheelOptions.chassisConnectionPointLocal.set(wheelCenter.x, 0, wheelCenter.z);
    vehicle.addWheel(wheelOptions);

    //Rear-right wheel
    wheelBoundingBox.setFromObject(wheelMeshes.rightBack);
    wheelBoundingBox.getSize(wheelSize);
    wheelBoundingBox.getCenter(wheelCenter);
    wheelOptions.chassisConnectionPointLocal.set(wheelCenter.x, 0, wheelCenter.z);
    vehicle.addWheel(wheelOptions);

    vehicle.addToWorld(world);
}

//############################################################################################################
//####  MAIN FUNCTION  #######################################################################################
//############################################################################################################

// Vehicle controls
let forwardForce = 0;
let steeringValue = 0;
const maxSteerVal = Math.PI / 8; // Maximum steering angle
const maxForce = 5000; // Maximum engine force

document.addEventListener('keydown', (event) => {
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

function animate() {
    renderer.render(scene, camera);
    stats.begin();
    composer.render();

    cannonDebugger.update();
    world.step(1/60);

    try {
        // Update chassis position and rotation
        const position = vehicle.chassisBody.position;
        carMesh.position.copy(new THREE.Vector3(position.x, position.y- (carSize.y/2), position.z));
        carMesh.quaternion.copy(vehicle.chassisBody.quaternion);

        //Front-left wheel
        wheelMeshes.leftFront.position.copy(vehicle.wheelInfos[0].worldTransform.position);
        wheelMeshes.leftFront.quaternion.copy(vehicle.wheelInfos[0].worldTransform.quaternion);
        wheelMeshes.leftFront.rotateZ(-Math.PI); // Maintain vertical orientation
        wheelMeshes.leftFront.rotateX(-Math.PI/2); // Maintain vertical orientation

        //Front-right wheel
        wheelMeshes.rightFront.position.copy(vehicle.wheelInfos[1].worldTransform.position);
        wheelMeshes.rightFront.quaternion.copy(vehicle.wheelInfos[1].worldTransform.quaternion);
        wheelMeshes.rightFront.rotateZ(-Math.PI); // Maintain vertical orientation
        wheelMeshes.rightFront.rotateX(-Math.PI/2); // Maintain vertical orientation
        //Rear-left wheel
        wheelMeshes.leftBack.position.copy(vehicle.wheelInfos[2].worldTransform.position);
        wheelMeshes.leftBack.quaternion.copy(vehicle.wheelInfos[2].worldTransform.quaternion);
        wheelMeshes.leftBack.rotateZ(-Math.PI); // Maintain vertical orientation

        //Rear-right wheel
        wheelMeshes.rightBack.position.copy(vehicle.wheelInfos[3].worldTransform.position);
        wheelMeshes.rightBack.quaternion.copy(vehicle.wheelInfos[3].worldTransform.quaternion);
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
    loadCar(scene, orbit).then(createVehicle);
    loadHDR(scene, renderer);
    animate();
}

main();