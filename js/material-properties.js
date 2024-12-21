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

export function spotlight(position, targetPosition, color = 0xDDE6FF, intensity = 20, angle = Math.PI / 4, distance = 50) {
    const spotlight = new THREE.SpotLight(color, intensity, distance, angle, 1, 2);
    spotlight.position.copy(position);

    // Adjust the target position
    const targetOffset = new THREE.Vector3(0, -Math.tan(THREE.MathUtils.degToRad(5)) * position.distanceTo(targetPosition), 0);
    const adjustedTargetPosition = targetPosition.clone().add(targetOffset);
    spotlight.target.position.copy(adjustedTargetPosition);

    spotlight.updatePositionAndDirection = function(newPosition, newTargetPosition) {
        this.position.copy(newPosition);
        const dynamicOffset = new THREE.Vector3(0, -Math.tan(THREE.MathUtils.degToRad(5)) * newPosition.distanceTo(newTargetPosition), 0);
        const dynamicTargetPosition = newTargetPosition.clone().add(dynamicOffset);
        this.target.position.copy(dynamicTargetPosition);
        this.target.updateMatrixWorld(); // Ensure the target's matrix updates correctly
    };

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