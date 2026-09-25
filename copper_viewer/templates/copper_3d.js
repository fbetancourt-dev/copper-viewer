/**
 * ============================================================================
 * Copper Viewer - High-Precision 3D WebGL PCB Engine (copper_3d.js)
 * ============================================================================
 * Inspired by SceneKit AF3DBoardScene in Copper Touch (iPad).
 * Renders authentic FR4 substrate with thickness, drilled vias & mounting holes,
 * elevated copper tracks, realistic solder mask colors, and parametric 3D chips.
 */

var Copper3D = (function() {
    var scene, camera, renderer, controls;
    var boardGroup, componentsGroup, copperGroup, lightsGroup;
    var currentData = null;
    var animationId = null;
    var isInitialized = false;

    // Default 3D Settings
    var settings = {
        thickness: 1.6, // mm standard FR4
        maskColor: 0x0c5924, // JLCPCB / Classic Green
        maskRoughness: 0.35,
        maskMetalness: 0.12,
        finishColor: 0xd8b056, // ENIG Gold
        finishMetalness: 0.9,
        finishRoughness: 0.22,
        substrateColor: 0x5a6344, // Translucent fiberglass FR4 core
        xray: false,
        showComponents: true,
        showTraces: true,
        autoRotate: false
    };

    var colorPresets = {
        green: { mask: 0x0c5924, name: "JLCPCB Green" },
        purple: { mask: 0x2e1147, name: "OSHPark Purple" },
        black: { mask: 0x141518, name: "Matte Black" },
        blue: { mask: 0x0c3e7a, name: "Royal Blue" },
        red: { mask: 0x731414, name: "Crimson Red" },
        white: { mask: 0xe0e2e6, name: "Arctic White" }
    };

    function init(containerEl, eagleData) {
        if (!containerEl || !window.THREE) return;
        currentData = eagleData;

        // Clean up previous instance if any
        if (renderer && renderer.domElement && renderer.domElement.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement);
            if (animationId) cancelAnimationFrame(animationId);
        }

        var width = containerEl.clientWidth || 800;
        var height = containerEl.clientHeight || 600;

        // 1. Scene setup
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x131417);

        // 2. Camera setup
        camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 2000);
        camera.position.set(0, -90, 110);
        camera.up.set(0, 0, 1); // Z is Up

        // 3. WebGL Renderer
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.15;
        containerEl.appendChild(renderer.domElement);

        // 4. Orbit Controls
        if (THREE.OrbitControls) {
            controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.06;
            controls.rotateSpeed = 0.8;
            controls.zoomSpeed = 1.2;
            controls.panSpeed = 0.8;
            controls.maxDistance = 500;
            controls.minDistance = 5;
        }

        // 5. Lighting Setup (Studio 3-Point + Subtle Environment)
        setupLighting();

        // 6. Build Board & Elements
        buildScene();

        // 7. Event listeners
        window.addEventListener("resize", function() {
            if (!containerEl || !camera || !renderer) return;
            var w = containerEl.clientWidth || 800;
            var h = containerEl.clientHeight || 600;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        });

        // 8. Start Render Loop
        isInitialized = true;
        animate();
    }

    function setupLighting() {
        lightsGroup = new THREE.Group();

        // Ambient Light
        var hemiLight = new THREE.HemisphereLight(0xffffff, 0x22242a, 0.7);
        lightsGroup.add(hemiLight);

        // Key Studio Spotlight
        var keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
        keyLight.position.set(60, -80, 100);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.width = 2048;
        keyLight.shadow.mapSize.height = 2048;
        keyLight.shadow.camera.near = 10;
        keyLight.shadow.camera.far = 300;
        keyLight.shadow.bias = -0.0005;
        var d = 60;
        keyLight.shadow.camera.left = -d;
        keyLight.shadow.camera.right = d;
        keyLight.shadow.camera.top = d;
        keyLight.shadow.camera.bottom = -d;
        lightsGroup.add(keyLight);

        // Secondary Soft Fill Light
        var fillLight = new THREE.DirectionalLight(0x9fc5e8, 0.6);
        fillLight.position.set(-70, 60, 60);
        lightsGroup.add(fillLight);

        // Rim Light from back
        var rimLight = new THREE.DirectionalLight(0xfff4e6, 0.8);
        rimLight.position.set(0, 90, -40);
        lightsGroup.add(rimLight);

        scene.add(lightsGroup);
    }

    function buildScene() {
        if (!currentData || !currentData.board) return;

        // Clean existing groups
        if (boardGroup) scene.remove(boardGroup);

        boardGroup = new THREE.Group();
        copperGroup = new THREE.Group();
        componentsGroup = new THREE.Group();

        boardGroup.add(copperGroup);
        boardGroup.add(componentsGroup);

        var bounds = currentData.board.bounds || { min_x: 0, min_y: 0, max_x: 100, max_y: 80, width: 100, height: 80 };
        var centerX = bounds.min_x + bounds.width / 2;
        var centerY = bounds.min_y + bounds.height / 2;

        // Build Physical FR4 Substrate
        buildSubstrate(bounds);

        // Build Drills, Vias & Mounting Holes
        buildHolesAndVias();

        // Build Copper Traces & Pads
        buildCopperLayers();

        // Build Parametric 3D Components
        buildComponents();

        // Center entire board at (0, 0, 0)
        boardGroup.position.set(-centerX, -centerY, 0);
        scene.add(boardGroup);

        // Adjust camera to fit board comfortably
        var maxDim = Math.max(bounds.width, bounds.height);
        camera.position.set(0, -maxDim * 1.1, maxDim * 0.95);
        if (controls) {
            controls.target.set(0, 0, 0);
            controls.update();
        }
    }

    function buildSubstrate(bounds) {
        var shape = new THREE.Shape();
        var dims = currentData.board.dimension || [];

        if (dims.length >= 3) {
            // Trace exact outline from Layer 20 Dimension wires
            var start = dims[0];
            shape.moveTo(start.x1, start.y1);
            for (var i = 0; i < dims.length; i++) {
                var d = dims[i];
                shape.lineTo(d.x2, d.y2);
            }
        } else {
            // Rounded rectangle fallback
            var x = bounds.min_x, y = bounds.min_y, w = bounds.width, h = bounds.height, r = 2.5;
            shape.moveTo(x + r, y);
            shape.lineTo(x + w - r, y);
            shape.quadraticCurveTo(x + w, y, x + w, y + r);
            shape.lineTo(x + w, y + h - r);
            shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            shape.lineTo(x + r, y + h);
            shape.quadraticCurveTo(x, y + h, x, y + h - r);
            shape.lineTo(x, y + r);
            shape.quadraticCurveTo(x, y, x + r, y);
        }

        // Punch Holes into board shape (Mounting holes + Large Pads)
        var holes = currentData.board.holes || [];
        for (var hIdx = 0; hIdx < holes.length; hIdx++) {
            var h = holes[hIdx];
            var holePath = new THREE.Path();
            holePath.absarc(h.x, h.y, h.drill / 2, 0, Math.PI * 2, true);
            shape.holes.push(holePath);
        }

        // Extrude board geometry
        var t = settings.thickness;
        var extrudeSettings = {
            depth: t,
            bevelEnabled: true,
            bevelSegments: 2,
            steps: 1,
            bevelSize: 0.1,
            bevelThickness: 0.1
        };

        var geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);

        var mat = new THREE.MeshStandardMaterial({
            color: settings.xray ? 0x224422 : settings.maskColor,
            roughness: settings.xray ? 0.8 : settings.maskRoughness,
            metalness: settings.maskMetalness,
            transparent: settings.xray,
            opacity: settings.xray ? 0.35 : 1.0,
            side: THREE.DoubleSide
        });

        var boardMesh = new THREE.Mesh(geom, mat);
        boardMesh.position.z = -t / 2;
        boardMesh.receiveShadow = true;
        boardMesh.castShadow = !settings.xray;
        boardGroup.add(boardMesh);
    }

    function buildHolesAndVias() {
        var t = settings.thickness;
        var holes = currentData.board.holes || [];
        var viaMat = new THREE.MeshStandardMaterial({
            color: 0x997733,
            metalness: 0.8,
            roughness: 0.3
        });

        // Plated Vias from Signals
        var signals = currentData.board.signals || [];
        for (var s = 0; s < signals.length; s++) {
            var vias = signals[s].vias || [];
            for (var v = 0; v < vias.length; v++) {
                var via = vias[v];
                var geom = new THREE.CylinderGeometry(via.diameter / 2, via.diameter / 2, t + 0.06, 12, 1, true);
                geom.rotateX(Math.PI / 2);
                var mesh = new THREE.Mesh(geom, viaMat);
                mesh.position.set(via.x, via.y, 0);
                copperGroup.add(mesh);
            }
        }
    }

    function buildCopperLayers() {
        if (!settings.showTraces) return;

        var t = settings.thickness;
        var zTop = t / 2 + 0.02;
        var zBottom = -t / 2 - 0.02;

        var copperMatTop = new THREE.MeshStandardMaterial({
            color: settings.finishColor,
            metalness: settings.finishMetalness,
            roughness: settings.finishRoughness
        });

        var copperMatBottom = new THREE.MeshStandardMaterial({
            color: settings.finishColor,
            metalness: settings.finishMetalness,
            roughness: settings.finishRoughness
        });

        // 1. SMD and Through-Hole Pads
        var elements = currentData.board.elements || [];
        var packages = currentData.board.packages || {};

        for (var e = 0; e < elements.length; e++) {
            var elem = elements[e];
            var pkg = packages[elem.package];
            if (!pkg) continue;

            var eRad = (parseFloat(elem.rot.replace(/[^0-9.-]/g, "")) || 0) * Math.PI / 180;
            var isBottom = elem.rot.indexOf("M") !== -1;
            var zPad = isBottom ? zBottom : zTop;

            // SMD Pads
            var smds = pkg.smds || [];
            for (var m = 0; m < smds.length; m++) {
                var smd = smds[m];
                var padGeom = new THREE.BoxGeometry(smd.dx, smd.dy, 0.04);
                var padMesh = new THREE.Mesh(padGeom, copperMatTop);

                // Local rotation + element rotation
                var lx = smd.x * Math.cos(eRad) - smd.y * Math.sin(eRad);
                var ly = smd.x * Math.sin(eRad) + smd.y * Math.cos(eRad);
                padMesh.position.set(elem.x + lx, elem.y + ly, zPad);
                padMesh.rotation.z = eRad;
                copperGroup.add(padMesh);
            }

            // Through-hole Pads (both sides)
            var pads = pkg.pads || [];
            for (var p = 0; p < pads.length; p++) {
                var pad = pads[p];
                var r = (pad.diameter || 1.6) / 2;
                var padCyl = new THREE.CylinderGeometry(r, r, 0.05, 16);
                padCyl.rotateX(Math.PI / 2);

                var lx = pad.x * Math.cos(eRad) - pad.y * Math.sin(eRad);
                var ly = pad.x * Math.sin(eRad) + pad.y * Math.cos(eRad);

                // Top pad ring
                var topMesh = new THREE.Mesh(padCyl, copperMatTop);
                topMesh.position.set(elem.x + lx, elem.y + ly, zTop);
                copperGroup.add(topMesh);

                // Bottom pad ring
                var botMesh = new THREE.Mesh(padCyl, copperMatBottom);
                botMesh.position.set(elem.x + lx, elem.y + ly, zBottom);
                copperGroup.add(botMesh);
            }
        }

        // 2. Copper Signal Traces
        var signals = currentData.board.signals || [];
        for (var s = 0; s < signals.length; s++) {
            var wires = signals[s].wires || [];
            for (var w = 0; w < wires.length; w++) {
                var wire = wires[w];
                var dx = wire.x2 - wire.x1;
                var dy = wire.y2 - wire.y1;
                var len = Math.sqrt(dx * dx + dy * dy);
                if (len < 0.01) continue;

                var wireWidth = Math.max(wire.width || 0.254, 0.15);
                var geom = new THREE.BoxGeometry(wireWidth, len, 0.03);
                var zWire = (wire.layer === 16) ? zBottom : zTop;
                var mat = (wire.layer === 16) ? copperMatBottom : copperMatTop;

                var mesh = new THREE.Mesh(geom, mat);
                mesh.position.set((wire.x1 + wire.x2) / 2, (wire.y1 + wire.y2) / 2, zWire);
                mesh.rotation.z = Math.atan2(dy, dx) - Math.PI / 2;
                copperGroup.add(mesh);
            }
        }
    }

    function buildComponents() {
        if (!settings.showComponents) return;

        var t = settings.thickness;
        var zSurfaceTop = t / 2 + 0.04;
        var elements = currentData.board.elements || [];

        // Reusable IC / Chip Materials
        var icBodyMat = new THREE.MeshStandardMaterial({
            color: 0x18191c, // Black matte epoxy
            roughness: 0.75,
            metalness: 0.1
        });

        var pinLeadMat = new THREE.MeshStandardMaterial({
            color: 0xc8cbd1, // Matte silver solder / leadframe
            metalness: 0.85,
            roughness: 0.25
        });

        var resistorMat = new THREE.MeshStandardMaterial({
            color: 0x111214,
            roughness: 0.6
        });

        var capacitorMat = new THREE.MeshStandardMaterial({
            color: 0x946b43, // Classic brown ceramic
            roughness: 0.5
        });

        var goldPinMat = new THREE.MeshStandardMaterial({
            color: 0xf5c342, // Gold flash header pin
            metalness: 0.95,
            roughness: 0.18
        });

        var metalCanMat = new THREE.MeshStandardMaterial({
            color: 0xd8dbe2, // Aluminum electrolytic / crystal can
            metalness: 0.8,
            roughness: 0.2
        });

        for (var i = 0; i < elements.length; i++) {
            var elem = elements[i];
            var pkgName = (elem.package || "").toUpperCase();
            var ref = (elem.name || "").toUpperCase();
            var val = (elem.value || "").toUpperCase();
            var angleRad = (parseFloat(elem.rot.replace(/[^0-9.-]/g, "")) || 0) * Math.PI / 180;
            var isBottom = elem.rot.indexOf("M") !== -1;
            var compZ = isBottom ? (-t / 2 - 0.04) : zSurfaceTop;

            var compMesh = null;

            // 1. Dual In-Line Package (DIP / DIL)
            if (pkgName.indexOf("DIP") !== -1 || pkgName.indexOf("DIL") !== -1) {
                var pins = 8;
                var match = pkgName.match(/\d+/);
                if (match) pins = parseInt(match[0]);
                var length = Math.max(pins * 1.27, 8);
                var width = 6.2;
                var height = 3.4;

                var group = new THREE.Group();
                // IC Body
                var bodyGeom = new THREE.BoxGeometry(width, length, height);
                var body = new THREE.Mesh(bodyGeom, icBodyMat);
                body.position.z = height / 2;
                body.castShadow = true;
                group.add(body);

                // Pin 1 Notch
                var notchGeom = new THREE.CylinderGeometry(0.8, 0.8, 0.3, 12);
                notchGeom.rotateZ(Math.PI / 2);
                var notch = new THREE.Mesh(notchGeom, new THREE.MeshBasicMaterial({ color: 0x050505 }));
                notch.position.set(0, length / 2, height);
                group.add(notch);

                compMesh = group;
            }
            // 2. Small Outline (SOIC / SOP / SSOP / TSSOP)
            else if (pkgName.indexOf("SOIC") !== -1 || pkgName.indexOf("SOP") !== -1 || pkgName.indexOf("SO") === 0) {
                var group = new THREE.Group();
                var width = 4.2, length = 6.5, height = 1.4;
                var body = new THREE.Mesh(new THREE.BoxGeometry(width, length, height), icBodyMat);
                body.position.z = height / 2;
                body.castShadow = true;
                group.add(body);

                // Silver Leads along sides
                for (var side = -1; side <= 1; side += 2) {
                    var lead = new THREE.Mesh(new THREE.BoxGeometry(0.8, length * 0.9, 0.2), pinLeadMat);
                    lead.position.set(side * (width / 2 + 0.4), 0, 0.1);
                    group.add(lead);
                }
                compMesh = group;
            }
            // 3. Quad Flat Package (QFP / TQFP / QFN)
            else if (pkgName.indexOf("QFP") !== -1 || pkgName.indexOf("QFN") !== -1) {
                var group = new THREE.Group();
                var size = (pkgName.indexOf("32") !== -1) ? 9 : 12;
                var height = 1.2;
                var body = new THREE.Mesh(new THREE.BoxGeometry(size, size, height), icBodyMat);
                body.position.z = height / 2;
                body.castShadow = true;
                group.add(body);

                // Pin 1 Dot
                var dot = new THREE.Mesh(new THREE.CircleGeometry(0.5, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
                dot.position.set(-size / 2 + 1.2, size / 2 - 1.2, height + 0.01);
                group.add(dot);
                compMesh = group;
            }
            // 4. SMD Passives (Resistors, Capacitors: 0402, 0603, 0805, 1206)
            else if (pkgName.match(/0402|0603|0805|1206|R0805|C0805/)) {
                var group = new THREE.Group();
                var isCap = ref.indexOf("C") === 0;
                var l = 2.0, w = 1.25, h = 0.9;
                if (pkgName.indexOf("0603") !== -1) { l = 1.6; w = 0.8; h = 0.8; }
                if (pkgName.indexOf("0402") !== -1) { l = 1.0; w = 0.5; h = 0.5; }
                if (pkgName.indexOf("1206") !== -1) { l = 3.2; w = 1.6; h = 1.1; }

                // Center Ceramic Body
                var mat = isCap ? capacitorMat : resistorMat;
                var body = new THREE.Mesh(new THREE.BoxGeometry(l * 0.65, w, h), mat);
                body.position.z = h / 2;
                group.add(body);

                // Silver Metallic End Terminals
                var capTermL = new THREE.Mesh(new THREE.BoxGeometry(l * 0.22, w * 1.02, h * 1.02), pinLeadMat);
                capTermL.position.set(-l * 0.4, 0, h / 2);
                group.add(capTermL);

                var capTermR = new THREE.Mesh(new THREE.BoxGeometry(l * 0.22, w * 1.02, h * 1.02), pinLeadMat);
                capTermR.position.set(l * 0.4, 0, h / 2);
                group.add(capTermR);

                compMesh = group;
            }
            // 5. Pin Headers & Connectors
            else if (pkgName.indexOf("PINHD") !== -1 || pkgName.indexOf("HEADER") !== -1 || pkgName.indexOf("1X") === 0 || pkgName.indexOf("2X") === 0) {
                var group = new THREE.Group();
                var count = 4;
                var match = pkgName.match(/\d+/);
                if (match) count = parseInt(match[0]);

                var baseLen = count * 2.54;
                var baseGeom = new THREE.BoxGeometry(2.5, baseLen, 2.5);
                var base = new THREE.Mesh(baseGeom, icBodyMat);
                base.position.z = 1.25;
                group.add(base);

                // Protruding Gold Pins
                for (var p = 0; p < count; p++) {
                    var pin = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.64, 6.0), goldPinMat);
                    pin.position.set(0, (p - (count - 1) / 2) * 2.54, 4.0);
                    group.add(pin);
                }
                compMesh = group;
            }
            // 6. Cylindrical Electrolytic Capacitors
            else if (pkgName.indexOf("PANASONIC") !== -1 || (ref.indexOf("C") === 0 && pkgName.indexOf("ELECTRO") !== -1)) {
                var group = new THREE.Group();
                var radius = 3.2;
                var height = 6.5;
                var can = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 16), metalCanMat);
                can.rotateX(Math.PI / 2);
                can.position.z = height / 2;
                can.castShadow = true;
                group.add(can);
                compMesh = group;
            }
            // 7. Crystal Oscillator (HC-49)
            else if (pkgName.indexOf("HC49") !== -1 || pkgName.indexOf("CRYSTAL") !== -1) {
                var group = new THREE.Group();
                var can = new THREE.Mesh(new THREE.BoxGeometry(4.8, 11.2, 3.5), metalCanMat);
                can.position.z = 1.75;
                can.castShadow = true;
                group.add(can);
                compMesh = group;
            }

            // Position & Attach to board
            if (compMesh) {
                compMesh.position.set(elem.x, elem.y, compZ);
                compMesh.rotation.z = angleRad;
                if (isBottom) {
                    compMesh.rotation.x = Math.PI; // Flip upside-down for bottom mount
                }
                componentsGroup.add(compMesh);
            }
        }
    }

    function animate() {
        if (!isInitialized) return;
        animationId = requestAnimationFrame(animate);

        if (controls) {
            if (settings.autoRotate) {
                boardGroup.rotation.z += 0.008;
            }
            controls.update();
        }

        renderer.render(scene, camera);
    }

    // Public API
    return {
        init: init,
        setMaskColor: function(colorKey) {
            if (colorPresets[colorKey]) {
                settings.maskColor = colorPresets[colorKey].mask;
                buildScene();
            }
        },
        toggleXRay: function() {
            settings.xray = !settings.xray;
            buildScene();
            return settings.xray;
        },
        toggleComponents: function() {
            settings.showComponents = !settings.showComponents;
            if (componentsGroup) {
                componentsGroup.visible = settings.showComponents;
            }
            return settings.showComponents;
        },
        toggleAutoRotate: function() {
            settings.autoRotate = !settings.autoRotate;
            return settings.autoRotate;
        },
        resetView: function(viewName) {
            if (!currentData || !currentData.board) return;
            var bounds = currentData.board.bounds;
            var maxDim = Math.max(bounds.width, bounds.height);

            if (viewName === "top") {
                camera.position.set(0, 0, maxDim * 1.5);
                camera.up.set(0, 1, 0);
            } else if (viewName === "bottom") {
                camera.position.set(0, 0, -maxDim * 1.5);
                camera.up.set(0, 1, 0);
            } else {
                // Iso default
                camera.position.set(0, -maxDim * 1.1, maxDim * 0.95);
                camera.up.set(0, 0, 1);
            }
            if (controls) {
                controls.target.set(0, 0, 0);
                controls.update();
            }
        }
    };
})();
