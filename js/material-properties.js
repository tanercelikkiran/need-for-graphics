import * as THREE from "three";


export function transparent(material, color) {
    material.transparent = true; // Şeffaflık modunu etkinleştir
    material.opacity = 0.5; // Şeffaflık oranı (0 tamamen görünmez, 1 tamamen opak)
    material.roughness = 0; // Cam yüzeyi pürüzsüz olmalı
    material.metalness = 0; // Cam için metalik etki gerekmez
    material.color.set(color); // Hafif bir renk tonu (isteğe bağlı)
    material.envMapIntensity = 1; // Ortam yansıması (isteğe bağlı, HDRI kullanıyorsanız etkili olur)
}

export function neonEmissiveMaterial(material, color, intensity) {
    material.color.set(color);
    material.emissive = new THREE.Color(color);
    material.emissiveIntensity = intensity;
    material.roughness = 0.2; // Slight roughness for light diffusion
    material.metalness = 0.8; // Slight metallic effect for glow reflection
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

    // Normal Map ve ayrıntılar (isteğe bağlı)
    material.normalMap = null; // Varsayılan olarak yok
    material.normalScale = new THREE.Vector2(1, 1); // Normal haritası ölçeği

    // Ortam haritası (envMap)
    material.envMap = null; // Varsayılan olarak yok

    // Fresnel Etkisi (dinamik renk değişimi)
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uFresnelPower = { value: 2.0 }; // Fresnel yoğunluğu
        shader.uniforms.uFresnelColor = { value: new THREE.Color(color).multiplyScalar(1.5) }; // Fresnel renk tonu
        shader.fragmentShader = shader.fragmentShader.replace(
            `void main() {`,
            `
            uniform float uFresnelPower;
            uniform vec3 uFresnelColor;
            void main() {
                float fresnel = pow(1.0 - dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), uFresnelPower);
                gl_FragColor.rgb += uFresnelColor * fresnel;
            `
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
    mesh.material = new THREE.MeshStandardMaterial({
        emissive: emissiveColor,
        emissiveIntensity: intensity,
    });
}

export function spotlight(position, targetPosition, color = 0xDDE6FF, intensity = 15, angle = Math.PI / 4, distance = 50) {

    const spot = new THREE.SpotLight(color, intensity, distance, angle, 1, 1);
    spot.position.copy(position);

    // 1) Compute direction from position --> target
    const direction = new THREE.Vector3().subVectors(targetPosition, position);

    // 2) Tilt that direction by -5° around the local X axis
    const tiltEuler = new THREE.Euler(THREE.MathUtils.degToRad(-5), 0, 0, "XYZ");
    direction.applyEuler(tiltEuler);

    // 3) Final target = position + (tilted direction)
    const finalTarget = position.clone().add(direction);
    spot.target.position.copy(finalTarget);
    spot.target.updateMatrixWorld();

    // For dynamic updates, reapply the same tilt.
    spot.updatePositionAndDirection = function (newPosition, newTargetPosition) {
        this.position.copy(newPosition);

        const dir = new THREE.Vector3().subVectors(newTargetPosition, newPosition);
        dir.applyEuler(tiltEuler);

        const finalTarget2 = newPosition.clone().add(dir);
        this.target.position.copy(finalTarget2);
        this.target.updateMatrixWorld();
    };

    return spot;
}