import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {RGBELoader} from "three/addons/loaders/RGBELoader.js";
import Stats from 'three/addons/libs/stats.module.js';

const stats = new Stats();
stats.showPanel(0); // 0 = FPS, 1 = MS, 2 = MB, 3+ = özel
document.body.appendChild(stats.dom);


const renderer = new THREE.WebGLRenderer({antialias: false});
renderer.setSize(window.innerWidth, window.innerHeight);// HDR renk kodlaması
renderer.toneMapping = THREE.ReinhardToneMapping; // Tonemapping
renderer.toneMappingExposure = 1.2; // Tonemapping parlaklık ayarı
renderer.shadowMap.enabled = false;
document.body.appendChild(renderer.domElement);

new RGBELoader().load('public/hdri.hdr', function (texture) {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture;
    scene.background = texture;
    scene.environment.intensity = 0.2;
});
// Sets the color of the background.
// renderer.setClearColor(0xFEFEFE);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 500);

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
    0.8,
    0.4,
    0.2
);
composer.addPass(bloomPass);



const loader1 = new GLTFLoader();
const loader = new FBXLoader();

const textureLoader = new THREE.TextureLoader();


loader1.load(
    'public/cityfinal.glb', // veya 'path/to/your/model.glb'
    function (gltf) {
        // Model yüklendiğinde sahneye ekle
        scene.add(gltf.scene);
        console.log('Model loaded successfully!');

        // gltf.scene.traverse(function (child) {
        //     if (child.isMesh && child.name.includes("PLight")) {
        //
        //         // Mevcut konumda PointLight oluştur
        //         const pointLight = new THREE.PointLight(0xFFF0CC, 4, 50, 1); // Renk, yoğunluk, mesafe, azalma
        //         pointLight.position.copy(child.position);
        //
        //         // PointLight'ı sahneye ekle
        //         scene.add(pointLight);
        //     }
        // });

    },
    null,
    function (error) {
        // Hata durumunu ele al
        console.error('An error happened:', error);
    }
);


loader.load("public/car.fbx", function(object){
    const car = object;
    scene.add(object);
    orbit.target = object.position.clone();
    orbit.update();

    const carLight = new THREE.PointLight(0xFFF0CC, 20, 50);
    carLight.position.set(0, 5 , 5);
    car.add(carLight);

    object.traverse( function(child){
        if (child.isMesh){
            child.castShadow = child.receiveShadow = true;
            if (child.name.includes("Studio_Car66") || child.material.name.includes('clear glass')){
                transparent(child.material, 0x3F3F3F);
            }
            if (child.name.includes("Studio_Car276")){
                transparent(child.material, 0x5C0007);
            }
            if (child.name.includes("Studio_Car277")){
                metallicPaint(child.material);
            }
            if (child.name.includes("Studio_Car148")){
                emissiveLight(child, 0xffffff, 20.0);
            }
            if (child.name.includes("Studio_Car149")){
                emissiveLight(child, 0xffffff, 20.0);
            }
            if (child.name.includes("headlight1") || child.name.includes("headlight2")){
                emissiveLight(child, 0xffffff, 20.0);
                const spotlight1 = spotlight(
                    child.getWorldPosition(new THREE.Vector3()),
                    new THREE.Vector3(child.position.x, child.position.y, child.position.z - 10));
                scene.add(spotlight1.target);
                scene.add(spotlight1);
            }
            if (child.name.includes("Studio_Car252_light1")) {
                emissiveLight(child, 0xff3333, 5.0);
            }
            if (child.name.includes("Studio_Car252_light2")) {
                emissiveLight(child, 0xff3333, 5.0);
            }
            if (child.name.includes("Studio_Car252_light3")) {
                emissiveLight(child, 0xff3333, 5.0);
            }
            if (child.name.includes("Studio_Car236_light4")) {
                emissiveLight(child, 0xff3333, 20.0);
            }
            if (child.name.includes("Studio_Car252_taillights1")) {
                emissiveLight(child, 0xff3333, 20.0);
            }
            if (child.name.includes("platelight1")) {

                const pointLight1 = pointLight(child.position, 0xCDDCFF, 0.01, 1, 5);
                child.add(pointLight1);
            }
            if (child.name.includes("platelight2")) {
                const pointLight2 = pointLight(child.position, 0xCDDCFF, 0.01, 1, 5);
                child.add(pointLight2);
            }
            if (child.name.includes("Studio_Car252_taillights2")) {
                emissiveLight(child, 0xff3333, 50.0);
            }
            if (child.name.includes("Studio_Car252_taillights3")) {
                emissiveLight(child, 0xff3333, 50.0);
            }
            if (child.name.includes("Studio_Car252_taillights4")) {
                emissiveLight(child, 0xff3333, 50.0);
            }
            if (child.name.includes("Studio_Car252_taillights5")) {
                emissiveLight(child, 0xff3333, 50.0);
            }
            if (child.name.includes("Studio_Car252_taillights6")) {
                emissiveLight(child, 0xff3333, 50.0);
            }
            if (child.name.includes("Studio_Car252_taillights7")) {
                emissiveLight(child, 0xff3333, 50.0);
            }
            if (child.name.includes("Studio_Car252_taillights8")) {
                emissiveLight(child, 0xff3333, 50.0);
            }
            if (child.name.includes("Studio_Car252_taillights9")) {
                emissiveLight(child, 0xff3333, 50.0);
            }
        }
    });
    animate();
},
    null, function(error){
    console.error(error);
    })


function animate() {
    //renderer.render(scene, camera);
    stats.begin();
    composer.render();
<<<<<<< Updated upstream
    

=======
    stats.end();
>>>>>>> Stashed changes
    requestAnimationFrame(animate);
}


// renderer.setAnimationLoop(animate);
animate();

window.addEventListener('resize', function() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

function transparent(material, color) {
    material.transparent = true; // Şeffaflık modunu etkinleştir
    material.opacity = 0.5; // Şeffaflık oranı (0 tamamen görünmez, 1 tamamen opak)
    material.roughness = 0; // Cam yüzeyi pürüzsüz olmalı
    material.metalness = 0; // Cam için metalik etki gerekmez
    material.color.set(color); // Hafif bir renk tonu (isteğe bağlı)
    material.envMapIntensity = 1; // Ortam yansıması (isteğe bağlı, HDRI kullanıyorsanız etkili olur)
}

function metallicPaint(material) {
    material.roughness = 0.3; // Cam yüzeyi pürüzsüz olmalı
    material.metalness = 1.0; // Cam için metalik etki gerekmez
    material.color.set(0xF8CD02); // Hafif bir renk tonu (isteğe bağlı)
    material.envMapIntensity = 1; // Ortam yansıması (isteğe bağlı, HDRI kullanıyorsanız etkili olur)
}

function pointLight(position, color, intensity, distance, decay) {
    const pointLight = new THREE.PointLight(color, intensity, distance, decay);
    pointLight.position.copy(position);
    return pointLight;
}

function emissiveLight(mesh, emissiveColor, intensity) {
    mesh.material = new THREE.MeshStandardMaterial({
        emissive: emissiveColor,
        emissiveIntensity: intensity,
    });
}

function spotlight(position, targetPosition, color = 0xDDE6FF, intensity = 20, angle = Math.PI / 4, distance = 50) {
    const spotlight = new THREE.SpotLight(color, intensity, distance, angle, 1, 2);
    spotlight.position.copy(position);

    // Adjust the target position
    const targetOffset = new THREE.Vector3(0, -Math.tan(THREE.MathUtils.degToRad(5)) * position.distanceTo(targetPosition), 0);
    const adjustedTargetPosition = targetPosition.clone().add(targetOffset);
    spotlight.target.position.copy(adjustedTargetPosition);

    return spotlight;
}

function volumetricLight(position, targetPosition, color = 0xDDE6FF) {
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
    volumetricLight.position.copy(position);
    volumetricLight.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    volumetricLight.rotateX(Math.PI); // Optional adjustment

    return volumetricLight;
}
