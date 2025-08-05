import * as THREE from 'three';
import { FlyControls } from 'three/addons/controls/FlyControls.js';
import { Font, FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TTFLoader } from 'three/addons/loaders/TTFLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

let camera: THREE.PerspectiveCamera, scene: THREE.Scene, renderer: THREE.WebGLRenderer;
let controls: FlyControls;
let clock: THREE.Clock;
let glyphGroup: THREE.Group;
let initialText: THREE.Mesh | null = null;

const statusElement = document.getElementById('status') as HTMLElement;
const fontInputElement = document.getElementById('font-input') as HTMLInputElement;
const shapeSelectElement = document.getElementById('shape-select') as HTMLSelectElement;
const spacingSliderElement = document.getElementById('spacing-slider') as HTMLInputElement;
const spacingValueElement = document.getElementById('spacing-value') as HTMLSpanElement;

// Knot controls
const knotControlsElement = document.getElementById('knot-controls') as HTMLElement;
const pSliderElement = document.getElementById('p-slider') as HTMLInputElement;
const pValueElement = document.getElementById('p-value') as HTMLSpanElement;
const qSliderElement = document.getElementById('q-slider') as HTMLInputElement;
const qValueElement = document.getElementById('q-value') as HTMLSpanElement;

function init() {
    // Clock
    clock = new THREE.Clock();

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);
    
    glyphGroup = new THREE.Group();
    scene.add(glyphGroup);

    // Camera
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 10000);
    camera.position.set(0, 50, 600);

    // Controls
    controls = new FlyControls(camera, renderer.domElement);
    controls.movementSpeed = 200;
    controls.rollSpeed = Math.PI / 12;
    controls.autoForward = false;
    controls.dragToLook = true;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(5, 10, 7.5);
    scene.add(dirLight);

    // Initial Message
    const fontLoader = new FontLoader();
    fontLoader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', (font) => {
        const geometry = new TextGeometry('Upload a .ttf to begin', {
            font: font, size: 16, height: 2, curveSegments: 4,
        });
        geometry.center();
        const material = new THREE.MeshStandardMaterial({ color: 0xcccccc });
        initialText = new THREE.Mesh(geometry, material);
        scene.add(initialText);
    });

    // Event Listeners
    fontInputElement.addEventListener('change', handleFontUpload, false);
    shapeSelectElement.addEventListener('change', updateGlyphArrangement, false);
    spacingSliderElement.addEventListener('input', () => {
        const spacingValue = parseFloat(spacingSliderElement.value).toFixed(1);
        spacingValueElement.textContent = `${spacingValue}x`;
        updateGlyphArrangement();
    }, false);
    
    // Knot slider listeners
    pSliderElement.addEventListener('input', () => { pValueElement.textContent = pSliderElement.value; });
    qSliderElement.addEventListener('input', () => { qValueElement.textContent = qSliderElement.value; });


    window.addEventListener('resize', onWindowResize, false);

    animate();
}

function handleFontUpload(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    statusElement.textContent = `Loading ${file.name}...`;
    const reader = new FileReader();

    reader.onload = (e) => {
        if (!e.target?.result) {
            statusElement.textContent = 'Error reading file.';
            return;
        }
        try {
            const ttfLoader = new TTFLoader();
            const fontJSON = ttfLoader.parse(e.target.result);
            const font = new Font(fontJSON);
            renderAllGlyphs(font);
        } catch (error) {
            console.error(error);
            statusElement.textContent = 'Failed to parse font file.';
        }
    };
    reader.onerror = () => { statusElement.textContent = 'Error reading file.'; };
    reader.readAsArrayBuffer(file);
}

function renderAllGlyphs(font: Font) {
    // Clear previous glyphs and initial message
    if (initialText) {
        scene.remove(initialText);
        initialText.geometry.dispose();
        (initialText.material as THREE.Material).dispose();
        initialText = null;
    }
    while (glyphGroup.children.length) {
        const child = glyphGroup.children[0] as THREE.Mesh;
        glyphGroup.remove(child);
        child.geometry.dispose();
        (child.material as THREE.Material[]).forEach(m => m.dispose());
    }
    
    const glyphs = font.data.glyphs;
    const glyphChars = Object.keys(glyphs).filter(char => glyphs[char].o && glyphs[char].o.length > 0);

    if (glyphChars.length === 0) {
        statusElement.textContent = 'No renderable glyphs found.';
        return;
    }
    
    statusElement.textContent = `Rendering ${glyphChars.length} glyphs...`;

    const glyphSize = 20;

    glyphChars.forEach((char) => {
        // Create individual materials for each glyph to allow for dynamic color changes
        const material = new THREE.MeshStandardMaterial({
            color: 0x00ffdd, metalness: 0.2, roughness: 0.5
        });
        const geometry = new TextGeometry(char, {
            font: font, size: glyphSize, height: glyphSize * 0.1, curveSegments: 2
        });
        geometry.computeBoundingBox();
        geometry.center();
        const mesh = new THREE.Mesh(geometry, material);
        glyphGroup.add(mesh);
    });

    updateGlyphArrangement();
    statusElement.textContent = `${glyphChars.length} glyphs rendered.`;
}

function updateGlyphArrangement() {
    const shape = shapeSelectElement.value;
    
    // Toggle visibility of knot controls
    knotControlsElement.style.display = (shape === 'torus-klein-knot') ? 'flex' : 'none';

    if (glyphGroup.children.length === 0) return;

    glyphGroup.rotation.set(0, 0, 0); // Reset group state

    const spacing = parseFloat(spacingSliderElement.value);
    const count = glyphGroup.children.length;

    // For animated shapes, do an initial placement at time=0
    if (shape === 'mobius' || shape === 'klein' || shape === 'torus-klein-knot') {
        updateAnimatedGlyphs(0);
        return;
    }

    glyphGroup.children.forEach((mesh, i) => {
        const object = mesh as THREE.Mesh;
        object.rotation.set(0, 0, 0); // Reset rotation

        switch (shape) {
            case 'circle':
                const radius = Math.max(200, count * 0.6) * spacing;
                const angle = (i / count) * Math.PI * 2;
                object.position.set(radius * Math.cos(angle), 0, radius * Math.sin(angle));
                object.lookAt(scene.position);
                break;

            case 'grid':
                const itemSize = 40 * spacing;
                const cols = Math.ceil(Math.sqrt(count));
                const gridX = (i % cols - (cols - 1) / 2) * itemSize;
                const gridY = (Math.floor(i / cols) - (Math.floor(count / cols) -1) / 2) * -itemSize;
                object.position.set(gridX, gridY, 0);
                object.lookAt(camera.position);
                break;

            case 'sphere':
                const sphereRadius = Math.max(150, count * 0.25) * spacing;
                const phi = Math.acos(-1 + (2 * i) / count);
                const theta = Math.sqrt(count * Math.PI) * phi;
                object.position.set(
                    sphereRadius * Math.cos(theta) * Math.sin(phi),
                    sphereRadius * Math.sin(theta) * Math.sin(phi),
                    sphereRadius * Math.cos(phi)
                );
                object.lookAt(scene.position);
                break;

            case 'helix':
                const helixRadius = 100 * spacing;
                const verticalSpacing = 15 * spacing;
                const turns = 10;
                const helixAngle = (i / count) * Math.PI * 2 * turns;
                object.position.set(
                    helixRadius * Math.cos(helixAngle),
                    (i - count/2) * verticalSpacing * 0.2,
                    helixRadius * Math.sin(helixAngle)
                );
                object.lookAt(new THREE.Vector3(0, object.position.y, 0));
                break;
        }
    });
}

const getTorusKnotPos = (u: number, p: number, q: number, radius: number, tubeRadius: number) => {
    const p_u = p * u;
    const q_u = q * u;

    const x = (radius + tubeRadius * Math.cos(q_u)) * Math.cos(p_u);
    const y = (radius + tubeRadius * Math.cos(q_u)) * Math.sin(p_u);
    const z = tubeRadius * Math.sin(q_u);
    
    return new THREE.Vector3(x, y, z);
}


function updateAnimatedGlyphs(time: number) {
    if (glyphGroup.children.length === 0) return;

    const shape = shapeSelectElement.value;
    const spacing = parseFloat(spacingSliderElement.value);
    const count = glyphGroup.children.length;

    glyphGroup.children.forEach((mesh, i) => {
        const object = mesh as THREE.Mesh;

        if (shape === 'mobius') {
            const R = 150 * spacing;
            const u = (i / count) * Math.PI * 2 + time * 0.2;
            const v = 2 * u;
            
            const x = (R + 30 * Math.cos(v/2)) * Math.cos(u);
            const y = (R + 30 * Math.cos(v/2)) * Math.sin(u);
            const z = 30 * Math.sin(v/2);

            object.position.set(x, y, z);
            object.lookAt(scene.position);

        } else if (shape === 'klein') {
            const u = (i / count) * Math.PI * 2;
            const v = time * 0.5;
            const scale = 30 * spacing;
            const r = 4;
            const cos_u = Math.cos(u);
            const sin_u = Math.sin(u);
            const cos_v = Math.cos(v);
            const sin_v = Math.sin(v);
            
            let x, y, z;
            if (u < Math.PI) {
                x = scale * (6 * cos_u * (1 + sin_u) + r * (1 - cos_u / 2) * cos_u * cos_v);
                z = scale * (16 * sin_u + r * (1 - cos_u / 2) * sin_u * cos_v);
            } else {
                x = scale * (6 * cos_u * (1 + sin_u) - r * (1 - cos_u / 2) * cos_v);
                z = scale * (16 * sin_u);
            }
            y = scale * (r * (1 - cos_u / 2) * sin_v);
            
            object.position.set(x, y, z);
            object.lookAt(scene.position);
        } else if (shape === 'torus-klein-knot') {
            const p = parseInt(pSliderElement.value, 10);
            const q = parseInt(qSliderElement.value, 10);
            const radius = 100 * spacing;
            const tubeRadius = 40 * spacing;
            const animSpeed = 0.05;

            // Main path along the knot
            const u = ((i / count) + time * animSpeed) * Math.PI * 2;
            
            // Position on the knot
            const P = getTorusKnotPos(u, p, q, radius, tubeRadius);

            // Create a local coordinate system (Frenet Frame approximation)
            const epsilon = 0.001;
            const P_plus_eps = getTorusKnotPos(u + epsilon, p, q, radius, tubeRadius);
            const T = P_plus_eps.clone().sub(P).normalize(); // Tangent
            const N = new THREE.Vector3().subVectors(getTorusKnotPos(u, p, q, radius, tubeRadius + epsilon), P).normalize(); // Normal
            const B = new THREE.Vector3().crossVectors(T, N); // Binormal

            // Helical offset around the tube
            const helixRadius = 15;
            const helixAngle = time * 5 + (i / count) * Math.PI * 8; // Secondary rotation
            const helixOffset = N.multiplyScalar(Math.cos(helixAngle) * helixRadius)
                                .add(B.multiplyScalar(Math.sin(helixAngle) * helixRadius));

            object.position.copy(P).add(helixOffset);
            
            // Orientation
            object.lookAt(P); // Point towards the center of the tube
            
            // Dynamic Color
            const hue = (u / (Math.PI * 2)) % 1;
            (object.material as THREE.MeshStandardMaterial).color.setHSL(hue, 0.8, 0.6);
        }
    });
}


function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const elapsedTime = clock.getElapsedTime();
    controls.update(delta);

    const shape = shapeSelectElement.value;

    if (shape === 'mobius' || shape === 'klein' || shape === 'torus-klein-knot') {
        updateAnimatedGlyphs(elapsedTime);
    }
    
    if(shape === 'circle' || shape === 'helix' || shape === 'sphere' || shape === 'grid') {
        if(glyphGroup.children.length > 0) {
            glyphGroup.rotation.y += delta * 0.05;
        }
    }
    
    renderer.render(scene, camera);
}

init();