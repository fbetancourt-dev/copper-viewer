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

    // 4. BOM Table Generation & CSV Export
    function renderBOMTable(bomData) {
        var tbody = document.getElementById("bom-table-body");
        if (!tbody) return;

        if (!bomData || !bomData.length) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 24px; color:#888;">No hay datos de lista de materiales disponibles.</td></tr>`;
            return;
        }

        var html = "";
        for (var i = 0; i < bomData.length; i++) {
            var item = bomData[i];
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
        renderBOMTable: renderBOMTable,
        exportBOMToCSV: exportBOMToCSV,
        showNotification: showNotification
    };
})();
