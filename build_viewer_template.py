#!/usr/bin/env python3
"""
Constructs the complete, feature-rich Copper Viewer HTML template.
"""

import os
import re

def build_template():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    templates_dir = os.path.join(base_dir, "copper_viewer", "templates")
    
    with open(os.path.join(templates_dir, "viewer_base.html"), "r", encoding="utf-8") as f:
        html = f.read()

    with open(os.path.join(templates_dir, "copper_3d.js"), "r", encoding="utf-8") as f:
        c3d_js = f.read()

    with open(os.path.join(templates_dir, "copper_tools.js"), "r", encoding="utf-8") as f:
        ctools_js = f.read()

    with open(os.path.join(templates_dir, "copper_search.js"), "r", encoding="utf-8") as f:
        csearch_js = f.read()

    # 1. Copper Extra CSS
    copper_css = """
        /* === COPPER TOUCH UI ENHANCEMENTS === */
        .copper-tabs {
            display: flex;
            align-items: center;
            gap: 6px;
            background: rgba(255, 255, 255, 0.05);
            padding: 4px;
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .copper-tab {
            background: transparent;
            color: #a1a1aa;
            border: none;
            padding: 6px 14px;
            border-radius: 7px;
            font-size: 0.85rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .copper-tab:hover {
            color: #ffffff;
            background: rgba(255, 255, 255, 0.06);
        }
        .copper-tab.active {
            color: #ffffff;
            background: #2b313a;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }

        /* X-Ray / Mesa de Luz Mode */
        .xray-mode #pcbSvg {
            background: #081a14 !important;
            box-shadow: inset 0 0 100px rgba(0, 255, 170, 0.15);
        }
        .xray-mode #groupBottom {
            opacity: 0.85 !important;
            filter: drop-shadow(0 0 2px #0088ff);
        }
        .xray-mode #groupTop {
            opacity: 0.85 !important;
            filter: drop-shadow(0 0 2px #ff4444);
        }

        /* Net Glow Animation */
        .copper-net-glow {
            stroke: #00ffff !important;
            filter: drop-shadow(0 0 5px #00ffff) drop-shadow(0 0 10px #00ffff) !important;
            animation: copperNetPulse 1.2s infinite alternate ease-in-out !important;
        }
        @keyframes copperNetPulse {
            0% { filter: drop-shadow(0 0 3px #00ffff); opacity: 0.85; }
            100% { filter: drop-shadow(0 0 12px #00ffff) drop-shadow(0 0 20px #00ffff); opacity: 1.0; }
        }

        /* 3D Viewport & Controls Overlay */
        #copper-3d-panel {
            flex: 1;
            position: relative;
            background: #111215;
            display: none;
            height: calc(100vh - 60px);
        }
        #copper-3d-canvas-container {
            width: 100%;
            height: 100%;
        }
        .copper-3d-overlay {
            position: absolute;
            top: 20px;
            left: 20px;
            background: rgba(18, 20, 24, 0.85);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            padding: 14px 18px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            z-index: 50;
        }
        .copper-3d-title {
            font-size: 0.8rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #a1a1aa;
        }
        .color-palette {
            display: flex;
            gap: 8px;
        }
        .color-dot {
            width: 22px;
            height: 22px;
            border-radius: 50%;
            cursor: pointer;
            border: 2px solid transparent;
            transition: transform 0.15s ease, border-color 0.15s ease;
        }
        .color-dot:hover {
            transform: scale(1.15);
        }
        .color-dot.active {
            border-color: #ffffff;
            transform: scale(1.15);
        }
        .color-green { background: #0c5924; }
        .color-purple { background: #2e1147; }
        .color-black { background: #141518; }
        .color-blue { background: #0c3e7a; }
        .color-red { background: #731414; }
        .color-white { background: #e0e2e6; }

        .control-row {
            display: flex;
            gap: 6px;
        }
        .copper-mini-btn {
            background: rgba(255, 255, 255, 0.08);
            color: #e4e4e7;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 6px;
            padding: 5px 10px;
            font-size: 0.78rem;
            cursor: pointer;
            transition: all 0.15s ease;
        }
        .copper-mini-btn:hover {
            background: rgba(255, 255, 255, 0.15);
            color: #ffffff;
        }
        .copper-mini-btn.active {
            background: #6c5ce7;
            border-color: #6c5ce7;
        }

        /* Caliper Card Overlay */
        .copper-caliper-card {
            position: fixed;
            bottom: 24px;
            left: 24px;
            background: rgba(15, 17, 21, 0.92);
            backdrop-filter: blur(14px);
            border: 1px solid rgba(0, 255, 204, 0.3);
            border-radius: 12px;
            padding: 14px 18px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
            z-index: 1000;
            display: none;
            animation: fadeIn 0.2s ease;
            font-family: 'JetBrains Mono', monospace;
        }
        .caliper-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
            font-size: 0.8rem;
            color: #00ffcc;
        }
        .caliper-header button {
            background: transparent;
            border: none;
            color: #888;
            cursor: pointer;
            font-size: 0.9rem;
        }
        .caliper-primary {
            font-size: 1.25rem;
            font-weight: 700;
            color: #ffffff;
            margin-bottom: 4px;
        }
        .caliper-mils {
            font-size: 0.9rem;
            font-weight: 400;
            color: #a1a1aa;
        }
        .caliper-details {
            display: flex;
            gap: 14px;
            font-size: 0.78rem;
            color: #8e95a5;
        }

        /* BOM Table View */
        #copper-bom-panel {
            flex: 1;
            padding: 28px 36px;
            background: #111215;
            display: none;
            overflow-y: auto;
            height: calc(100vh - 60px);
        }
        .bom-header-bar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }
        .bom-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.88rem;
            text-align: left;
        }
        .bom-table th {
            padding: 12px 14px;
            border-bottom: 2px solid #23262d;
            color: #a1a1aa;
            font-weight: 600;
            text-transform: uppercase;
            font-size: 0.75rem;
            letter-spacing: 0.5px;
        }
        .bom-table td {
            padding: 12px 14px;
            border-bottom: 1px solid #1c1e24;
            color: #e4e4e7;
        }
        .bom-table tr:hover td {
            background: rgba(255, 255, 255, 0.02);
        }
        .bom-qty {
            color: #00ffcc !important;
            font-family: 'JetBrains Mono', monospace;
        }
        .copper-badge {
            background: rgba(255, 255, 255, 0.08);
            padding: 3px 8px;
            border-radius: 6px;
            font-size: 0.75rem;
            font-family: 'JetBrains Mono', monospace;
        }
        .dist-link {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 5px;
            font-size: 0.75rem;
            text-decoration: none;
            margin-right: 4px;
            font-weight: 500;
            transition: opacity 0.15s ease;
        }
        .dist-link:hover { opacity: 0.8; }
        .dist-link.dk { background: #cc0000; color: #fff; }
        .dist-link.ms { background: #004b87; color: #fff; }
        .dist-link.lc { background: #0076a8; color: #fff; }

        /* Gallery Dashboard */
        #copper-gallery-panel {
            flex: 1;
            padding: 32px 40px;
            background: #111215;
            display: none;
            overflow-y: auto;
            height: calc(100vh - 60px);
        }
        .gallery-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
            gap: 24px;
            margin-top: 24px;
        }
        .board-card {
            background: #181a20;
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 14px;
            padding: 18px;
            cursor: pointer;
            transition: all 0.25s ease;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .board-card:hover {
            transform: translateY(-4px);
            border-color: #00ffcc;
            box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4);
        }
        .card-thumb {
            width: 100%;
            height: 180px;
            background: #0b0c0e;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
        }
        .card-meta {
            display: flex;
            justify-content: space-between;
            font-size: 0.8rem;
            color: #8e95a5;
        }

        /* Search Bar & Dropdown Results */
        .copper-search-box {
            position: relative;
            display: flex;
            align-items: center;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 9px;
            padding: 2px 8px;
            min-width: 290px;
            transition: all 0.2s ease;
        }
        .copper-search-box:focus-within {
            border-color: #00ffcc;
            background: rgba(0, 0, 0, 0.5);
            box-shadow: 0 0 14px rgba(0, 255, 204, 0.25);
        }
        .search-scope-btn {
            background: rgba(255, 255, 255, 0.08);
            border: none;
            color: #00ffcc;
            font-size: 0.75rem;
            font-weight: 600;
            padding: 4px 8px;
            border-radius: 6px;
            cursor: pointer;
            margin-right: 6px;
            display: flex;
            align-items: center;
            gap: 4px;
            white-space: nowrap;
        }
        .search-scope-menu {
            position: absolute;
            top: 38px;
            left: 0;
            background: #181a20;
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 8px;
            padding: 6px 0;
            display: none;
            flex-direction: column;
            z-index: 1200;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
            min-width: 170px;
        }
        .search-scope-menu.visible { display: flex; }
        .scope-option {
            padding: 6px 14px;
            font-size: 0.8rem;
            color: #e4e4e7;
            cursor: pointer;
            transition: background 0.15s ease;
        }
        .scope-option:hover {
            background: rgba(0, 255, 204, 0.15);
            color: #00ffcc;
        }
        .search-input {
            background: transparent;
            border: none;
            outline: none;
            color: #ffffff;
            font-size: 0.85rem;
            flex: 1;
            padding: 6px 4px;
            font-family: inherit;
        }
        .search-input::placeholder {
            color: #71717a;
            font-size: 0.8rem;
        }
        .search-clear-btn {
            background: transparent;
            border: none;
            color: #71717a;
            cursor: pointer;
            font-size: 0.85rem;
            display: none;
            padding: 2px 4px;
        }
        .search-clear-btn:hover { color: #fff; }
        .search-results-dropdown {
            position: absolute;
            top: 42px;
            left: 0;
            right: 0;
            background: rgba(20, 22, 28, 0.96);
            backdrop-filter: blur(14px);
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 10px;
            max-height: 420px;
            overflow-y: auto;
            box-shadow: 0 12px 36px rgba(0, 0, 0, 0.6);
            z-index: 1100;
            display: none;
        }
        .search-group-title {
            padding: 8px 12px 4px 12px;
            font-size: 0.72rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #71717a;
            background: rgba(0, 0, 0, 0.2);
            border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        }
        .search-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 9px 12px;
            cursor: pointer;
            border-bottom: 1px solid rgba(255, 255, 255, 0.03);
            transition: all 0.12s ease;
        }
        .search-item:hover, .search-item.active {
            background: rgba(0, 255, 204, 0.12);
        }
        .search-item.active .search-item-title {
            color: #00ffcc;
        }
        .search-icon {
            font-size: 1rem;
        }
        .thumb-container {
            width: 38px;
            height: 38px;
            border-radius: 7px;
            background: #11141a;
            border: 1px solid rgba(255, 255, 255, 0.08);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            overflow: hidden;
            box-shadow: inset 0 0 6px rgba(0, 0, 0, 0.5);
        }
        .copper-micro-thumb {
            width: 32px;
            height: 32px;
            display: block;
        }
        .thumb-fallback {
            font-size: 1.1rem;
        }
        .search-item-info {
            flex: 1;
            overflow: hidden;
        }
        .search-item-title {
            font-size: 0.88rem;
            font-weight: 600;
            color: #ffffff;
            font-family: 'JetBrains Mono', monospace;
        }
        .search-item-sub {
            font-size: 0.75rem;
            color: #8e95a5;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .search-tag {
            font-size: 0.7rem;
            font-weight: 600;
            padding: 2px 6px;
            border-radius: 4px;
            background: rgba(255, 255, 255, 0.08);
            color: #a1a1aa;
        }
        .search-tag.signal-tag {
            background: rgba(0, 255, 204, 0.15);
            color: #00ffcc;
        }
        .search-empty {
            padding: 20px;
            text-align: center;
            font-size: 0.85rem;
            color: #a1a1aa;
        }

        /* Toast Notifications */
        .copper-toast {
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: rgba(18, 20, 24, 0.95);
            color: #ffffff;
            border: 1px solid rgba(0, 255, 204, 0.4);
            border-radius: 10px;
            padding: 12px 20px;
            font-size: 0.85rem;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.3s ease;
            z-index: 2000;
        }
        .copper-toast.visible {
            opacity: 1;
        }
    """

    # Inject CSS
    html = html.replace("</style>", copper_css + "\n    </style>")

    # 2. Inject Search Bar & Tabs into Header
    header_content = """
        <div style="display: flex; align-items: center; gap: 16px;">
            <h1>⚡ Copper <span>Viewer</span></h1>

            <!-- Copper Global Search (Parts, Signals, Both) -->
            <div class="copper-search-box" id="copper-search-container">
                <button class="search-scope-btn" id="copper-search-scope-btn" onclick="CopperSearch.toggleScopeDropdown()" title="Filtro de búsqueda: Ambos / Partes / Señales">Ambos ▾</button>
                <div class="search-scope-menu" id="copper-search-scope-menu">
                    <div class="scope-option" onclick="CopperSearch.setScope('both'); CopperSearch.toggleScopeDropdown();">⚡+📦 Ambos (Both)</div>
                    <div class="scope-option" onclick="CopperSearch.setScope('parts'); CopperSearch.toggleScopeDropdown();">📦 Componentes (Parts)</div>
                    <div class="scope-option" onclick="CopperSearch.setScope('signals'); CopperSearch.toggleScopeDropdown();">⚡ Señales / Redes (Signals)</div>
                </div>
                <input type="text" class="search-input" id="copper-search-input" placeholder="🔍 Buscar partes, señales (Ctrl+K)..." autocomplete="off" />
                <button class="search-clear-btn" id="copper-search-clear" onclick="CopperSearch.clearSearch()">✕</button>
                <div class="search-results-dropdown" id="copper-search-results"></div>
            </div>
        </div>

        <div class="copper-tabs">
            <button class="copper-tab active" onclick="switchCopperTab('tab-split')">📐+🟢 2D Dual</button>
            <button class="copper-tab" onclick="switchCopperTab('tab-pcb')">🟢 2D PCB</button>
            <button class="copper-tab" onclick="switchCopperTab('tab-3d')">🧊 3D Real View</button>
            <button class="copper-tab" onclick="switchCopperTab('tab-sch')">📐 Esquemático</button>
            <button class="copper-tab" onclick="switchCopperTab('tab-bom')">📋 Lista BOM</button>
            <button class="copper-tab" onclick="switchCopperTab('tab-gallery')">🖼️ Galería</button>
        </div>
    """

    # Insert brand, search bar, and tabs in header
    html = re.sub(r'<h1>.*?</h1>', header_content.strip(), html)

    # 3. Add new tool buttons in toolbar (X-Ray, Caliper, Net Glow)
    copper_tool_buttons = """
            <button id="btn-xray" class="copper-mini-btn" onclick="CopperTools.toggleXRay()" title="Modo Rayos X (Mesa de Luz)">💡 Rayos X</button>
            <button id="btn-caliper" class="copper-mini-btn" onclick="CopperTools.toggleCaliper()" title="Medición Caliper punto a punto">📏 Caliper</button>
    """
    html = html.replace('<div class="toolbar-tools">', '<div class="toolbar-tools">\n' + copper_tool_buttons)

    # 4. Inject 3D panel, BOM panel, Gallery panel after main container
    extra_panels = """
        <!-- 3D Real View Panel -->
        <div id="copper-3d-panel">
            <div id="copper-3d-canvas-container"></div>
            <div class="copper-3d-overlay">
                <div class="copper-3d-title">Color de Máscara (Solder Mask)</div>
                <div class="color-palette">
                    <div class="color-dot color-green active" onclick="set3DColor('green', this)" title="JLCPCB Green"></div>
                    <div class="color-dot color-purple" onclick="set3DColor('purple', this)" title="OSHPark Purple"></div>
                    <div class="color-dot color-black" onclick="set3DColor('black', this)" title="Matte Black"></div>
                    <div class="color-dot color-blue" onclick="set3DColor('blue', this)" title="Royal Blue"></div>
                    <div class="color-dot color-red" onclick="set3DColor('red', this)" title="Crimson Red"></div>
                    <div class="color-dot color-white" onclick="set3DColor('white', this)" title="Arctic White"></div>
                </div>
                <div class="copper-3d-title" style="margin-top:6px;">Vistas de Cámara</div>
                <div class="control-row">
                    <button class="copper-mini-btn" onclick="Copper3D.resetView('top')">Top</button>
                    <button class="copper-mini-btn" onclick="Copper3D.resetView('bottom')">Bottom</button>
                    <button class="copper-mini-btn" onclick="Copper3D.resetView('iso')">Iso</button>
                </div>
                <div class="control-row" style="margin-top:4px;">
                    <button id="btn-3d-spin" class="copper-mini-btn" onclick="toggle3DSpin(this)">🔄 Auto-Giro</button>
                    <button id="btn-3d-comp" class="copper-mini-btn active" onclick="toggle3DComponents(this)">Chips 3D</button>
                    <button id="btn-3d-xray" class="copper-mini-btn" onclick="toggle3DXRay(this)">Rayos X 3D</button>
                </div>
            </div>
        </div>

        <!-- BOM Panel -->
        <div id="copper-bom-panel">
            <div class="bom-header-bar">
                <div>
                    <h2 style="font-size: 1.4rem; font-weight: 600; color: #ffffff;">📋 Lista de Materiales (BOM)</h2>
                    <p style="font-size: 0.85rem; color: #a1a1aa; margin-top: 4px;">Componentes agrupados, referencias de diseño y enlaces a distribuidores.</p>
                </div>
                <div>
                    <button class="copper-mini-btn" onclick="CopperTools.exportBOMToCSV()" style="padding: 8px 16px; background: #00ffcc; color: #000; font-weight: 600; border: none;">⬇ Descargar CSV</button>
                </div>
            </div>
            <table class="bom-table">
                <thead>
                    <tr>
                        <th style="width: 60px;">Cant.</th>
                        <th>Valor</th>
                        <th>Encapsulado (Package)</th>
                        <th>Referencias (RefDes)</th>
                        <th>MPN</th>
                        <th style="width: 200px;">Distribuidores</th>
                    </tr>
                </thead>
                <tbody id="bom-table-body">
                </tbody>
            </table>
        </div>

        <!-- Gallery Panel -->
        <div id="copper-gallery-panel">
            <div class="bom-header-bar">
                <div>
                    <h2 style="font-size: 1.4rem; font-weight: 600; color: #ffffff;">🖼️ Galería de Diseños (Copper Gallery)</h2>
                    <p style="font-size: 0.85rem; color: #a1a1aa; margin-top: 4px;">Explora proyectos de referencia y esquemáticos cargados en Copper Viewer.</p>
                </div>
            </div>
            <div class="gallery-grid" id="copper-gallery-grid">
                <!-- Se llena con JavaScript -->
            </div>
        </div>
    """

    # Add Caliper SVG group into pcbSvg
    html = html.replace('<g id="pcbViewport"></g>', '<g id="pcbViewport"></g>\\n                    <g id="copper-caliper-overlay"></g>')

    # Add IDs to schematicPanel and pcbPanel
    html = re.sub(r'<!-- Panel Esquemático -->\s*<div class="panel"', '<!-- Panel Esquemático -->\\n        <div class="panel" id="schematicPanel"', html)
    html = re.sub(r'<!-- Panel PCB -->\s*<div class="panel"', '<!-- Panel PCB -->\\n        <div class="panel" id="pcbPanel"', html)

    # Add extra panels before </main>
    html = html.replace('</main>', extra_panels + '\\n    </main>')

    # 5. Inject Three.js Vendor Bundle, Copper3D, and CopperTools Scripts
    js_bundle_placeholder = """
    <!-- VENDORED THREE.JS & ORBIT CONTROLS -->
    <script>
    /*VENDOR_THREE_BUNDLE*/
    </script>

    <!-- COPPER 3D ENGINE -->
    <script>
    """ + c3d_js + """
    </script>

    <!-- COPPER ADVANCED TOOLS -->
    <script>
    """ + ctools_js + """
    </script>

    <!-- COPPER PART & SIGNAL SEARCH ENGINE -->
    <script>
    """ + csearch_js + """
    </script>

    <!-- COPPER APP CONTROLLER -->
    <script>
    function switchCopperTab(tabId) {
        var tabs = document.querySelectorAll('.copper-tab');
        tabs.forEach(t => t.classList.remove('active'));

        var activeBtn = Array.from(tabs).find(t => t.getAttribute('onclick').includes(tabId));
        if (activeBtn) activeBtn.classList.add('active');

        var schPanel = document.getElementById('schematicPanel');
        var pcbPanel = document.getElementById('pcbPanel');
        var panel3D = document.getElementById('copper-3d-panel');
        var panelBOM = document.getElementById('copper-bom-panel');
        var panelGal = document.getElementById('copper-gallery-panel');

        // Hide all
        schPanel.style.display = 'none';
        pcbPanel.style.display = 'none';
        panel3D.style.display = 'none';
        panelBOM.style.display = 'none';
        panelGal.style.display = 'none';

        if (tabId === 'tab-split') {
            schPanel.style.display = 'flex';
            pcbPanel.style.display = 'flex';
        } else if (tabId === 'tab-pcb') {
            pcbPanel.style.display = 'flex';
        } else if (tabId === 'tab-sch') {
            schPanel.style.display = 'flex';
        } else if (tabId === 'tab-3d') {
            panel3D.style.display = 'block';
            setTimeout(function() {
                Copper3D.init(document.getElementById('copper-3d-canvas-container'), EAGLE_DATA);
            }, 50);
        } else if (tabId === 'tab-bom') {
            panelBOM.style.display = 'block';
            CopperTools.renderBOMTable(EAGLE_DATA.bom);
        } else if (tabId === 'tab-gallery') {
            panelGal.style.display = 'block';
            renderGallery();
        }
    }

    function set3DColor(colorKey, el) {
        document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
        if (el) el.classList.add('active');
        Copper3D.setMaskColor(colorKey);
    }

    function toggle3DSpin(btn) {
        var spinning = Copper3D.toggleAutoRotate();
        btn.classList.toggle('active', spinning);
    }

    function toggle3DComponents(btn) {
        var show = Copper3D.toggleComponents();
        btn.classList.toggle('active', show);
    }

    function toggle3DXRay(btn) {
        var xray = Copper3D.toggleXRay();
        btn.classList.toggle('active', xray);
    }

    function renderGallery() {
        var grid = document.getElementById('copper-gallery-grid');
        if (!grid) return;
        var b = EAGLE_DATA.board ? EAGLE_DATA.board.bounds : { width: 68.6, height: 53.3 };
        var compCount = EAGLE_DATA.board ? (EAGLE_DATA.board.elements || []).length : 0;
        var sigCount = EAGLE_DATA.board ? (EAGLE_DATA.board.signals || []).length : 0;

        grid.innerHTML = `
            <div class="board-card" onclick="switchCopperTab('tab-pcb')">
                <div class="card-thumb">
                    <span style="font-size: 3rem;">⚡</span>
                </div>
                <div>
                    <h3 style="color: #fff; font-size: 1.1rem; margin-bottom: 4px;">${EAGLE_DATA.name || "Circuito Activo"}</h3>
                    <div class="card-meta">
                        <span>${b.width} × ${b.height} mm</span>
                        <span>${compCount} piezas • ${sigCount} señales</span>
                    </div>
                </div>
            </div>
            <div class="board-card" style="border-style: dashed; justify-content: center; align-items: center; text-align: center; color: #8e95a5;">
                <span style="font-size: 2rem; margin-bottom: 8px;">📂</span>
                <div style="font-weight: 600; color: #e4e4e7;">Arrastra un archivo aquí</div>
                <div style="font-size: 0.8rem;">Soporta archivos .brd, .sch y .zip de EAGLE</div>
            </div>
        `;
    }

    // Attach Caliper snapping to PCB mouse clicks
    document.addEventListener("DOMContentLoaded", function() {
        var pcbSvg = document.getElementById("pcbSvg");
        if (pcbSvg) {
            pcbSvg.addEventListener("click", function(e) {
                var overlay = document.getElementById("copper-caliper-overlay");
                if (!overlay) return;
                var rect = pcbSvg.getBoundingClientRect();
                var clickX = e.clientX - rect.left;
                var clickY = e.clientY - rect.top;

                // Transform to Board Coordinates
                var state = viewStates.pcb;
                var currentPreset = pcbSvg.getAttribute("data-preset") || "both";
                var isMirrored = (currentPreset === "bottom") ? !state.flipped : state.flipped;
                var scaleX = isMirrored ? -state.scale : state.scale;

                var boardX = (clickX - state.x) / scaleX;
                var boardY = -(clickY - state.y) / state.scale;

                CopperTools.handleCaliperClick(boardX, boardY);
            });
            setTimeout(function() {
                CopperTools.initCaliper(pcbSvg);
            }, 300);
        }
        if (window.CopperSearch) {
            CopperSearch.init();
        }
    });
    </script>
    """

    html = html.replace('</body>', js_bundle_placeholder + '\n</body>')

    with open(os.path.join(templates_dir, "viewer.html"), "w", encoding="utf-8") as f:
        f.write(html)

    print("✓ Successfully generated comprehensive copper-viewer template!")

if __name__ == "__main__":
    build_template()
