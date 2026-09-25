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
                            rot: elem.rot
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
                            centerY: centerY
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
                            <span class="search-icon part">📦</span>
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
                            <span class="search-icon signal">⚡</span>
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
