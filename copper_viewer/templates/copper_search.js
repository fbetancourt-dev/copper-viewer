/**
 * ============================================================================
 * Copper Viewer - Unified Part & Signal Search Engine (copper_search.js)
 * ============================================================================
 * Inspired by Copper Touch (iPad) global search.
 * Searches Parts (RefDes, Value, Package), Signals (Nets, Buses), or Both.
 * Features live autocomplete dropdown, keyboard navigation, and instant
 * viewport centering with radar pulse and net glow highlighting.
 */

var CopperSearch = (function() {
    var searchScope = "both"; // "both" | "parts" | "signals"
    var activeIndex = -1;
    var currentResults = [];

    function init() {
        var input = document.getElementById("copper-search-input");
        var scopeBtn = document.getElementById("copper-search-scope-btn");
        var clearBtn = document.getElementById("copper-search-clear");

        if (input) {
            input.addEventListener("input", function() {
                var q = input.value.trim();
                if (clearBtn) clearBtn.style.display = q ? "block" : "none";
                performSearch(q);
            });

            input.addEventListener("keydown", function(e) {
                if (e.key === "ArrowDown") {
                    e.preventDefault();
                    navigateResults(1);
                } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    navigateResults(-1);
                } else if (e.key === "Enter") {
                    e.preventDefault();
                    if (activeIndex >= 0 && activeIndex < currentResults.length) {
                        selectResult(currentResults[activeIndex]);
                    }
                } else if (e.key === "Escape") {
                    closeDropdown();
                    input.blur();
                }
            });

            input.addEventListener("focus", function() {
                if (input.value.trim()) {
                    performSearch(input.value.trim());
                }
            });
        }

        // Global Keyboard Shortcut: '/' or 'Ctrl+K' / 'Cmd+K'
        document.addEventListener("keydown", function(e) {
            if ((e.key === "/" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) &&
                document.activeElement !== input &&
                document.activeElement.tagName !== "INPUT" &&
                document.activeElement.tagName !== "TEXTAREA") {
                e.preventDefault();
                if (input) {
                    input.focus();
                    input.select();
                }
            }
        });

        // Close dropdown when clicking outside
        document.addEventListener("click", function(e) {
            var container = document.getElementById("copper-search-container");
            if (container && !container.contains(e.target)) {
                closeDropdown();
            }
        });
    }

    function setScope(scope) {
        searchScope = scope;
        var btn = document.getElementById("copper-search-scope-btn");
        if (btn) {
            var label = "Ambos";
            if (scope === "parts") label = "Partes";
            if (scope === "signals") label = "Señales";
            btn.textContent = label;
        }

        // Re-run search if input has value
        var input = document.getElementById("copper-search-input");
        if (input && input.value.trim()) {
            performSearch(input.value.trim());
        }
    }

    function toggleScopeDropdown() {
        var menu = document.getElementById("copper-search-scope-menu");
        if (menu) {
            menu.classList.toggle("visible");
        }
    }

    function clearSearch() {
        var input = document.getElementById("copper-search-input");
        var clearBtn = document.getElementById("copper-search-clear");
        if (input) {
            input.value = "";
            input.focus();
        }
        if (clearBtn) clearBtn.style.display = "none";
        closeDropdown();
    }

    function closeDropdown() {
        var dropdown = document.getElementById("copper-search-results");
        if (dropdown) dropdown.style.display = "none";
        var scopeMenu = document.getElementById("copper-search-scope-menu");
        if (scopeMenu) scopeMenu.classList.remove("visible");
        activeIndex = -1;
    }

    function performSearch(query) {
        var dropdown = document.getElementById("copper-search-results");
        if (!dropdown) return;

        if (!query || query.length < 1) {
            closeDropdown();
            return;
        }

        var q = query.toLowerCase();
        var partResults = [];
        var signalResults = [];

        // 1. Search Parts
        if (searchScope === "both" || searchScope === "parts") {
            if (window.EAGLE_DATA && EAGLE_DATA.board && EAGLE_DATA.board.elements) {
                var elements = EAGLE_DATA.board.elements;
                for (var i = 0; i < elements.length; i++) {
                    var elem = elements[i];
                    var name = (elem.name || "").toLowerCase();
                    var val = (elem.value || "").toLowerCase();
                    var pkg = (elem.package || "").toLowerCase();

                    if (name.includes(q) || val.includes(q) || pkg.includes(q)) {
                        partResults.push({
                            type: "part",
                            name: elem.name,
                            value: elem.value,
                            package: elem.package,
                            x: elem.x,
                            y: elem.y,
                            rot: elem.rot,
                            rawElem: elem
                        });
                    }
                }
            }
        }

        // 2. Search Signals / Nets
        if (searchScope === "both" || searchScope === "signals") {
            if (window.EAGLE_DATA && EAGLE_DATA.board && EAGLE_DATA.board.signals) {
                var signals = EAGLE_DATA.board.signals;
                for (var s = 0; s < signals.length; s++) {
                    var sig = signals[s];
                    var sigName = (sig.name || "").toLowerCase();

                    if (sigName.includes(q)) {
                        var wireCount = (sig.wires || []).length;
                        var viaCount = (sig.vias || []).length;
                        var padCount = (sig.contactrefs || []).length;

                        // Calculate bounding center of signal
                        var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
                        for (var w = 0; w < (sig.wires || []).length; w++) {
                            var wire = sig.wires[w];
                            minX = Math.min(minX, wire.x1, wire.x2);
                            maxX = Math.max(maxX, wire.x1, wire.x2);
                            minY = Math.min(minY, wire.y1, wire.y2);
                            maxY = Math.max(maxY, wire.y1, wire.y2);
                        }
                        var centerX = (minX < 1e8) ? (minX + maxX) / 2 : 0;
                        var centerY = (minY < 1e8) ? (minY + maxY) / 2 : 0;

                        signalResults.push({
                            type: "signal",
                            name: sig.name,
                            wireCount: wireCount,
                            viaCount: viaCount,
                            padCount: padCount,
                            centerX: centerX,
                            centerY: centerY,
                            rawSignal: sig
                        });
                    }
                }
            }
        }

        currentResults = [];
        var html = "";

        if (partResults.length === 0 && signalResults.length === 0) {
            html = `<div class="search-empty">No se encontraron resultados para "<strong>${escapeHtml(query)}</strong>"</div>`;
        } else {
            // Parts Group
            if (partResults.length > 0) {
                html += `<div class="search-group-title">📦 Componentes (${partResults.length})</div>`;
                var maxParts = Math.min(partResults.length, 15);
                for (var p = 0; p < maxParts; p++) {
                    var pr = partResults[p];
                    var globalIdx = currentResults.length;
                    currentResults.push(pr);
                    var subtitle = [pr.value, pr.package].filter(Boolean).join(" • ");
                    html += `
                        <div class="search-item" data-index="${globalIdx}" onclick="CopperSearch.selectByIndex(${globalIdx})">
                            <div class="thumb-container">${renderPartThumbnail(pr.rawElem)}</div>
                            <div class="search-item-info">
                                <div class="search-item-title">${escapeHtml(pr.name)}</div>
                                <div class="search-item-sub">${escapeHtml(subtitle)}</div>
                            </div>
                            <span class="search-tag">Part</span>
                        </div>
                    `;
                }
            }

            // Signals Group
            if (signalResults.length > 0) {
                html += `<div class="search-group-title">⚡ Señales / Redes (${signalResults.length})</div>`;
                var maxSigs = Math.min(signalResults.length, 15);
                for (var sg = 0; sg < maxSigs; sg++) {
                    var sr = signalResults[sg];
                    var globalIdx = currentResults.length;
                    currentResults.push(sr);
                    var subtitle = `${sr.wireCount} trazas, ${sr.viaCount} vías, ${sr.padCount} pads`;
                    html += `
                        <div class="search-item" data-index="${globalIdx}" onclick="CopperSearch.selectByIndex(${globalIdx})">
                            <div class="thumb-container">${renderSignalThumbnail(sr.rawSignal)}</div>
                            <div class="search-item-info">
                                <div class="search-item-title">${escapeHtml(sr.name)}</div>
                                <div class="search-item-sub">${subtitle}</div>
                            </div>
                            <span class="search-tag signal-tag">Net</span>
                        </div>
                    `;
                }
            }
        }

        dropdown.innerHTML = html;
        dropdown.style.display = "block";
        activeIndex = currentResults.length > 0 ? 0 : -1;
        updateActiveItem();
    }

    function navigateResults(delta) {
        if (!currentResults.length) return;
        activeIndex += delta;
        if (activeIndex < 0) activeIndex = currentResults.length - 1;
        if (activeIndex >= currentResults.length) activeIndex = 0;
        updateActiveItem();
    }

    function updateActiveItem() {
        var items = document.querySelectorAll(".search-item");
        items.forEach(function(el, idx) {
            if (idx === activeIndex) {
                el.classList.add("active");
                el.scrollIntoView({ block: "nearest" });
            } else {
                el.classList.remove("active");
            }
        });
    }

    function selectByIndex(index) {
        if (index >= 0 && index < currentResults.length) {
            selectResult(currentResults[index]);
        }
    }

    function selectResult(item) {
        closeDropdown();
        if (!item) return;

        if (item.type === "part") {
            // 1. Switch to PCB or Split view if in 3D/BOM/Gallery
            var schPanel = document.getElementById("schematicPanel");
            var pcbPanel = document.getElementById("pcbPanel");
            if (pcbPanel && pcbPanel.style.display === "none") {
                if (typeof switchCopperTab === "function") {
                    switchCopperTab("tab-pcb");
                }
            }

            // 2. Highlight Part with Ripple Animation
            if (typeof highlightPart === "function") {
                highlightPart(item.name, item.value, "search");
            }

            // 3. Center viewport on Part
            if (typeof centerOnPoint === "function") {
                centerOnPoint("pcb", item.x, -item.y);

                // Also center schematic if instance exists
                if (window.EAGLE_DATA && EAGLE_DATA.schematic && EAGLE_DATA.schematic.instances) {
                    var inst = EAGLE_DATA.schematic.instances.find(function(i) { return i.part === item.name; });
                    if (inst) {
                        centerOnPoint("sch", inst.x, -inst.y);
                    }
                }
            }

            // 4. Trigger Radar Ripple Wave
            if (typeof createRipple === "function") {
                var pcbRipple = document.getElementById("pcbRippleGroup");
                if (pcbRipple) {
                    createRipple("pcb", pcbRipple, item.x, -item.y);
                }
            }

            if (window.CopperTools && CopperTools.showNotification) {
                CopperTools.showNotification(`📦 Componente ${item.name} (${item.value || item.package}) centrado.`);
            }
        }
        else if (item.type === "signal") {
            // 1. Switch to PCB view if needed
            var pcbPanel = document.getElementById("pcbPanel");
            if (pcbPanel && pcbPanel.style.display === "none") {
                if (typeof switchCopperTab === "function") {
                    switchCopperTab("tab-pcb");
                }
            }

            // 2. Trigger Net Glow Tracer across all layers!
            if (window.CopperTools && CopperTools.glowNet) {
                CopperTools.glowNet(item.name);
            }

            // 3. Center viewport on Signal's center coordinates
            if (item.centerX !== 0 && item.centerY !== 0 && typeof centerOnPoint === "function") {
                centerOnPoint("pcb", item.centerX, -item.centerY);
            }

            if (window.CopperTools && CopperTools.showNotification) {
                CopperTools.showNotification(`⚡ Señal ${item.name} (${item.wireCount} trazas, ${item.viaCount} vías) resaltada con Net Glow.`);
            }
        }
    }

    function renderPartThumbnail(elem) {
        if (!elem) return '<div class="thumb-fallback">📦</div>';
        
        var pkg = null;
        if (window.EAGLE_DATA && EAGLE_DATA.board && EAGLE_DATA.board.packages) {
            var key = (elem.library ? (elem.library + "_" + elem.package) : elem.package);
            pkg = EAGLE_DATA.board.packages[key] || EAGLE_DATA.board.packages[elem.package];
            if (!pkg) {
                for (var pk in EAGLE_DATA.board.packages) {
                    if (pk.endsWith("_" + elem.package) || pk === elem.package) {
                        pkg = EAGLE_DATA.board.packages[pk];
                        break;
                    }
                }
            }
        }

        if (!pkg) {
            return renderParametricPartIcon(elem);
        }

        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        var hasGeom = false;

        function updateBounds(x, y) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            hasGeom = true;
        }

        if (pkg.smds) {
            pkg.smds.forEach(function(s) {
                var hw = (s.dx || 1) / 2;
                var hh = (s.dy || 1) / 2;
                updateBounds(s.x - hw, s.y - hh);
                updateBounds(s.x + hw, s.y + hh);
            });
        }
        if (pkg.pads) {
            pkg.pads.forEach(function(p) {
                var r = (p.diameter || (p.drill ? p.drill * 1.6 : 1.4)) / 2;
                updateBounds(p.x - r, p.y - r);
                updateBounds(p.x + r, p.y + r);
            });
        }
        if (pkg.wires) {
            pkg.wires.forEach(function(w) {
                if (w.layer === 21 || w.layer === 22 || w.layer === 51 || w.layer === 52) {
                    updateBounds(w.x1, w.y1);
                    updateBounds(w.x2, w.y2);
                }
            });
        }
        if (pkg.circles) {
            pkg.circles.forEach(function(c) {
                updateBounds(c.x - c.radius, c.y - c.radius);
                updateBounds(c.x + c.radius, c.y + c.radius);
            });
        }

        if (!hasGeom || !isFinite(minX)) {
            return renderParametricPartIcon(elem);
        }

        var w = maxX - minX;
        var h = maxY - minY;
        var maxDim = Math.max(w, h, 1.2);
        var cx = (minX + maxX) / 2;
        var cy = (minY + maxY) / 2;
        var pad = maxDim * 0.18;
        var halfSize = (maxDim / 2) + pad;

        var vx = cx - halfSize;
        var vy = cy - halfSize;
        var vSize = halfSize * 2;

        var svg = `<svg class="copper-micro-thumb" viewBox="${vx} ${-cy - halfSize} ${vSize} ${vSize}">`;

        // 1. Silkscreen Wires
        if (pkg.wires) {
            pkg.wires.forEach(function(w) {
                if (w.layer === 21 || w.layer === 22 || w.layer === 51 || w.layer === 52) {
                    var stroke = (w.layer === 51 || w.layer === 52) ? "rgba(226, 232, 240, 0.45)" : "#e2e8f0";
                    var sw = Math.max(maxDim * 0.035, w.width || 0.12);
                    svg += `<line x1="${w.x1}" y1="${-w.y1}" x2="${w.x2}" y2="${-w.y2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;
                }
            });
        }

        // 2. Circles
        if (pkg.circles) {
            pkg.circles.forEach(function(c) {
                var stroke = "#e2e8f0";
                var sw = Math.max(maxDim * 0.035, c.width || 0.12);
                svg += `<circle cx="${c.x}" cy="${-c.y}" r="${c.radius}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>`;
            });
        }

        // 3. SMD Pads
        if (pkg.smds) {
            pkg.smds.forEach(function(s) {
                var fill = (s.layer === 16) ? "#2563eb" : "#dc2626";
                var stroke = (s.layer === 16) ? "#60a5fa" : "#f59e0b";
                var rx = (s.roundness ? (s.dx * s.roundness / 200) : 0.05);
                var x = s.x - (s.dx / 2);
                var y = -s.y - (s.dy / 2);
                svg += `<rect x="${x}" y="${y}" width="${s.dx}" height="${s.dy}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${maxDim * 0.02}"/>`;
            });
        }

        // 4. THT Pads
        if (pkg.pads) {
            pkg.pads.forEach(function(p) {
                var r = (p.diameter || (p.drill ? p.drill * 1.6 : 1.4)) / 2;
                var drillR = (p.drill || 0.8) / 2;
                if (p.shape === "square" || p.shape === "long") {
                    var sz = r * 2;
                    svg += `<rect x="${p.x - r}" y="${-p.y - r}" width="${sz}" height="${sz}" rx="0.1" fill="#16a34a" stroke="#4ade80" stroke-width="${maxDim * 0.02}"/>`;
                } else {
                    svg += `<circle cx="${p.x}" cy="${-p.y}" r="${r}" fill="#16a34a" stroke="#4ade80" stroke-width="${maxDim * 0.02}"/>`;
                }
                svg += `<circle cx="${p.x}" cy="${-p.y}" r="${drillR}" fill="#12141a"/>`;
            });
        }

        svg += `</svg>`;
        return svg;
    }

    function renderSignalThumbnail(sig) {
        if (!sig) return '<div class="thumb-fallback">⚡</div>';

        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        var hasGeom = false;

        function updateBounds(x, y) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            hasGeom = true;
        }

        if (sig.wires) {
            sig.wires.forEach(function(w) {
                updateBounds(w.x1, w.y1);
                updateBounds(w.x2, w.y2);
            });
        }
        if (sig.vias) {
            sig.vias.forEach(function(v) {
                updateBounds(v.x, v.y);
            });
        }

        if (!hasGeom || !isFinite(minX)) {
            return `
                <svg class="copper-micro-thumb" viewBox="0 0 24 24">
                    <path d="M 4 20 L 10 14 L 14 14 L 20 8" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round"/>
                    <circle cx="10" cy="14" r="2.2" fill="#eab308" stroke="#12141a" stroke-width="0.8"/>
                    <circle cx="4" cy="20" r="1.5" fill="#22c55e"/>
                    <circle cx="20" cy="8" r="1.5" fill="#22c55e"/>
                </svg>
            `;
        }

        var w = maxX - minX;
        var h = maxY - minY;
        var maxDim = Math.max(w, h, 2.0);
        var cx = (minX + maxX) / 2;
        var cy = (minY + maxY) / 2;
        var pad = maxDim * 0.15;
        var halfSize = (maxDim / 2) + pad;

        var vx = cx - halfSize;
        var vy = cy - halfSize;
        var vSize = halfSize * 2;

        var svg = `<svg class="copper-micro-thumb" viewBox="${vx} ${-cy - halfSize} ${vSize} ${vSize}">`;

        // 1. Wires
        if (sig.wires) {
            sig.wires.forEach(function(w) {
                var stroke = "#ef4444";
                if (w.layer === 16) stroke = "#22c55e";
                else if (w.layer > 1 && w.layer < 16) stroke = "#3b82f6";
                var sw = Math.max(maxDim * 0.05, w.width || 0.2);
                svg += `<line x1="${w.x1}" y1="${-w.y1}" x2="${w.x2}" y2="${-w.y2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;
            });
        }

        // 2. Vias
        if (sig.vias) {
            sig.vias.forEach(function(v) {
                var r = Math.max(maxDim * 0.055, (v.drill ? v.drill * 1.2 : 0.6) / 2);
                var hr = r * 0.5;
                svg += `<circle cx="${v.x}" cy="${-v.y}" r="${r}" fill="#eab308" stroke="#fef08a" stroke-width="${r * 0.2}"/>`;
                svg += `<circle cx="${v.x}" cy="${-v.y}" r="${hr}" fill="#12141a"/>`;
            });
        }

        svg += `</svg>`;
        return svg;
    }

    function renderParametricPartIcon(elem) {
        var prefix = (elem.name || "").replace(/[0-9].*$/, "").toUpperCase();
        var iconSvg = "";
        
        switch(prefix) {
            case "R":
                iconSvg = `<rect x="6" y="9" width="12" height="6" rx="1.5" fill="#3b82f6" stroke="#60a5fa" stroke-width="1.2"/>
                           <rect x="4" y="9" width="3" height="6" fill="#ef4444"/>
                           <rect x="17" y="9" width="3" height="6" fill="#ef4444"/>
                           <line x1="2" y1="12" x2="4" y2="12" stroke="#94a3b8" stroke-width="1.5"/>
                           <line x1="20" y1="12" x2="22" y2="12" stroke="#94a3b8" stroke-width="1.5"/>`;
                break;
            case "C":
                iconSvg = `<rect x="5" y="7" width="14" height="10" rx="1.5" fill="#f59e0b" stroke="#fbbf24" stroke-width="1"/>
                           <rect x="4" y="7" width="2.5" height="10" fill="#94a3b8"/>
                           <rect x="17.5" y="7" width="2.5" height="10" fill="#94a3b8"/>`;
                break;
            case "D":
            case "LED":
                iconSvg = `<polygon points="9,6 9,18 16,12" fill="#ef4444"/>
                           <line x1="16" y1="6" x2="16" y2="18" stroke="#ef4444" stroke-width="2"/>
                           <line x1="4" y1="12" x2="9" y2="12" stroke="#94a3b8" stroke-width="1.5"/>
                           <line x1="16" y1="12" x2="20" y2="12" stroke="#94a3b8" stroke-width="1.5"/>`;
                break;
            case "U":
            case "IC":
                iconSvg = `<rect x="6" y="5" width="12" height="14" rx="2" fill="#1e293b" stroke="#64748b" stroke-width="1.2"/>
                           <circle cx="12" cy="7" r="1.2" fill="#94a3b8"/>
                           <line x1="3" y1="8" x2="6" y2="8" stroke="#f59e0b" stroke-width="1.5"/>
                           <line x1="3" y1="12" x2="6" y2="12" stroke="#f59e0b" stroke-width="1.5"/>
                           <line x1="3" y1="16" x2="6" y2="16" stroke="#f59e0b" stroke-width="1.5"/>
                           <line x1="18" y1="8" x2="21" y2="8" stroke="#f59e0b" stroke-width="1.5"/>
                           <line x1="18" y1="12" x2="21" y2="12" stroke="#f59e0b" stroke-width="1.5"/>
                           <line x1="18" y1="16" x2="21" y2="16" stroke="#f59e0b" stroke-width="1.5"/>`;
                break;
            case "Q":
            case "T":
                iconSvg = `<circle cx="12" cy="12" r="8" fill="none" stroke="#64748b" stroke-width="1.2"/>
                           <line x1="10" y1="8" x2="10" y2="16" stroke="#e2e8f0" stroke-width="1.5"/>
                           <line x1="10" y1="10" x2="15" y2="7" stroke="#e2e8f0" stroke-width="1.2"/>
                           <line x1="10" y1="14" x2="15" y2="17" stroke="#e2e8f0" stroke-width="1.2"/>`;
                break;
            case "L":
                iconSvg = `<path d="M 4 14 C 4 10, 8 10, 8 14 C 8 10, 12 10, 12 14 C 12 10, 16 10, 16 14 C 16 10, 20 10, 20 14" fill="none" stroke="#06b6d4" stroke-width="2"/>`;
                break;
            default:
                iconSvg = `<rect x="5" y="5" width="14" height="14" rx="2" fill="#1e293b" stroke="#475569" stroke-width="1.2"/>
                           <text x="12" y="15" fill="#38bdf8" font-size="8" font-weight="bold" font-family="monospace" text-anchor="middle">${escapeHtml(prefix.slice(0, 3) || "CMP")}</text>`;
                break;
        }

        return `<svg class="copper-micro-thumb" viewBox="0 0 24 24">${iconSvg}</svg>`;
    }

    function escapeHtml(text) {
        var div = document.createElement("div");
        div.textContent = text || "";
        return div.innerHTML;
    }

    return {
        init: init,
        setScope: setScope,
        toggleScopeDropdown: toggleScopeDropdown,
        clearSearch: clearSearch,
        selectByIndex: selectByIndex,
        selectResult: selectResult
    };
})();
