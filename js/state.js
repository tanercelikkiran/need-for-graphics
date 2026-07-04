// Shared mutable state extracted to break the circular dependency
// between main.js and loaders.js.
//
// ES module `export let` bindings are live — any importer sees the
// latest value after a setter reassigns it.

// Three.js scene state
export let scene = null;
export let sceneIntro = null;
export let sceneSandbox = null;
export let renderer = null;
export let composer = null;
export let motionBlurPass = null;
export let bloomPass = null;
export let skyMesh = null;
export let sunLight = null;
export let hemisphereLight = null;

// Physics state
export let world = null;
export let vehicle = null;
export let carSize = null;

// Game state
export let carColor = 0x5C0007;
export let selectedCarNo = 0;
export let isBraking = false;
export let isTurboActive = false;
export let useShadow = 2;
export let objects = [];

// Setter functions — explicit reassignment so other modules can
// update these live bindings through a clean API.
export function setScene(v) { scene = v; }
export function setSceneIntro(v) { sceneIntro = v; }
export function setSceneSandbox(v) { sceneSandbox = v; }
export function setRenderer(v) { renderer = v; }
export function setComposer(v) { composer = v; }
export function setMotionBlurPass(v) { motionBlurPass = v; }
export function setBloomPass(v) { bloomPass = v; }
export function setSkyMesh(v) { skyMesh = v; }
export function setSunLight(v) { sunLight = v; }
export function setHemisphereLight(v) { hemisphereLight = v; }
export function setWorld(v) { world = v; }
export function setVehicle(v) { vehicle = v; }
export function setCarSize(v) { carSize = v; }
export function setCarColor(v) { carColor = v; }
export function setSelectedCarNo(v) { selectedCarNo = v; }
export function setIsBraking(v) { isBraking = v; }
export function setIsTurboActive(v) { isTurboActive = v; }
export function setUseShadow(v) { useShadow = v; }
export function setObjects(v) { objects = v; }

// Game flow state machine
export const GameState = Object.freeze({
    INTRO: 'INTRO',
    SANDBOX: 'SANDBOX',
    LOADING: 'LOADING',
    COUNTDOWN: 'COUNTDOWN',
    PLAYING: 'PLAYING',
    GAME_OVER: 'GAME_OVER',
});

export let gameState = GameState.INTRO;
export function setGameState(v) { gameState = v; }
