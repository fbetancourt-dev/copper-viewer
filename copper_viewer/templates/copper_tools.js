/**
 * ============================================================================
 * Copper Viewer - Advanced Interactive Tools (copper_tools.js)
 * ============================================================================
 * Precision Caliper (snapping measurement), Net Glow Highlighter (signal tracing),
 * X-Ray Mode (Mesa de Luz), and BOM CSV Exporter.
 */

var CopperTools = (function() {
    var caliperActive = false;
    var pointA = null;
    var snapTargets = [];
    var netGlowActive = true;
    var currentNet = null;
    var xrayActive = false;

    // 1. Snapping and Caliper Tool
    function initCaliper(pcbSvg) {
        if (!pcbSvg) return;

        // Build list of snap points from pads and vias
        snapTargets = [];
        if (window.EAGLE_DATA && EAGLE_DATA.board) {
            var elements = EAGLE_DATA.board.elements || [];
            var packages = EAGLE_DATA.board.packages || {};

            for (var e = 0; e < elements.length; e++) {
                var elem = elements[e];
                var pkg = packages[elem.package];
                if (!pkg) continue;

                var rad = (parseFloat(elem.rot.replace(/[^0-9.-]/g, "")) || 0) * Math.PI / 180;
                var pads = (pkg.pads || []).concat(pkg.smds || []);
                for (var p = 0; p < pads.length; p++) {
                    var pad = pads[p];
                    var lx = pad.x * Math.cos(rad) - pad.y * Math.sin(rad);
                    var ly = pad.x * Math.sin(rad) + pad.y * Math.cos(rad);
                    snapTargets.push({
                        x: elem.x + lx,
                        y: elem.y + ly,
                        name: elem.name + "." + pad.name,
                        type: "pad"
                    });
                }
            }

            // Vias
            var signals = EAGLE_DATA.board.signals || [];
            for (var s = 0; s < signals.length; s++) {
                var vias = signals[s].vias || [];
                for (var v = 0; v < vias.length; v++) {
                    snapTargets.push({
                        x: vias[v].x,
                        y: vias[v].y,
                        name: signals[s].name + " via",
                        type: "via"
                    });
                }
            }

            // Mounting Holes
            var holes = EAGLE_DATA.board.holes || [];
            for (var h = 0; h < holes.length; h++) {
                snapTargets.push({
                    x: holes[h].x,
                    y: holes[h].y,
                    name: "Hole Ø" + holes[h].drill + "mm",
                    type: "hole"
                });
            }
        }
    }

    function findNearestSnap(boardX, boardY, threshold) {
        var best = null;
        var minDist = threshold || 2.0; // 2mm snapping threshold
        for (var i = 0; i < snapTargets.length; i++) {
            var t = snapTargets[i];
            var dx = t.x - boardX;
            var dy = t.y - boardY;
            var dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist) {
                minDist = dist;
                best = { x: t.x, y: t.y, name: t.name, dist: dist };
            }
        }
        return best;
    }

    function toggleCaliper() {
        caliperActive = !caliperActive;
        pointA = null;
        var btn = document.getElementById("btn-caliper");
        if (btn) btn.classList.toggle("active", caliperActive);

        var pcbSvg = document.getElementById("pcb-svg");
        if (pcbSvg) {
            pcbSvg.style.cursor = caliperActive ? "crosshair" : "default";
        }

        var overlay = document.getElementById("copper-caliper-overlay");
        if (overlay && !caliperActive) {
            overlay.innerHTML = "";
        }
        return caliperActive;
    }

    function handleCaliperClick(boardX, boardY) {
        if (!caliperActive) return false;

        var snap = findNearestSnap(boardX, boardY);
        var pt = snap ? { x: snap.x, y: snap.y, name: snap.name } : { x: boardX, y: boardY, name: "" };

        var overlay = document.getElementById("copper-caliper-overlay");
        if (!overlay) return false;

        if (!pointA) {
            pointA = pt;
            // Draw Point A marker
            overlay.innerHTML = `
                <circle cx="${pt.x}" cy="${-pt.y}" r="0.6" fill="#00ffcc" stroke="#ffffff" stroke-width="0.15" />
                <circle cx="${pt.x}" cy="${-pt.y}" r="1.5" fill="none" stroke="#00ffcc" stroke-width="0.1" stroke-dasharray="0.3,0.3" class="caliper-pulse" />
            `;
            showNotification(`Punto 1 fijado en (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}) mm. Haz clic en el segundo punto.`);
        } else {
            var pointB = pt;
            var dx = pointB.x - pointA.x;
            var dy = pointB.y - pointA.y;
            var distMm = Math.sqrt(dx * dx + dy * dy);
            var distMils = distMm / 0.0254;

            // Draw final dimension line with arrows and callout
            var midX = (pointA.x + pointB.x) / 2;
            var midY = (pointA.y + pointB.y) / 2;

            overlay.innerHTML += `
                <!-- Line -->
                <line x1="${pointA.x}" y1="${-pointA.y}" x2="${pointB.x}" y2="${-pointB.y}" stroke="#00ffcc" stroke-width="0.25" stroke-dasharray="0.6,0.3" />
                <!-- Point B marker -->
                <circle cx="${pointB.x}" cy="${-pointB.y}" r="0.6" fill="#00ffcc" stroke="#ffffff" stroke-width="0.15" />
                <!-- Extension caps -->
                <circle cx="${pointA.x}" cy="${-pointA.y}" r="0.3" fill="#ffffff" />
                <circle cx="${pointB.x}" cy="${-pointB.y}" r="0.3" fill="#ffffff" />
            `;

            // Dimension Badge in UI
            showCaliperBadge(distMm, distMils, Math.abs(dx), Math.abs(dy), pointA, pointB);
            pointA = null; // Reset for next measurement
        }
        return true;
    }

    function showCaliperBadge(mm, mils, dx, dy, p1, p2) {
        var badge = document.getElementById("caliper-badge");
        if (!badge) {
            badge = document.createElement("div");
            badge.id = "caliper-badge";
            badge.className = "copper-caliper-card";
            document.body.appendChild(badge);
        }

        badge.innerHTML = `
            <div class="caliper-header">
                <span>📏 Medición de Precisión</span>
                <button onclick="this.parentElement.parentElement.style.display='none'">✕</button>
            </div>
            <div class="caliper-body">
                <div class="caliper-primary">${mm.toFixed(3)} mm <span class="caliper-mils">(${mils.toFixed(1)} mils)</span></div>
                <div class="caliper-details">
                    <span><strong>ΔX:</strong> ${dx.toFixed(3)} mm (${(dx/0.0254).toFixed(1)} mil)</span>
                    <span><strong>ΔY:</strong> ${dy.toFixed(3)} mm (${(dy/0.0254).toFixed(1)} mil)</span>
                </div>
            </div>
        `;
        badge.style.display = "block";
    }

    // 2. Net Glow Tracer
    function glowNet(netName) {
        if (!netName) return;
        currentNet = netName;

        // Clear previous glows
        var old = document.querySelectorAll(".copper-net-glow");
        for (var i = 0; i < old.length; i++) {
            old[i].classList.remove("copper-net-glow");
        }

        // Apply glow class to all wires, pads and vias of this net
        var pcbSvg = document.getElementById("pcb-svg");
        if (!pcbSvg) return;

        // Signals matching netName
        var tracks = pcbSvg.querySelectorAll(`[data-signal="${netName}"]`);
        for (var t = 0; t < tracks.length; t++) {
            tracks[t].classList.add("copper-net-glow");
        }

        showNotification(`⚡ Señal resaltada: ${netName} (${tracks.length} trazas encontradas)`);
    }

    // 3. X-Ray (Mesa de Luz) Toggle
    function toggleXRay() {
        xrayActive = !xrayActive;
        var pcbContainer = document.getElementById("pcb-container");
        var btn = document.getElementById("btn-xray");

        if (pcbContainer) {
            pcbContainer.classList.toggle("xray-mode", xrayActive);
        }
        if (btn) {
            btn.classList.toggle("active", xrayActive);
        }

        showNotification(xrayActive ? "💡 Modo Rayos X (Mesa de Luz) Activado" : "Modo Rayos X Desactivado");
        return xrayActive;
    }

    // 4. BOM Table Generation, Category Filtering & CSV Export
    var activeBOMCategory = "all";

    function getComponentCategory(ref) {
        if (!ref) return "other";
        var r = ref.toUpperCase();
        if (r.startsWith("R")) return "resistor";
        if (r.startsWith("C")) return "capacitor";
        if (r.startsWith("D") || r.startsWith("LED")) return "diode";
        if (r.startsWith("U") || r.startsWith("IC")) return "ic";
        if (r.startsWith("Q") || r.startsWith("T")) return "transistor";
        if (r.startsWith("J") || r.startsWith("JP") || r.startsWith("CON") || r.startsWith("X")) return "connector";
        if (r.startsWith("L")) return "inductor";
        if (r.startsWith("Y") || r.startsWith("XTAL")) return "crystal";
        return "other";
    }

    function filterBOMByCategory(category, chipEl) {
        activeBOMCategory = category;
        var chips = document.querySelectorAll(".bom-cat-chip");
        chips.forEach(function(c) { c.classList.remove("active"); });
        if (chipEl) chipEl.classList.add("active");

        if (window.EAGLE_DATA && EAGLE_DATA.bom) {
            renderBOMTable(EAGLE_DATA.bom);
        }
    }

    function renderBOMTable(bomData) {
        var tbody = document.getElementById("bom-table-body");
        if (!tbody) return;

        if (!bomData || !bomData.length) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 24px; color:#888;">No hay datos de lista de materiales disponibles.</td></tr>`;
            return;
        }

        var filtered = bomData.filter(function(item) {
            if (activeBOMCategory === "all") return true;
            var primaryRef = (item.refs && item.refs.length > 0) ? item.refs[0] : "";
            return getComponentCategory(primaryRef) === activeBOMCategory;
        });

        if (!filtered.length) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 24px; color:#888;">No hay componentes en la categoría seleccionada.</td></tr>`;
            return;
        }

        var html = "";
        for (var i = 0; i < filtered.length; i++) {
            var item = filtered[i];
            var refs = (item.refs || []).join(", ");
            var query = encodeURIComponent((item.value !== "No Value" ? item.value + " " : "") + item.package);

            html += `
                <tr>
                    <td class="bom-qty"><strong>${item.quantity}</strong></td>
                    <td class="bom-value">${item.value || "-"}</td>
                    <td class="bom-package"><span class="copper-badge">${item.package || "-"}</span></td>
                    <td class="bom-refs" title="${refs}">${refs}</td>
                    <td class="bom-mpn">${item.mpn || "-"}</td>
                    <td class="bom-actions">
                        <a href="https://www.digikey.com/en/products/result?keywords=${query}" target="_blank" class="dist-link dk">DigiKey</a>
                        <a href="https://www.mouser.com/c/?q=${query}" target="_blank" class="dist-link ms">Mouser</a>
                        <a href="https://www.lcsc.com/search?q=${query}" target="_blank" class="dist-link lc">LCSC</a>
                    </td>
                </tr>
            `;
        }
        tbody.innerHTML = html;
    }

    function exportBOMToCSV() {
        if (!window.EAGLE_DATA || !EAGLE_DATA.bom) return;
        var bom = EAGLE_DATA.bom;
        var csv = "Quantity,Value,Package,References,MPN\n";

        for (var i = 0; i < bom.length; i++) {
            var item = bom[i];
            var refs = '"' + (item.refs || []).join(", ") + '"';
            var val = '"' + (item.value || "") + '"';
            var pkg = '"' + (item.package || "") + '"';
            var mpn = '"' + (item.mpn || "") + '"';
            csv += `${item.quantity},${val},${pkg},${refs},${mpn}\n`;
        }

        var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        var link = document.createElement("a");
        var url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", (EAGLE_DATA.name || "circuit") + "_BOM.csv");
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function exportCentroidCSV() {
        if (!window.EAGLE_DATA || !EAGLE_DATA.board || !EAGLE_DATA.board.elements) return;
        var elements = EAGLE_DATA.board.elements;
        var csv = "Designator,Val,Package,Mid X,Mid Y,Rotation,Layer\n";

        for (var i = 0; i < elements.length; i++) {
            var el = elements[i];
            var isBottom = (el.rot || "").indexOf("M") !== -1;
            var layer = isBottom ? "Bottom" : "Top";
            var rotVal = (parseFloat((el.rot || "0").replace(/[^0-9.-]/g, "")) || 0);
            csv += `"${el.name}","${el.value || ""}","${el.package || ""}","${el.x.toFixed(3)}","${el.y.toFixed(3)}","${rotVal}","${layer}"\n`;
        }

        var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        var link = document.createElement("a");
        var url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", (EAGLE_DATA.name || "circuit") + "_pick_and_place_cpl.csv");
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showNotification("🎯 Archivo Pick & Place (CPL) exportado con éxito.");
    }

    // 5. Board Info & DRC Metrics Modal
    function showBoardInfoModal() {
        var modal = document.getElementById("copper-drc-modal");
        if (!modal) {
            modal = document.createElement("div");
            modal.id = "copper-drc-modal";
            modal.className = "copper-modal-overlay";
            modal.innerHTML = `
                <div class="copper-modal-box">
                    <div class="copper-modal-header">
                        <h3 style="margin: 0; font-size: 1.2rem; font-weight: 600; color: #ffffff; display: flex; align-items: center; gap: 8px;">📊 Métricas de Fabricación & DRC</h3>
                        <button class="copper-modal-close" onclick="CopperTools.closeBoardInfoModal()" style="background: none; border: none; color: #94a3b8; font-size: 1.2rem; cursor: pointer;">✕</button>
                    </div>
                    <div class="copper-modal-body" id="copper-drc-content"></div>
                </div>
            `;
            document.body.appendChild(modal);

            // Close on backdrop click
            modal.addEventListener("click", function(e) {
                if (e.target === modal) closeBoardInfoModal();
            });
        }
        populateBoardMetrics();
        modal.classList.add("visible");
    }

    function closeBoardInfoModal() {
        var modal = document.getElementById("copper-drc-modal");
        if (modal) modal.classList.remove("visible");
    }

    function populateBoardMetrics() {
        var content = document.getElementById("copper-drc-content");
        if (!content || !window.EAGLE_DATA || !EAGLE_DATA.board) return;

        var b = EAGLE_DATA.board;
        var bounds = b.bounds || { width: 0, height: 0, min_x: 0, min_y: 0, max_x: 0, max_y: 0 };
        var w = bounds.width || (bounds.max_x - bounds.min_x) || 50;
        var h = bounds.height || (bounds.max_y - bounds.min_y) || 40;
        var area = (w * h / 100).toFixed(2);
        var elements = b.elements || [];
        var signals = b.signals || [];

        var smdCount = 0;
        var thtCount = 0;
        var topCount = 0;
        var botCount = 0;

        elements.forEach(function(el) {
            var isBottom = (el.rot || "").indexOf("M") !== -1;
            if (isBottom) botCount++; else topCount++;

            var pkg = b.packages ? (b.packages[el.library + "_" + el.package] || b.packages[el.package]) : null;
            if (pkg) {
                if (pkg.smds && pkg.smds.length > 0) smdCount++;
                else if (pkg.pads && pkg.pads.length > 0) thtCount++;
                else smdCount++;
            } else {
                smdCount++;
            }
        });

        var vias = [];
        var wires = [];
        signals.forEach(function(sig) {
            if (sig.vias) vias.push.apply(vias, sig.vias);
            if (sig.wires) wires.push.apply(wires, sig.wires);
        });

        var minDrill = Infinity;
        vias.forEach(function(v) {
            var d = v.drill || 0.6;
            if (d < minDrill) minDrill = d;
        });
        if (!isFinite(minDrill)) minDrill = 0.6;

        var minTrace = Infinity;
        wires.forEach(function(w) {
            var tw = w.width || 0.254;
            if (tw > 0 && tw < minTrace) minTrace = tw;
        });
        if (!isFinite(minTrace)) minTrace = 0.254;

        var unroutedWires = [];
        signals.forEach(function(sig) {
            if (sig.wires) {
                sig.wires.forEach(function(w) {
                    if (w.layer === 19) {
                        unroutedWires.push({ signal: sig.name, wire: w });
                    }
                });
            }
        });

        content.innerHTML = `
            <div class="drc-stats-grid">
                <div class="drc-card">
                    <div class="drc-card-label">Dimensiones Físicas</div>
                    <div class="drc-card-val">${w.toFixed(2)} × ${h.toFixed(2)} mm</div>
                    <div class="drc-card-sub">${(w / 25.4).toFixed(2)}" × ${(h / 25.4).toFixed(2)}" • Superficie: ${area} cm²</div>
                </div>
                <div class="drc-card">
                    <div class="drc-card-label">Componentes (SMT / THT)</div>
                    <div class="drc-card-val">${elements.length}</div>
                    <div class="drc-card-sub">${smdCount} SMD • ${thtCount} THT (${topCount} Top / ${botCount} Bot)</div>
                </div>
                <div class="drc-card">
                    <div class="drc-card-label">Señales & Redes (Nets)</div>
                    <div class="drc-card-val">${signals.length}</div>
                    <div class="drc-card-sub">${wires.length} segmentos ruteados</div>
                </div>
                <div class="drc-card ${unroutedWires.length > 0 ? 'drc-card-warn' : ''}">
                    <div class="drc-card-label">Integridad de Ruteo (Airwires L19)</div>
                    <div class="drc-card-val" style="color: ${unroutedWires.length > 0 ? '#ffb703' : '#00ffcc'};">
                        ${unroutedWires.length === 0 ? "100% Ruteado ✓" : unroutedWires.length + " Sin Rutar ⚠️"}
                    </div>
                    <div class="drc-card-sub">
                        ${unroutedWires.length === 0 ? "Sin conexiones abiertas" : "Airwires en: " + unroutedWires.slice(0, 3).map(u => u.signal).join(", ") + (unroutedWires.length > 3 ? "..." : "")}
                    </div>
                </div>
                <div class="drc-card">
                    <div class="drc-card-label">Vías de Interconexión</div>
                    <div class="drc-card-val">${vias.length}</div>
                    <div class="drc-card-sub">Broca mínima: ${minDrill.toFixed(3)} mm (${(minDrill * 39.37).toFixed(1)} mils)</div>
                </div>
                <div class="drc-card">
                    <div class="drc-card-label">Ancho Mínimo de Traza (DRC)</div>
                    <div class="drc-card-val">${minTrace.toFixed(3)} mm</div>
                    <div class="drc-card-sub">${(minTrace * 39.37).toFixed(1)} mils (Estándar 6/6 mil soportado)</div>
                </div>
                <div class="drc-card">
                    <div class="drc-card-label">Capas de Cobre</div>
                    <div class="drc-card-val">2 Capas</div>
                    <div class="drc-card-sub">Top (Capa 1) + Bottom (Capa 16)</div>
                </div>
            </div>
            <div class="drc-footer-actions">
                <button class="copper-mini-btn" onclick="CopperTools.exportPCBSVG()" style="background:rgba(255,255,255,0.08); color:#fff; border:1px solid rgba(255,255,255,0.2);">📐 Exportar SVG</button>
                <button class="copper-mini-btn" onclick="CopperTools.exportPCBPNG()" style="background:rgba(255,255,255,0.08); color:#fff; border:1px solid rgba(255,255,255,0.2);">🖼️ Exportar PNG HD</button>
                <button class="copper-mini-btn" onclick="CopperTools.exportBOMToCSV()" style="background:#00ffcc; color:#000; font-weight:600;">⬇ Descargar BOM CSV</button>
                <button class="copper-mini-btn" onclick="CopperTools.exportCentroidCSV()" style="background:rgba(255,255,255,0.08); color:#fff; border:1px solid rgba(255,255,255,0.2);">🎯 Descargar CPL</button>
            </div>
        `;
    }

    // 6. Vector SVG and High-Res PNG Export
    function exportPCBSVG() {
        var svg = document.getElementById("pcbSvg");
        if (!svg) return;
        var clone = svg.cloneNode(true);
        clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        clone.removeAttribute("id");

        var viewport = clone.querySelector("#pcbViewport");
        if (viewport) viewport.removeAttribute("transform");

        var b = (window.EAGLE_DATA && EAGLE_DATA.board) ? EAGLE_DATA.board : null;
        var bounds = (b && b.bounds) ? b.bounds : { min_x: 0, min_y: 0, width: 100, height: 80 };
        var pad = 4;
        var minX = bounds.min_x - pad;
        var minY = -(bounds.min_y + bounds.height + pad);
        var w = bounds.width + pad * 2;
        var h = bounds.height + pad * 2;
        clone.setAttribute("viewBox", `${minX} ${minY} ${w} ${h}`);
        clone.setAttribute("width", `${w * 10}px`);
        clone.setAttribute("height", `${h * 10}px`);

        var styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
        styleEl.textContent = `
            svg { background-color: #0b0d13; }
            .layer-1 { stroke: #c82828; fill: none; }
            .layer-16 { stroke: #2563eb; fill: none; }
            .layer-17 { fill: #10b981; stroke: #059669; }
            .layer-18 { fill: #facc15; stroke: #eab308; }
            .layer-20 { stroke: #ffffff; fill: none; stroke-width: 0.2; }
            .layer-21 { stroke: #f8fafc; fill: none; }
            .layer-22 { stroke: #94a3b8; fill: none; }
            .layer-19 { stroke: #ffb703; stroke-dasharray: 0.5, 0.5; }
        `;
        clone.insertBefore(styleEl, clone.firstChild);

        var serializer = new XMLSerializer();
        var svgStr = serializer.serializeToString(clone);
        var blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
        var link = document.createElement("a");
        var url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", (window.EAGLE_DATA && EAGLE_DATA.name ? EAGLE_DATA.name : "circuit") + "_pcb.svg");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showNotification("📐 Archivo vectorial SVG del PCB exportado.");
    }

    function exportPCBPNG() {
        var svg = document.getElementById("pcbSvg");
        if (!svg) return;
        var clone = svg.cloneNode(true);
        clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        var viewport = clone.querySelector("#pcbViewport");
        if (viewport) viewport.removeAttribute("transform");

        var b = (window.EAGLE_DATA && EAGLE_DATA.board) ? EAGLE_DATA.board : null;
        var bounds = (b && b.bounds) ? b.bounds : { min_x: 0, min_y: 0, width: 100, height: 80 };
        var pad = 4;
        var minX = bounds.min_x - pad;
        var minY = -(bounds.min_y + bounds.height + pad);
        var w = bounds.width + pad * 2;
        var h = bounds.height + pad * 2;
        clone.setAttribute("viewBox", `${minX} ${minY} ${w} ${h}`);

        var scaleFactor = 3;
        var imgW = Math.round(w * scaleFactor * 8);
        var imgH = Math.round(h * scaleFactor * 8);
        clone.setAttribute("width", imgW);
        clone.setAttribute("height", imgH);

        var styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
        styleEl.textContent = `
            svg { background-color: #0b0d13; }
            .layer-1 { stroke: #c82828; fill: none; }
            .layer-16 { stroke: #2563eb; fill: none; }
            .layer-17 { fill: #10b981; stroke: #059669; }
            .layer-18 { fill: #facc15; stroke: #eab308; }
            .layer-20 { stroke: #ffffff; fill: none; stroke-width: 0.2; }
            .layer-21 { stroke: #f8fafc; fill: none; }
            .layer-22 { stroke: #94a3b8; fill: none; }
            .layer-19 { stroke: #ffb703; stroke-dasharray: 0.5, 0.5; }
        `;
        clone.insertBefore(styleEl, clone.firstChild);

        var serializer = new XMLSerializer();
        var svgStr = serializer.serializeToString(clone);
        var img = new Image();
        var blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
        var url = URL.createObjectURL(blob);

        img.onload = function() {
            var canvas = document.createElement("canvas");
            canvas.width = imgW;
            canvas.height = imgH;
            var ctx = canvas.getContext("2d");
            ctx.fillStyle = "#0b0d13";
            ctx.fillRect(0, 0, imgW, imgH);
            ctx.drawImage(img, 0, 0, imgW, imgH);
            URL.revokeObjectURL(url);

            canvas.toBlob(function(pBlob) {
                var pLink = document.createElement("a");
                pLink.href = URL.createObjectURL(pBlob);
                pLink.download = (window.EAGLE_DATA && EAGLE_DATA.name ? EAGLE_DATA.name : "circuit") + "_pcb_hd.png";
                document.body.appendChild(pLink);
                pLink.click();
                document.body.removeChild(pLink);
                showNotification("🖼️ Imagen PNG de alta definición exportada.");
            }, "image/png");
        };
        img.src = url;
    }

    // 7. Technical Blueprint / White Line Art Mode
    var blueprintActive = false;
    function toggleBlueprint(btn) {
        blueprintActive = !blueprintActive;
        var pcbSvg = document.getElementById("pcbSvg");
        if (pcbSvg) {
            pcbSvg.classList.toggle("copper-blueprint-mode", blueprintActive);
        }
        if (btn) btn.classList.toggle("active", blueprintActive);
        showNotification(blueprintActive ? "📐 Modo Blueprint Técnico activado." : "🎨 Modo CAD Estándar restaurado.");
    }

    function showNotification(msg) {
        var toast = document.getElementById("copper-toast");
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "copper-toast";
            toast.className = "copper-toast";
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.classList.add("visible");
        setTimeout(function() {
            toast.classList.remove("visible");
        }, 3200);
    }

    return {
        initCaliper: initCaliper,
        toggleCaliper: toggleCaliper,
        handleCaliperClick: handleCaliperClick,
        glowNet: glowNet,
        toggleXRay: toggleXRay,
        toggleBlueprint: toggleBlueprint,
        renderBOMTable: renderBOMTable,
        filterBOMByCategory: filterBOMByCategory,
        exportBOMToCSV: exportBOMToCSV,
        exportCentroidCSV: exportCentroidCSV,
        exportPCBSVG: exportPCBSVG,
        exportPCBPNG: exportPCBPNG,
        showBoardInfoModal: showBoardInfoModal,
        closeBoardInfoModal: closeBoardInfoModal,
        showNotification: showNotification
    };
})();
