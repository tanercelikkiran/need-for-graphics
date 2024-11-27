import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {BloomPass} from "three/addons/postprocessing/BloomPass.js";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";


const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Sets the color of the background.
// renderer.setClearColor(0xFEFEFE);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 10000);

// Sets orbit control to move the camera around.
const orbit = new OrbitControls(camera, renderer.domElement);

// Camera positioning.
camera.position.set(1, 2, 5);
// Has to be done everytime we update the camera position.
orbit.update();

const renderScene = new RenderPass(scene, camera);
const composer = new EffectComposer(renderer);
composer.addPass(renderScene);

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.5,
    0.1,
    0.1
);
composer.addPass(bloomPass);

const geometry = new THREE.BoxGeometry( 10, 10, 10 );
const geometry2 = new THREE.BoxGeometry( 10, 0.1, 10 );
const light = new THREE.DirectionalLight( 0xffffff,0.1);
light.position.set( 0, 200, 100 );
const ambient = new THREE.AmbientLight( 0x707070 ); // soft white light

const material= new THREE.MeshPhongMaterial( { color: 0x4b4b4b } );
const material2= new THREE.MeshPhongMaterial( { color: 0x525257 } );
const cube = new THREE.Mesh( geometry, material );
const cube2 = new THREE.Mesh( geometry2, material2 );

scene.add(cube);
scene.add(cube2);
scene.add( light );
scene.add( ambient );

cube.position.set( 0, 0, -10 );
cube2.position.set( 0, 0, 0 );

const loader1 = new GLTFLoader();
const loader = new FBXLoader();

const textureLoader = new THREE.TextureLoader();

const atlas1 = textureLoader.load("public/ctextures/Atlas1.png")
const grade1 = textureLoader.load("public/ctextures/Grade1.png");
const grade2 = textureLoader.load("public/ctextures/Grade2.png");
const grass1= textureLoader.load("public/ctextures/Grass01.png");
const metal1 = textureLoader.load("public/ctextures/Metal.png");
const roads1 = textureLoader.load("public/ctextures/Roads.png");
const tires1 = textureLoader.load("public/ctextures/Tires.png");
const trafficcaratlas = textureLoader.load("public/ctextures/Traffic_Car_Atlas.png");
const trees1 = textureLoader.load("public/ctextures/Trees01.png");
const water1 = textureLoader.load("public/ctextures/Water.png");
const win1 = textureLoader.load("public/ctextures/Wins.png");

loader1.load(
    'public/cityfinal.glb', // veya 'path/to/your/model.glb'
    function (gltf) {
        // Model yüklendiğinde sahneye ekle
        scene.add(gltf.scene);
        console.log('Model loaded successfully!');
    },
    // function (xhr) {
    //     // Yükleme durumunu görüntüleme (isteğe bağlı)
    //     console.log((xhr.loaded / xhr.total * 100) + '% loaded');
    // },
    // function (error) {
    //     // Hata durumunu ele al
    //     console.error('An error happened:', error);
    // }
);

loader.load("public/car.fbx", function(object){
    const car = object;
    scene.add(object);
    orbit.target = object.position.clone();
    orbit.update();

    object.traverse( function(child){
        if (child.isMesh){
            console.log(child.material);
            child.castShadow = child.receiveShadow = true;
            if (child.material.name.includes('clear glassa')){
                makeTransparent(child.material);
            }
            if (child.name.includes("Studio_Car276")){
                makeRedTransparent(child.material);
            }
            if (child.name.includes("Studio_Car277")){
                metallicPaint(child.material);
            }
            if (child.name.includes("Studio_Car148")){
                whiteEmissive(child, 0xffffff, 20.0);

            }
            if (child.name.includes("Studio_Car149")){
                whiteEmissive(child, 0xffffff, 20.0);
            }
            if (child.name.includes("headlight1")){
                whiteEmissive(child, 0xffffff, 20.0);
                const { spotlight, volumetricLight } = createVolumetricLight(
                    child.getWorldPosition(new THREE.Vector3()),
                    new THREE.Vector3(child.position.x, child.position.y, child.position.z - 10),
                    0xDDE6FF,
                    10,
                    Math.PI / 4,
                    50
                );
                // const helper = new THREE.SpotLightHelper(spotlight);
                // scene.add(helper);

                scene.add(spotlight.target);
                scene.add(spotlight);
                scene.add(volumetricLight);
            }
            if (child.name.includes("headlight2")){
                whiteEmissive(child, 0xffffff, 20.0);
                const { spotlight, volumetricLight } = createVolumetricLight(
                    child.getWorldPosition(new THREE.Vector3()),
                    new THREE.Vector3(child.position.x, child.position.y, child.position.z - 10),
                    0xDDE6FF,
                    10,
                    Math.PI / 4,
                    50
                );
                // const helper = new THREE.SpotLightHelper(spotlight);
                // scene.add(helper);

                scene.add(spotlight.target);
                scene.add(spotlight);
                scene.add(volumetricLight);

            }
            if (child.name.includes("Studio_Car252_light1")) {
                redEmissive(child, 0xff3333, 5.0);
            }
            if (child.name.includes("Studio_Car252_light2")) {
                redEmissive(child, 0xff3333, 5.0);
            }
            if (child.name.includes("Studio_Car252_light3")) {
                redEmissive(child, 0xff3333, 5.0);
            }
            if (child.name.includes("Studio_Car236_light4")) {
                redEmissive(child, 0xff3333, 20.0);
            }
            if (child.name.includes("Studio_Car252_taillights1")) {
                redEmissive(child, 0xff3333, 20.0);
            }
            if (child.name.includes("platelight1")) {
                const pointLight = new THREE.PointLight(0xCDDCFF, 0.01, 1,5);
                pointLight.position.copy(child.position);

                child.add(pointLight);
            }
            if (child.name.includes("platelight2")) {
                const pointLight2 = new THREE.PointLight(0xCDDCFF, 0.01, 1,5);
                pointLight2.position.copy(child.position);

                child.add(pointLight2);
            }
            if (child.name.includes("Studio_Car252_taillights2")) {
                redEmissive(child, 0xff3333, 50.0);
            }
            if (child.name.includes("Studio_Car252_taillights3")) {
                redEmissive(child, 0xff3333, 50.0);
            }
            if (child.name.includes("Studio_Car252_taillights4")) {
                redEmissive(child, 0xff3333, 50.0);
            }
            if (child.name.includes("Studio_Car252_taillights5")) {
                redEmissive(child, 0xff3333, 50.0);
            }
            if (child.name.includes("Studio_Car252_taillights6")) {
                redEmissive(child, 0xff3333, 50.0);
            }
            if (child.name.includes("Studio_Car252_taillights7")) {
                redEmissive(child, 0xff3333, 50.0);
            }
            if (child.name.includes("Studio_Car252_taillights8")) {
                redEmissive(child, 0xff3333, 50.0);
            }
            if (child.name.includes("Studio_Car252_taillights9")) {
                redEmissive(child, 0xff3333, 50.0);
            }
        }
    });


    animate();

}, null, function(error){
    console.error(error);
})


// Creates a 12 by 12 grid helper.
const gridHelper = new THREE.GridHelper(12, 12);
scene.add(gridHelper);

// Creates an axes helper with an axis length of 4.
const axesHelper = new THREE.AxesHelper(4);
scene.add(axesHelper);

function animate() {
    //renderer.render(scene, camera);
    composer.render();
    requestAnimationFrame(animate);
}

// renderer.setAnimationLoop(animate);
animate();
window.addEventListener('resize', function() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

function makeTransparent(material) {
    material.transparent = true; // Şeffaflık modunu etkinleştir
    material.opacity = 0.5; // Şeffaflık oranı (0 tamamen görünmez, 1 tamamen opak)
    material.roughness = 0; // Cam yüzeyi pürüzsüz olmalı
    material.metalness = 0; // Cam için metalik etki gerekmez
    material.color.set(0x3F3F3F); // Hafif bir renk tonu (isteğe bağlı)
    material.envMapIntensity = 1; // Ortam yansıması (isteğe bağlı, HDRI kullanıyorsanız etkili olur)
}
function makeRedTransparent(material) {
    material.transparent = true; // Şeffaflık modunu etkinleştir
    material.opacity = 0.5; // Şeffaflık oranı (0 tamamen görünmez, 1 tamamen opak)
    material.roughness = 0; // Cam yüzeyi pürüzsüz olmalı
    material.metalness = 0; // Cam için metalik etki gerekmez
    material.color.set(0x5C0007); // Hafif bir renk tonu (isteğe bağlı)
    material.envMapIntensity = 1; // Ortam yansıması (isteğe bağlı, HDRI kullanıyorsanız etkili olur)
}
function metallicPaint(material) {
    material.roughness = 0.3; // Cam yüzeyi pürüzsüz olmalı
    material.metalness = 1.0; // Cam için metalik etki gerekmez
    material.color.set(0xF8CD02); // Hafif bir renk tonu (isteğe bağlı)
    material.envMapIntensity = 1; // Ortam yansıması (isteğe bağlı, HDRI kullanıyorsanız etkili olur)

}
function whiteEmissive(mesh, emissiveColor = 0xffffff, intensity = 20.0) {
    const emissiveMaterial = new THREE.MeshStandardMaterial({
        emissive: emissiveColor,
        emissiveIntensity: intensity,
    });
    mesh.material = emissiveMaterial;
}
function redEmissive(mesh, emissiveColor = 0xff3333, intensity) {
    const emissiveMaterial1 = new THREE.MeshStandardMaterial({
        emissive: emissiveColor,
        emissiveIntensity: intensity,
    });
    mesh.material = emissiveMaterial1;
}

function createVolumetricLight(position, targetPosition, color = 0xDDE6FF, intensity = 5, angle = Math.PI / 2, distance = 100) {
    // SpotLight
    const spotlight = new THREE.SpotLight(color, intensity, distance, angle, 1, 2);
    spotlight.position.copy(position);
    const targetOffset = new THREE.Vector3(0, -Math.tan(THREE.MathUtils.degToRad(5)) * position.distanceTo(targetPosition), 0);
    const adjustedTargetPosition = targetPosition.clone().add(targetOffset);

    spotlight.target.position.copy(adjustedTargetPosition);

    // Volumetrik Geometri
    const coneGeometry = new THREE.ConeGeometry(2, 10, 32, 1, true);
    const coneMaterial = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false,
    });

    const volumetricLight = new THREE.Mesh(coneGeometry, coneMaterial);
    const direction = new THREE.Vector3().subVectors(targetPosition, position).normalize();
    volumetricLight.position.set(position.x, position.y,position.z-2.45);
    volumetricLight.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);

    // Ölçeklendirme
    volumetricLight.scale.set(0, 0, 0);
    volumetricLight.rotateX(Math.PI);

    return { spotlight, volumetricLight };
}
