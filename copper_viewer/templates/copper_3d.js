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
    var boardGroup, componentsGroup, copperGroup, silkscreenGroup, lightsGroup, floorGroup;
    var modelRegistry = {};
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
        showFloor: true,
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
        silkscreenGroup = new THREE.Group();
        componentsGroup = new THREE.Group();

        boardGroup.add(copperGroup);
        boardGroup.add(silkscreenGroup);
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

        // Build Silkscreen (Layers 21/51 Top, 22/52 Bottom)
        buildSilkscreen(bounds);

        // Build Parametric 3D Components
        buildComponents();

        // Build Studio Floor Grid
        if (floorGroup) scene.remove(floorGroup);
        floorGroup = new THREE.Group();
        if (settings.showFloor) {
            var gridDim = Math.max(bounds.width, bounds.height) * 2.8;
            var grid = new THREE.GridHelper(gridDim, 36, 0x00ffcc, 0x222630);
            grid.rotation.x = Math.PI / 2;
            grid.position.z = -settings.thickness / 2 - 2.0;
            floorGroup.add(grid);
        }
        scene.add(floorGroup);

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
            bevelEnabled: false,
            steps: 1
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
        var zTop = t / 2 + 0.03;
        var zBottom = -t / 2 - 0.03;
        var zTopPad = t / 2 + 0.04;
        var zBottomPad = -t / 2 - 0.04;

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
            var pkg = packages[elem.library + "_" + elem.package] || packages[elem.package];
            if (!pkg) continue;

            var eRad = (parseFloat(elem.rot.replace(/[^0-9.-]/g, "")) || 0) * Math.PI / 180;
            var isBottom = elem.rot.indexOf("M") !== -1;
            var zPad = isBottom ? zBottomPad : zTopPad;

            // SMD Pads
            var smds = pkg.smds || [];
            for (var m = 0; m < smds.length; m++) {
                var smd = smds[m];
                var padGeom = new THREE.BoxGeometry(smd.dx, smd.dy, 0.04);
                var padMesh = new THREE.Mesh(padGeom, isBottom ? copperMatBottom : copperMatTop);

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
                topMesh.position.set(elem.x + lx, elem.y + ly, zTopPad);
                copperGroup.add(topMesh);

                // Bottom pad ring
                var botMesh = new THREE.Mesh(padCyl, copperMatBottom);
                botMesh.position.set(elem.x + lx, elem.y + ly, zBottomPad);
                copperGroup.add(botMesh);
            }
        }

        // 2. Copper Signal Traces & Polygons
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

            // Signal Polygons (Copper Fills / Planes)
            // Note: In unpoured/unfilled EAGLE files, polygon elements define boundaries.
            // Rendering them as solid fills obscures all inner traces and pads.
            // We render the boundary wires with width or outline.
            var polys = signals[s].polygons || [];
            for (var py = 0; py < polys.length; py++) {
                var poly = polys[py];
                if (!poly.vertices || poly.vertices.length < 2) continue;
                var polyWidth = Math.max(poly.width || 0.254, 0.2);
                var pMat = (poly.layer === 16) ? copperMatBottom : copperMatTop;
                var zPoly = (poly.layer === 16) ? zBottom : zTop;

                for (var vIdx = 0; vIdx < poly.vertices.length; vIdx++) {
                    var v1 = poly.vertices[vIdx];
                    var v2 = poly.vertices[(vIdx + 1) % poly.vertices.length];
                    var pdx = v2.x - v1.x;
                    var pdy = v2.y - v1.y;
                    var pLen = Math.sqrt(pdx * pdx + pdy * pdy);
                    if (pLen < 0.01) continue;

                    var pGeom = new THREE.BoxGeometry(polyWidth, pLen, 0.02);
                    var pMesh = new THREE.Mesh(pGeom, pMat);
                    pMesh.position.set((v1.x + v2.x) / 2, (v1.y + v2.y) / 2, zPoly);
                    pMesh.rotation.z = Math.atan2(pdy, pdx) - Math.PI / 2;
                    copperGroup.add(pMesh);
                }
            }
        }
    }

    function buildSilkscreen(bounds) {
        var elements = currentData.board.elements || [];
        var packages = currentData.board.packages || {};
        var plain = currentData.board.plain || [];
        var t = settings.thickness;
        var zTop = t / 2 + 0.05;
        var zBottom = -t / 2 - 0.05;

        var bw = bounds.width || 80;
        var bh = bounds.height || 60;
        var minX = bounds.min_x || 0;
        var minY = bounds.min_y || 0;
        var texDim = 2048;

        function toPxTop(x, y) {
            return {
                x: ((x - minX) / bw) * texDim,
                y: (1.0 - (y - minY) / bh) * texDim
            };
        }

        function toPxBot(x, y) {
            return {
                x: ((x - minX) / bw) * texDim,
                y: (1.0 - (y - minY) / bh) * texDim
            };
        }

        // 1. Top Silkscreen Texture (Layers 21, 51)
        var canvasTop = document.createElement("canvas");
        canvasTop.width = texDim;
        canvasTop.height = texDim;
        var ctxTop = canvasTop.getContext("2d");
        ctxTop.clearRect(0, 0, texDim, texDim);

        ctxTop.strokeStyle = "#ffffff";
        ctxTop.fillStyle = "#ffffff";
        ctxTop.lineCap = "round";
        ctxTop.lineJoin = "round";

        // Plain silkscreen lines & text (Top L21)
        for (var i = 0; i < plain.length; i++) {
            var item = plain[i];
            if (item.layer === 21) {
                if (item.x1 !== undefined && item.x2 !== undefined) {
                    var p1 = toPxTop(item.x1, item.y1);
                    var p2 = toPxTop(item.x2, item.y2);
                    var lw = Math.max((item.width || 0.15) * (texDim / bw), 2.0);
                    ctxTop.lineWidth = lw;
                    ctxTop.beginPath();
                    ctxTop.moveTo(p1.x, p1.y);
                    ctxTop.lineTo(p2.x, p2.y);
                    ctxTop.stroke();
                } else if (item.text) {
                    var pt = toPxTop(item.x, item.y);
                    var fontSize = Math.max((item.size || 1.5) * (texDim / bw), 16);
                    ctxTop.font = "bold " + fontSize.toFixed(0) + "px sans-serif";
                    ctxTop.fillText(item.text, pt.x, pt.y);
                }
            }
        }

        // Element packages silkscreen (Top L21, L51)
        for (var e = 0; e < elements.length; e++) {
            var el = elements[e];
            var isBottom = (el.rot || "").indexOf("M") !== -1;
            if (isBottom) continue;

            var pkg = packages[el.library + "_" + el.package] || packages[el.package];
            if (!pkg) continue;

            var eRad = (parseFloat(el.rot.replace(/[^0-9.-]/g, "")) || 0) * Math.PI / 180;
            var wires = pkg.wires || [];
            for (var w = 0; w < wires.length; w++) {
                var wire = wires[w];
                if (wire.layer === 21 || wire.layer === 51) {
                    var x1 = el.x + wire.x1 * Math.cos(eRad) - wire.y1 * Math.sin(eRad);
                    var y1 = el.y + wire.x1 * Math.sin(eRad) + wire.y1 * Math.cos(eRad);
                    var x2 = el.x + wire.x2 * Math.cos(eRad) - wire.y2 * Math.sin(eRad);
                    var y2 = el.y + wire.x2 * Math.sin(eRad) + wire.y2 * Math.cos(eRad);

                    var p1 = toPxTop(x1, y1);
                    var p2 = toPxTop(x2, y2);
                    var lw = Math.max((wire.width || 0.15) * (texDim / bw), 2.0);
                    ctxTop.lineWidth = lw;
                    ctxTop.beginPath();
                    ctxTop.moveTo(p1.x, p1.y);
                    ctxTop.lineTo(p2.x, p2.y);
                    ctxTop.stroke();
                }
            }

            // Element Ref Designator text
            if (el.name) {
                var pt = toPxTop(el.x, el.y);
                var fontSize = Math.max(1.1 * (texDim / bw), 13);
                ctxTop.font = "600 " + fontSize.toFixed(0) + "px monospace";
                ctxTop.fillText(el.name, pt.x - fontSize, pt.y);
            }
        }

        var topTex = new THREE.CanvasTexture(canvasTop);
        topTex.generateMipmaps = true;
        topTex.minFilter = THREE.LinearMipmapLinearFilter;
        var topSilkMat = new THREE.MeshBasicMaterial({
            map: topTex,
            transparent: true,
            opacity: 0.95,
            depthWrite: false
        });

        var planeTopGeom = new THREE.PlaneGeometry(bw, bh);
        var planeTop = new THREE.Mesh(planeTopGeom, topSilkMat);
        planeTop.position.set(minX + bw / 2, minY + bh / 2, zTop);
        silkscreenGroup.add(planeTop);

        // 2. Bottom Silkscreen Texture (Layers 22, 52)
        var canvasBot = document.createElement("canvas");
        canvasBot.width = texDim;
        canvasBot.height = texDim;
        var ctxBot = canvasBot.getContext("2d");
        ctxBot.clearRect(0, 0, texDim, texDim);

        ctxBot.strokeStyle = "#ffffff";
        ctxBot.fillStyle = "#ffffff";
        ctxBot.lineCap = "round";
        ctxBot.lineJoin = "round";

        for (var i = 0; i < plain.length; i++) {
            var item = plain[i];
            if (item.layer === 22) {
                if (item.x1 !== undefined && item.x2 !== undefined) {
                    var p1 = toPxBot(item.x1, item.y1);
                    var p2 = toPxBot(item.x2, item.y2);
                    var lw = Math.max((item.width || 0.15) * (texDim / bw), 2.0);
                    ctxBot.lineWidth = lw;
                    ctxBot.beginPath();
                    ctxBot.moveTo(p1.x, p1.y);
                    ctxBot.lineTo(p2.x, p2.y);
                    ctxBot.stroke();
                } else if (item.text) {
                    var pt = toPxBot(item.x, item.y);
                    var fontSize = Math.max((item.size || 1.5) * (texDim / bw), 16);
                    ctxBot.font = "bold " + fontSize.toFixed(0) + "px sans-serif";
                    ctxBot.fillText(item.text, pt.x, pt.y);
                }
            }
        }

        var botTex = new THREE.CanvasTexture(canvasBot);
        botTex.generateMipmaps = true;
        botTex.minFilter = THREE.LinearMipmapLinearFilter;
        var botSilkMat = new THREE.MeshBasicMaterial({
            map: botTex,
            transparent: true,
            opacity: 0.95,
            depthWrite: false
        });

        var planeBotGeom = new THREE.PlaneGeometry(bw, bh);
        var planeBot = new THREE.Mesh(planeBotGeom, botSilkMat);
        planeBot.position.set(minX + bw / 2, minY + bh / 2, zBottom);
        planeBot.rotation.y = Math.PI;
        silkscreenGroup.add(planeBot);
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
            color: 0xe2e8f0, // Clean aluminum/steel
            metalness: 0.6,
            roughness: 0.3
        });

        function getResistorColorBands(valStr) {
            if (!valStr) return [0x8b4513, 0x111111, 0xea580c, 0xd4af37];
            var s = valStr.toUpperCase().replace(/\s+/g, "");
            var mult = 1;
            if (s.indexOf("K") !== -1) {
                mult = 1000;
                s = s.replace("K", ".");
            } else if (s.indexOf("M") !== -1) {
                mult = 1000000;
                s = s.replace("M", ".");
            } else if (s.indexOf("R") !== -1) {
                mult = 1;
                s = s.replace("R", ".");
            }
            var num = parseFloat(s) * mult;
            if (isNaN(num) || num <= 0) return [0x8b4513, 0x111111, 0xea580c, 0xd4af37];

            var colorTable = [
                0x111111, 0x8b4513, 0xdc2626, 0xea580c, 0xeab308,
                0x16a34a, 0x2563eb, 0x7c3aed, 0x6b7280, 0xf8fafc
            ];

            var exp = Math.floor(Math.log10(num));
            var norm = num / Math.pow(10, exp);
            var d1 = Math.floor(norm);
            var d2 = Math.floor((norm - d1) * 10 + 0.001);
            var band1 = colorTable[d1] || 0x8b4513;
            var band2 = colorTable[d2] || 0x111111;
            var multiplierExp = exp - 1;
            var band3 = (multiplierExp >= 0 && multiplierExp < colorTable.length) ? colorTable[multiplierExp] : 0xd4af37;
            var band4 = 0xd4af37;
            return [band1, band2, band3, band4];
        }

        for (var i = 0; i < elements.length; i++) {
            var elem = elements[i];
            var pkgName = (elem.package || "").toUpperCase();
            var ref = (elem.name || "").toUpperCase();
            var val = (elem.value || "").toUpperCase();
            var angleRad = (parseFloat(elem.rot.replace(/[^0-9.-]/g, "")) || 0) * Math.PI / 180;
            var isBottom = elem.rot.indexOf("M") !== -1;
            var compZ = isBottom ? (-t / 2 - 0.04) : zSurfaceTop;

            var compMesh = null;

            // 0. Custom 3D Model Library (EagleUp style)
            var fullPkgName = (elem.library ? (elem.library + "_" + elem.package) : elem.package).toUpperCase();
            var customFactory = modelRegistry[pkgName] || modelRegistry[fullPkgName];
            if (customFactory) {
                if (typeof customFactory === "function") {
                    compMesh = customFactory(elem, packages[elem.library + "_" + elem.package] || packages[elem.package]);
                } else if (customFactory.clone) {
                    compMesh = customFactory.clone();
                }
            }

            if (!compMesh) {
                // 1. Dual In-Line Package (DIP / DIL)
                if (pkgName.indexOf("DIP") !== -1 || pkgName.indexOf("DIL") !== -1) {
                var pins = 8;
                var match = pkgName.match(/\d+/);
                if (match) pins = parseInt(match[0]);
                var pinsPerSide = Math.max(Math.floor(pins / 2), 4);
                var length = pinsPerSide * 2.54 + 1.2;
                var width = 7.62;
                var height = 3.4;

                var group = new THREE.Group();
                // IC Body (aligned with X axis)
                var bodyGeom = new THREE.BoxGeometry(length, width, height);
                var body = new THREE.Mesh(bodyGeom, icBodyMat);
                body.position.z = height / 2;
                body.castShadow = true;
                group.add(body);

                // Pin 1 Notch on left (-X)
                var notchGeom = new THREE.CylinderGeometry(0.8, 0.8, 0.3, 12);
                var notch = new THREE.Mesh(notchGeom, new THREE.MeshBasicMaterial({ color: 0x050505 }));
                notch.position.set(-length / 2, 0, height);
                group.add(notch);

                compMesh = group;
            }
            // 2. Small Outline (SOIC / SOP / SSOP / TSSOP / MSOP) with discrete Gull-Wing leads
            else if ((pkgName.indexOf("SOIC") !== -1 || pkgName.indexOf("SOP") !== -1 || pkgName.indexOf("SSOP") !== -1 || pkgName.indexOf("TSSOP") !== -1 || pkgName.indexOf("MSOP") !== -1 || pkgName.indexOf("SO8") !== -1 || pkgName.indexOf("SO14") !== -1 || pkgName.indexOf("SO16") !== -1) && pkgName.indexOf("SOT") === -1) {
                var group = new THREE.Group();
                var pins = 8;
                var match = pkgName.match(/\d+/);
                if (match) pins = Math.min(parseInt(match[0]), 64);
                var pitch = (pkgName.indexOf("TSSOP") !== -1 || pkgName.indexOf("MSOP") !== -1) ? 0.65 : 1.27;
                var pinsPerSide = Math.max(Math.floor(pins / 2), 4);
                var length = pinsPerSide * pitch + 0.8;
                var width = (pkgName.indexOf("MSOP") !== -1) ? 3.0 : 4.2;
                var height = (pkgName.indexOf("MSOP") !== -1) ? 1.0 : 1.4;

                var body = new THREE.Mesh(new THREE.BoxGeometry(width, length, height), icBodyMat);
                body.position.z = height / 2;
                body.castShadow = true;
                group.add(body);

                // Pin 1 Index Dot
                var dot = new THREE.Mesh(new THREE.CircleGeometry(0.35, 12), new THREE.MeshBasicMaterial({ color: 0x666666 }));
                dot.position.set(-width / 2 + 0.8, length / 2 - 0.8, height + 0.01);
                group.add(dot);

                // Discrete Gull-Wing Silver Leads
                for (var p = 0; p < pinsPerSide; p++) {
                    var yPos = (p - (pinsPerSide - 1) / 2) * pitch;
                    for (var side = -1; side <= 1; side += 2) {
                        var lead = new THREE.Mesh(new THREE.BoxGeometry(0.9, pitch * 0.45, 0.18), pinLeadMat);
                        lead.position.set(side * (width / 2 + 0.45), yPos, 0.09);
                        group.add(lead);
                    }
                }
                compMesh = group;
            }
            // 2b. SOT-223 Voltage Regulators
            else if (pkgName.indexOf("SOT223") !== -1) {
                var group = new THREE.Group();
                var body = new THREE.Mesh(new THREE.BoxGeometry(3.5, 6.5, 1.6), icBodyMat);
                body.position.z = 0.8;
                body.castShadow = true;
                group.add(body);

                for (var s = -1; s <= 1; s++) {
                    var lead = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.2), pinLeadMat);
                    lead.position.set(-2.2, s * 2.3, 0.1);
                    group.add(lead);
                }
                var tab = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3.0, 0.2), pinLeadMat);
                tab.position.set(2.2, 0, 0.1);
                group.add(tab);
                compMesh = group;
            }
            // 2c. SOT-23 Small Signal Transistors
            else if (pkgName.indexOf("SOT") !== -1) {
                var group = new THREE.Group();
                var body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.9, 1.0), icBodyMat);
                body.position.z = 0.5;
                body.castShadow = true;
                group.add(body);

                for (var s = -1; s <= 1; s += 2) {
                    var lead = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.15), pinLeadMat);
                    lead.position.set(-1.1, s * 0.95, 0.08);
                    group.add(lead);
                }
                var lead3 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.15), pinLeadMat);
                lead3.position.set(1.1, 0, 0.08);
                group.add(lead3);
                compMesh = group;
            }
            // Axial Through-Hole Resistors (0204, 0207, AXIAL) with real color bands
            else if (ref.indexOf("R") === 0 && (pkgName.indexOf("0204") !== -1 || pkgName.indexOf("0207") !== -1 || pkgName.indexOf("AXIAL") !== -1 || (!pkgName.match(/0402|0603|0805|1206/) && pkgName.indexOf("/") !== -1))) {
                var group = new THREE.Group();
                var bands = getResistorColorBands(val);
                var bodyLen = 6.2;
                var bodyRadius = 1.2;

                var bodyMat = new THREE.MeshStandardMaterial({ color: 0xd9b88c, roughness: 0.6 });
                var bodyGeom = new THREE.CylinderGeometry(bodyRadius, bodyRadius, bodyLen, 16);
                bodyGeom.rotateZ(Math.PI / 2);
                var body = new THREE.Mesh(bodyGeom, bodyMat);
                body.position.z = bodyRadius + 0.6;
                body.castShadow = true;
                group.add(body);

                // 4 Color Bands
                var bandOffsets = [-1.8, -0.7, 0.4, 1.8];
                for (var b = 0; b < 4; b++) {
                    var bandMat = new THREE.MeshBasicMaterial({ color: bands[b] });
                    var bandGeom = new THREE.CylinderGeometry(bodyRadius + 0.02, bodyRadius + 0.02, 0.45, 16);
                    bandGeom.rotateZ(Math.PI / 2);
                    var bandMesh = new THREE.Mesh(bandGeom, bandMat);
                    bandMesh.position.set(bandOffsets[b], 0, bodyRadius + 0.6);
                    group.add(bandMesh);
                }

                // Curved Wire Leads
                var leadLen = 10.0;
                var leadWireGeom = new THREE.CylinderGeometry(0.3, 0.3, leadLen, 8);
                leadWireGeom.rotateZ(Math.PI / 2);
                var leadWire = new THREE.Mesh(leadWireGeom, pinLeadMat);
                leadWire.position.z = bodyRadius + 0.6;
                group.add(leadWire);

                for (var s = -1; s <= 1; s += 2) {
                    var vPinGeom = new THREE.CylinderGeometry(0.3, 0.3, bodyRadius + 0.8, 8);
                    var vPin = new THREE.Mesh(vPinGeom, pinLeadMat);
                    vPin.position.set(s * (leadLen / 2), 0, (bodyRadius + 0.8) / 2);
                    group.add(vPin);
                }

                compMesh = group;
            }
            // Axial Diodes (DO-35, DO-41) with silver cathode band
            else if (ref.indexOf("D") === 0 && (pkgName.indexOf("DO") !== -1 || pkgName.indexOf("SOD") !== -1 || pkgName.indexOf("DIODE") !== -1)) {
                var group = new THREE.Group();
                var bodyLen = 5.0;
                var bodyRadius = 1.1;

                var diodeMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.4 });
                var bodyGeom = new THREE.CylinderGeometry(bodyRadius, bodyRadius, bodyLen, 16);
                bodyGeom.rotateZ(Math.PI / 2);
                var body = new THREE.Mesh(bodyGeom, diodeMat);
                body.position.z = bodyRadius + 0.5;
                body.castShadow = true;
                group.add(body);

                var stripeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.2 });
                var stripeGeom = new THREE.CylinderGeometry(bodyRadius + 0.02, bodyRadius + 0.02, 0.6, 16);
                stripeGeom.rotateZ(Math.PI / 2);
                var stripe = new THREE.Mesh(stripeGeom, stripeMat);
                stripe.position.set(-1.6, 0, bodyRadius + 0.5);
                group.add(stripe);

                var leadLen = 9.0;
                var leadWireGeom = new THREE.CylinderGeometry(0.28, 0.28, leadLen, 8);
                leadWireGeom.rotateZ(Math.PI / 2);
                var leadWire = new THREE.Mesh(leadWireGeom, pinLeadMat);
                leadWire.position.z = bodyRadius + 0.5;
                group.add(leadWire);

                for (var s = -1; s <= 1; s += 2) {
                    var vPinGeom = new THREE.CylinderGeometry(0.28, 0.28, bodyRadius + 0.7, 8);
                    var vPin = new THREE.Mesh(vPinGeom, pinLeadMat);
                    vPin.position.set(s * (leadLen / 2), 0, (bodyRadius + 0.7) / 2);
                    group.add(vPin);
                }

                compMesh = group;
            }
            // 3. Quad Flat Package (QFP / TQFP / QFN / MLF)
            else if (pkgName.indexOf("QFP") !== -1 || pkgName.indexOf("QFN") !== -1 || pkgName.indexOf("MLF") !== -1) {
                var group = new THREE.Group();
                var size = (pkgName.indexOf("32") !== -1) ? 7.0 : 12.0;
                var height = 1.0;
                var body = new THREE.Mesh(new THREE.BoxGeometry(size, size, height), icBodyMat);
                body.position.z = height / 2;
                body.castShadow = true;
                group.add(body);

                // Pin 1 Dot
                var dot = new THREE.Mesh(new THREE.CircleGeometry(0.4, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
                dot.position.set(-size / 2 + 1.0, size / 2 - 1.0, height + 0.01);
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
            // 5. Pin Headers & Connectors (1X06, 1X08, 1X10, 2X03, etc.)
            else if (pkgName.indexOf("PINHD") !== -1 || pkgName.indexOf("HEADER") !== -1 || pkgName.indexOf("1X") === 0 || pkgName.indexOf("2X") === 0) {
                var group = new THREE.Group();
                var rows = 1, cols = 4;
                var m = pkgName.match(/(\d+)X(\d+)/i);
                if (m) {
                    rows = parseInt(m[1]) || 1;
                    cols = parseInt(m[2]) || 4;
                } else {
                    var m2 = pkgName.match(/\d+/);
                    if (m2) cols = parseInt(m2[0]) || 4;
                }

                var baseW = cols * 2.54;
                var baseH = rows * 2.54;
                var baseGeom = new THREE.BoxGeometry(baseW, baseH, 2.5);
                var base = new THREE.Mesh(baseGeom, icBodyMat);
                base.position.z = 1.25;
                group.add(base);

                // Protruding Gold Pins
                for (var r = 0; r < rows; r++) {
                    for (var c = 0; c < cols; c++) {
                        var pin = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.64, 6.0), goldPinMat);
                        var xPin = (c - (cols - 1) / 2) * 2.54;
                        var yPin = (r - (rows - 1) / 2) * 2.54;
                        pin.position.set(xPin, yPin, 4.0);
                        group.add(pin);
                    }
                }
                compMesh = group;
            }
            // 6. Cylindrical SMD Electrolytic Capacitors (Panasonic / CPOL)
            else if (pkgName.indexOf("PANASONIC") !== -1 || ref.indexOf("PC") === 0 || (ref.indexOf("C") === 0 && pkgName.indexOf("ELECTRO") !== -1)) {
                var group = new THREE.Group();
                var radius = (pkgName.indexOf("_D") !== -1 || pkgName.indexOf("6.3") !== -1) ? 3.15 : 2.5;
                var height = 5.5;
                var baseDim = radius * 2 + 0.4;

                // Black square base with chamfer
                var base = new THREE.Mesh(new THREE.BoxGeometry(baseDim, baseDim, 0.8), icBodyMat);
                base.position.z = 0.4;
                group.add(base);

                // Silver Aluminum Can
                var can = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 20), metalCanMat);
                can.rotateX(Math.PI / 2);
                can.position.z = 0.8 + height / 2;
                can.castShadow = true;
                group.add(can);

                // Black negative polarity stripe on top
                var topStripeGeom = new THREE.BoxGeometry(radius * 0.8, radius * 1.8, 0.05);
                var topStripe = new THREE.Mesh(topStripeGeom, icBodyMat);
                topStripe.position.set(-radius * 0.45, 0, 0.8 + height + 0.03);
                group.add(topStripe);

                compMesh = group;
            }
            // 7. USB Connectors (USB-B on Uno PN61729, USB-C, etc.)
            else if (pkgName.indexOf("PN61729") !== -1 || pkgName.indexOf("USB") !== -1) {
                var group = new THREE.Group();
                var isTypeB = pkgName.indexOf("PN61729") !== -1 || pkgName.indexOf("USB-B") !== -1;
                if (isTypeB) {
                    var w = 12.0, l = 16.0, h = 11.0;
                    var shield = new THREE.Mesh(new THREE.BoxGeometry(w, l, h), metalCanMat);
                    shield.position.set(0, -2.2, h / 2);
                    shield.castShadow = true;
                    group.add(shield);

                    // Inner cavity & tongue
                    var cavity = new THREE.Mesh(new THREE.BoxGeometry(w * 0.68, 1.5, h * 0.55), icBodyMat);
                    cavity.position.set(0, -2.2 - l / 2 + 0.5, h / 2);
                    group.add(cavity);
                } else {
                    var w = 9.0, l = 7.5, h = 3.2;
                    var shield = new THREE.Mesh(new THREE.BoxGeometry(w, l, h), metalCanMat);
                    shield.position.set(0, 0, h / 2);
                    shield.castShadow = true;
                    group.add(shield);
                }
                compMesh = group;
            }
            // 8. DC Power Barrel Jack (Uno X1: POWERSUPPLY_DC-21MM)
            else if (pkgName.indexOf("POWERSUPPLY") !== -1 || pkgName.indexOf("DC-21") !== -1 || pkgName.indexOf("BARREL") !== -1) {
                var group = new THREE.Group();
                var w = 9.0, l = 14.5, h = 11.0;
                var body = new THREE.Mesh(new THREE.BoxGeometry(w, l, h), icBodyMat);
                body.position.set(-0.5, 0.5, h / 2);
                body.castShadow = true;
                group.add(body);

                // Circular jack opening
                var holeGeom = new THREE.CylinderGeometry(3.2, 3.2, 2.0, 16);
                var hole = new THREE.Mesh(holeGeom, new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9 }));
                hole.rotateX(Math.PI / 2);
                hole.position.set(-0.5, 0.5 - l / 2 - 0.1, h / 2);
                group.add(hole);

                // Center brass pin
                var pinGeom = new THREE.CylinderGeometry(0.9, 0.9, 4.0, 12);
                var centerPin = new THREE.Mesh(pinGeom, goldPinMat);
                centerPin.rotateX(Math.PI / 2);
                centerPin.position.set(-0.5, 0.5 - l / 2 + 1.5, h / 2);
                group.add(centerPin);

                compMesh = group;
            }
            // 9. Tactile Push Button (TS42 / B3F / Reset Switch)
            else if (pkgName.indexOf("TS42") !== -1 || pkgName.indexOf("B3F") !== -1 || pkgName.indexOf("TACT") !== -1 || (ref.indexOf("RESET") !== -1 && pkgName.indexOf("BUTTON") !== -1)) {
                var group = new THREE.Group();
                var s = 6.0, h = 3.2;
                var base = new THREE.Mesh(new THREE.BoxGeometry(s, s, h), metalCanMat);
                base.position.z = h / 2;
                base.castShadow = true;
                group.add(base);

                // Round button plunger
                var btnGeom = new THREE.CylinderGeometry(1.6, 1.6, 1.2, 16);
                var btnActuator = new THREE.Mesh(btnGeom, icBodyMat);
                btnActuator.rotateX(Math.PI / 2);
                btnActuator.position.set(0, 0, h + 0.6);
                group.add(btnActuator);

                compMesh = group;
            }
            // 10. Ceramic Resonator (Murata CSTCE)
            else if (pkgName.indexOf("RESONATOR") !== -1 || pkgName.indexOf("CSTCE") !== -1) {
                var group = new THREE.Group();
                var body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.3, 1.0), capacitorMat);
                body.position.z = 0.5;
                body.castShadow = true;
                group.add(body);
                compMesh = group;
            }
            // 11. Crystal Oscillator (HC-49 / QS)
            else if (pkgName.indexOf("HC49") !== -1 || pkgName.indexOf("CRYSTAL") !== -1 || pkgName.indexOf("QS") !== -1) {
                var group = new THREE.Group();
                var can = new THREE.Mesh(new THREE.BoxGeometry(4.8, 11.2, 3.5), metalCanMat);
                can.position.z = 1.75;
                can.castShadow = true;
                group.add(can);
                compMesh = group;
            }
            } // End of if (!compMesh)

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
        toggleFloor: function() {
            settings.showFloor = !settings.showFloor;
            if (floorGroup) {
                floorGroup.visible = settings.showFloor;
            }
            return settings.showFloor;
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
        },
        exportSnapshot: function() {
            if (!renderer || !scene || !camera) return;
            renderer.render(scene, camera);
            var dataUrl = renderer.domElement.toDataURL("image/png");
            var link = document.createElement("a");
            link.href = dataUrl;
            link.download = ((currentData && currentData.name) ? currentData.name : "circuit") + "_3d_snapshot.png";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            CopperTools.showNotification("📸 Captura 3D exportada con éxito.");
        },
        registerModel: function(pkgName, factoryOrMesh) {
            if (!pkgName) return;
            modelRegistry[pkgName.toUpperCase()] = factoryOrMesh;
        },
        getModelRegistry: function() {
            return modelRegistry;
        }
    };
})();
