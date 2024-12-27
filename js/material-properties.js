import * as THREE from "three";

export function transparent(material, color) {
    material.transparent = true; // Şeffaflık modunu etkinleştir
    material.opacity = 0.5; // Şeffaflık oranı (0 tamamen görünmez, 1 tamamen opak)
    material.roughness = 0; // Cam yüzeyi pürüzsüz olmalı
    material.metalness = 0; // Cam için metalik etki gerekmez
    material.color.set(color); // Hafif bir renk tonu (isteğe bağlı)
    material.envMapIntensity = 1; // Ortam yansıması (isteğe bağlı, HDRI kullanıyorsanız etkili olur)
}

export function metallicPaint(material) {
    material.roughness = 0.3; // Cam yüzeyi pürüzsüz olmalı
    material.metalness = 1.0; // Cam için metalik etki gerekmez
    material.color.set(0xF8CD02); // Hafif bir renk tonu (isteğe bağlı)
    material.envMapIntensity = 1; // Ortam yansıması (isteğe bağlı, HDRI kullanıyorsanız etkili olur)
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

export function spotlight(position, carDirection, color = 0xDDE6FF, intensity = 20, angle = Math.PI / 4, distance = 50) {
    const spotlight = new THREE.SpotLight(color, intensity, distance, angle, 1, 1.5);
    spotlight.position.copy(position);

    // Spotlight hedefini biraz aşağı (-Y) bakacak şekilde ayarla
    const offsetY = -1; // Hedefin Y ekseninde aşağı kaydırılması
    const adjustedTargetPosition = position
        .clone()
        .add(carDirection.clone().negate().multiplyScalar(10)) // -Z yönüne bak
        .add(new THREE.Vector3(0, offsetY, 0)); // Y ekseninde aşağı kaydır
    spotlight.target.position.copy(adjustedTargetPosition);

    // Spotlight pozisyon ve yönünü dinamik olarak güncelleyen fonksiyon
    spotlight.updatePositionAndDirection = function(newPosition, newCarDirection) {
        const dynamicTargetPosition = newPosition
            .clone()
            .add(newCarDirection.clone().negate().multiplyScalar(10)) // -Z yönüne bak
            .add(new THREE.Vector3(0, offsetY, 0)); // Y ekseninde aşağı kaydır
        this.position.copy(newPosition);
        const dynamicOffset = new THREE.Vector3(0, -Math.tan(THREE.MathUtils.degToRad(5)) * newPosition.distanceTo(newTargetPosition), 0);
        const dynamicTargetPosition = newTargetPosition.clone().add(dynamicOffset);
        this.target.position.copy(dynamicTargetPosition);
        this.target.updateMatrixWorld(); // Ensure the target's matrix updates correctly
    };

    return spot;
}
