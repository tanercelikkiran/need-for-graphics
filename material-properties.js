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

    const spot = new THREE.SpotLight(color, intensity, distance, angle, 1, 2);
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