import * as THREE from "three";


export function transparent(material, color = 0xffffff) {
    material.transparent = true; // Şeffaflık modunu etkinleştir
    material.opacity = 0.5; // Şeffaflık oranı (0 tamamen görünmez, 1 tamamen opak)
    material.roughness = 0; // Cam yüzeyi pürüzsüz olmalı
    material.metalness = 0; // Cam için metalik etki gerekmez
    material.color.set(color); // Hafif bir renk tonu (isteğe bağlı)
    material.envMapIntensity = 1; // Ortam yansıması (isteğe bağlı, HDRI kullanıyorsanız etkili olur)
}


export function metallicPaint(material, color) {
    // Kullanıcının verdiği rengi ayarla
    material.color.set(color); // Ana renk

    // Varsayılan metalik özellikler
    material.metalness = 1.0; // Tam metalik görünüm
    material.roughness = 0.2; // Hafif pürüzsüzlük
    material.envMapIntensity = 1.5; // Ortam haritası yansıma yoğunluğu


    // Sheen (ipeksi parlaklık)
    material.sheen = 1.0; // Sheen yoğunluğu
    material.sheenColor = new THREE.Color(color).multiplyScalar(1.2); // Rengin hafif aydınlatılmış tonu
    material.sheenRoughness = 0.3; // Sheen pürüzlülüğü

    // Fresnel Etkisi (dinamik renk değişimi)
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uFresnelPower = { value: 2.0 };
        shader.uniforms.uFresnelColor = { value: new THREE.Color(color).multiplyScalar(1.5) };

        // Inject Fresnel calculation into the color_fragment chunk
        shader.fragmentShader = shader.fragmentShader.replace(
            `#include <color_fragment>`,
            `#include <color_fragment>
            {
                vec3 viewDir = normalize(vViewPosition);
                vec3 normalDir = normalize(vNormal);
                float fresnel = pow(1.0 - abs(dot(normalDir, viewDir)), uFresnelPower);
                diffuseColor.rgb += uFresnelColor * fresnel;
            }
            `
        );

        // Add uniforms to the fragment shader
        shader.fragmentShader = shader.fragmentShader.replace(
            `uniform float opacity;`,
            `uniform float opacity;
            uniform float uFresnelPower;
            uniform vec3 uFresnelColor;`
        );
    };

    // Diğer ışık ve yüzey detayları
    material.reflectivity = 0.5; // Yansıma yoğunluğu
    material.specularIntensity = 1.0; // Parlama yoğunluğu
    material.specularTint = new THREE.Color(0xffffff); // Beyaz parlama
    material.lightMapIntensity = 1.0; // Işık haritası yoğunluğu
    material.aoMapIntensity = 1.0; // Ortam ışığı yoğunluğu (AO)
}


export function pointLight(position, color, intensity, distance, decay) {
    const pointLight = new THREE.PointLight(color, intensity, distance, decay);
    pointLight.position.copy(position);
    return pointLight;
}

export function emissiveLight(mesh, emissiveColor, intensity) {
    if (mesh.material) {
        mesh.material.emissive = new THREE.Color(emissiveColor);
        mesh.material.emissiveIntensity = intensity;
    }
}

// Pre-allocated temp vectors for spotlight updates
const _spotDir = new THREE.Vector3();
const _spotTarget = new THREE.Vector3();

export function spotlight(position, targetPosition, color = 0xDDE6FF, intensity = 15, angle = Math.PI / 4, distance = 50, tiltDegrees = -5) {
    const spot = new THREE.SpotLight(color, intensity, distance, angle, 1, 1);
    spot.position.copy(position);

    // Compute direction from position --> target with tilt
    const tiltEuler = new THREE.Euler(THREE.MathUtils.degToRad(tiltDegrees), 0, 0, "XYZ");
    const direction = new THREE.Vector3().subVectors(targetPosition, position);
    direction.applyEuler(tiltEuler);
    const finalTarget = position.clone().add(direction);
    spot.target.position.copy(finalTarget);
    spot.target.updateMatrixWorld();

    // For dynamic updates, reapply the same tilt using pre-allocated vectors
    spot.updatePositionAndDirection = function (newPosition, newTargetPosition) {
        this.position.copy(newPosition);
        _spotDir.subVectors(newTargetPosition, newPosition);
        _spotDir.applyEuler(tiltEuler);
        _spotTarget.copy(newPosition).add(_spotDir);
        this.target.position.copy(_spotTarget);
        this.target.updateMatrixWorld();
    };

    return spot;
}