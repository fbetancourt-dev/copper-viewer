import xml.etree.ElementTree as ET
import json
import os

class EagleParser:
    def __init__(self, sch_path, brd_path):
        self.sch_path = sch_path
        self.brd_path = brd_path
        self.gates_map = {}
        self.data = {
            "name": "",
            "layers": {},
            "schematic": {
                "instances": [],
                "nets": [],
                "symbols": {},
                "plain": []
            },
            "board": {
                "elements": [],
                "signals": [],
                "packages": {},
                "dimension": [],
                "plain": [],
                "holes": []
            }
        }

    def parse(self):
        if os.path.exists(self.brd_path):
            self.data["name"] = os.path.basename(self.brd_path).replace(".brd", "")
        elif os.path.exists(self.sch_path):
            self.data["name"] = os.path.basename(self.sch_path).replace(".sch", "")

        if os.path.exists(self.sch_path):
            self._parse_schematic()
        if os.path.exists(self.brd_path):
            self._parse_board()
            
        self._build_bom()
        self._calculate_board_bounds()
        return self.data

    def _parse_layers(self, root):
        layers_node = root.find(".//layers")
        if layers_node is not None:
            for layer in layers_node.findall("layer"):
                num = int(layer.get("number", 0))
                self.data["layers"][num] = {
                    "name": layer.get("name", ""),
                    "color": layer.get("color", "1"),
                    "visible": layer.get("visible", "yes") == "yes",
                    "active": layer.get("active", "yes") == "yes"
                }

    def _parse_schematic(self):
        tree = ET.parse(self.sch_path)
        root = tree.getroot()
        self._parse_layers(root)
        
        schematic_node = root.find(".//schematic")
        if schematic_node is None:
            return

        # 1. Parsear librerías de símbolos y construir gates_map
        libraries = schematic_node.find("libraries")
        if libraries is not None:
            for library in libraries.findall("library"):
                lib_name = library.get("name")
                
                # Mapear compuertas (gates) de cada deviceset a su respectivo símbolo
                devicesets_node = library.find("devicesets")
                if devicesets_node is not None:
                    for deviceset in devicesets_node.findall("deviceset"):
                        ds_name = deviceset.get("name")
                        gates_node = deviceset.find("gates")
                        if gates_node is not None:
                            for gate in gates_node.findall("gate"):
                                gate_name = gate.get("name")
                                sym_name = gate.get("symbol")
                                gate_x = float(gate.get("x", 0))
                                gate_y = float(gate.get("y", 0))
                                if lib_name not in self.gates_map:
                                    self.gates_map[lib_name] = {}
                                if ds_name not in self.gates_map[lib_name]:
                                    self.gates_map[lib_name][ds_name] = {}
                                self.gates_map[lib_name][ds_name][gate_name] = {
                                    "symbol": sym_name,
                                    "x": gate_x,
                                    "y": gate_y
                                }

                symbols_node = library.find("symbols")
                if symbols_node is not None:
                    for symbol in symbols_node.findall("symbol"):
                        sym_name = symbol.get("name")
                        sym_key = f"{lib_name}_{sym_name}"
                        
                        sym_data = {
                            "wires": [],
                            "pins": [],
                            "texts": [],
                            "rectangles": [],
                            "circles": [],
                            "frames": []
                        }
                        
                        for f in symbol.findall("frame"):
                            sym_data["frames"].append({
                                "x1": float(f.get("x1", 0)),
                                "y1": float(f.get("y1", 0)),
                                "x2": float(f.get("x2", 0)),
                                "y2": float(f.get("y2", 0)),
                                "columns": int(f.get("columns", 0)),
                                "rows": int(f.get("rows", 0)),
                                "layer": int(f.get("layer", 94))
                            })
                        
                        for w in symbol.findall("wire"):
                            curve = w.get("curve")
                            sym_data["wires"].append({
                                "x1": float(w.get("x1", 0)),
                                "y1": float(w.get("y1", 0)),
                                "x2": float(w.get("x2", 0)),
                                "y2": float(w.get("y2", 0)),
                                "width": float(w.get("width", 0.15)),
                                "layer": int(w.get("layer", 94)),
                                "curve": float(curve) if curve is not None else None
                            })
                        for p in symbol.findall("pin"):
                            sym_data["pins"].append({
                                "name": p.get("name"),
                                "x": float(p.get("x", 0)),
                                "y": float(p.get("y", 0)),
                                "visible": p.get("visible", "both"),
                                "length": p.get("length", "middle"),
                                "direction": p.get("direction", "pas"),
                                "function": p.get("function", "none"),
                                "rot": p.get("rot", "R0")
                            })
                        for t in symbol.findall("text"):
                            sym_data["texts"].append({
                                "text": t.text or "",
                                "x": float(t.get("x", 0)),
                                "y": float(t.get("y", 0)),
                                "size": float(t.get("size", 1.5)),
                                "layer": int(t.get("layer", 94)),
                                "rot": t.get("rot", "R0")
                            })
                        for r in symbol.findall("rectangle"):
                            sym_data["rectangles"].append({
                                "x1": float(r.get("x1", 0)),
                                "y1": float(r.get("y1", 0)),
                                "x2": float(r.get("x2", 0)),
                                "y2": float(r.get("y2", 0)),
                                "layer": int(r.get("layer", 94))
                            })
                        for c in symbol.findall("circle"):
                            sym_data["circles"].append({
                                "x": float(c.get("x", 0)),
                                "y": float(c.get("y", 0)),
                                "radius": float(c.get("radius", 0)),
                                "width": float(c.get("width", 0)),
                                "layer": int(c.get("layer", 94))
                            })
                        
                        self.data["schematic"]["symbols"][sym_key] = sym_data

        # 2. Parsear instancias y resolver sus símbolos asociados
        parts_dict = {}
        parts_node = schematic_node.find("parts")
        if parts_node is not None:
            for part in parts_node.findall("part"):
                parts_dict[part.get("name")] = {
                    "library": part.get("library"),
                    "deviceset": part.get("deviceset"),
                    "value": part.get("value", "")
                }

        sheets_node = schematic_node.find("sheets")
        self.data["schematic"]["sheets"] = []
        if sheets_node is not None:
            for sheet_idx, sheet in enumerate(sheets_node.findall("sheet")):
                sheet_data = {
                    "number": sheet_idx + 1,
                    "instances": [],
                    "nets": [],
                    "plain": []
                }
                instances_node = sheet.find("instances")
                if instances_node is not None:
                    for inst in instances_node.findall("instance"):
                        part_name = inst.get("part")
                        part_info = parts_dict.get(part_name, {"library": "", "deviceset": "", "value": ""})
                        gate_name = inst.get("gate")
                        lib_name = part_info["library"]
                        ds_name = part_info["deviceset"]
                        
                        # Valor: usa value del part, si está vacío usa el nombre del deviceset (e.g. "GND")
                        part_value = part_info["value"]
                        if not part_value:
                            part_value = ds_name
                        
                        # Buscar el símbolo correspondiente en gates_map
                        sym_name = ds_name
                        gate_x = 0.0
                        gate_y = 0.0
                        if lib_name in self.gates_map and ds_name in self.gates_map[lib_name]:
                            gate_info = self.gates_map[lib_name][ds_name].get(gate_name, ds_name)
                            if isinstance(gate_info, dict):
                                sym_name = gate_info["symbol"]
                                gate_x = gate_info["x"]
                                gate_y = gate_info["y"]
                            else:
                                sym_name = gate_info
                        
                        # Extraer atributos smashed (posición de textos sobreescritos por el usuario)
                        smashed_attrs = {}
                        for attr in inst.findall("attribute"):
                            attr_name = attr.get("name", "").upper()
                            smashed_attrs[attr_name] = {
                                "x": float(attr.get("x", 0)),
                                "y": float(attr.get("y", 0)),
                                "size": float(attr.get("size", 1.778)),
                                "rot": attr.get("rot", "R0"),
                                "layer": int(attr.get("layer", 95)),
                                "align": attr.get("align", "bottom-left"),
                                "font": attr.get("font", "proportional")
                            }
                        
                        inst_obj = {
                            "part": part_name,
                            "library": lib_name,
                            "deviceset": ds_name,
                            "symbol": sym_name,
                            "value": part_value,
                            "gate": gate_name,
                            "x": float(inst.get("x", 0)),
                            "y": float(inst.get("y", 0)),
                            "gate_x": gate_x,
                            "gate_y": gate_y,
                            "rot": inst.get("rot", "R0"),
                            "smashed": inst.get("smashed") == "yes",
                            "smashed_attrs": smashed_attrs,
                            "sheet": sheet_idx + 1
                        }
                        sheet_data["instances"].append(inst_obj)
                        self.data["schematic"]["instances"].append(inst_obj)

                # 3. Parsear redes (nets)
                nets_node = sheet.find("nets")
                if nets_node is not None:
                    for net in nets_node.findall("net"):
                        net_name = net.get("name")
                        net_data = {
                            "name": net_name,
                            "wires": [],
                            "junctions": [],
                            "pinrefs": [],
                            "labels": []
                        }
                        for segment in net.findall("segment"):
                            for w in segment.findall("wire"):
                                curve = w.get("curve")
                                net_data["wires"].append({
                                    "x1": float(w.get("x1", 0)),
                                    "y1": float(w.get("y1", 0)),
                                    "x2": float(w.get("x2", 0)),
                                    "y2": float(w.get("y2", 0)),
                                    "width": float(w.get("width", 0.15)),
                                    "layer": int(w.get("layer", 91)),
                                    "curve": float(curve) if curve is not None else None
                                })
                            for j in segment.findall("junction"):
                                net_data["junctions"].append({
                                    "x": float(j.get("x", 0)),
                                    "y": float(j.get("y", 0))
                                })
                            for pr in segment.findall("pinref"):
                                net_data["pinrefs"].append({
                                    "part": pr.get("part"),
                                    "gate": pr.get("gate"),
                                    "pin": pr.get("pin")
                                })
                            for lbl in segment.findall("label"):
                                net_data["labels"].append({
                                    "x": float(lbl.get("x", 0)),
                                    "y": float(lbl.get("y", 0)),
                                    "size": float(lbl.get("size", 1.778)),
                                    "layer": int(lbl.get("layer", 95)),
                                    "rot": lbl.get("rot", "R0"),
                                    "xref": lbl.get("xref", "no")
                                })
                        sheet_data["nets"].append(net_data)
                        self.data["schematic"]["nets"].append(net_data)
                
                plain_node = sheet.find("plain")
                if plain_node is not None:
                    self._parse_plain_node(plain_node, sheet_data["plain"], is_board=False)
                    self._parse_plain_node(plain_node, self.data["schematic"]["plain"], is_board=False)

                self.data["schematic"]["sheets"].append(sheet_data)

    def _parse_board(self):
        tree = ET.parse(self.brd_path)
        root = tree.getroot()
        self._parse_layers(root)
        
        board_node = root.find(".//board")
        if board_node is None:
            return

        # 1. Parsear librerías de huellas (packages)
        libraries = board_node.find("libraries")
        if libraries is not None:
            for library in libraries.findall("library"):
                lib_name = library.get("name")
                packages_node = library.find("packages")
                if packages_node is not None:
                    for pkg in packages_node.findall("package"):
                        pkg_name = pkg.get("name")
                        pkg_key = f"{lib_name}_{pkg_name}"
                        
                        pkg_data = {
                            "wires": [],
                            "smds": [],
                            "pads": [],
                            "texts": [],
                            "holes": [],
                            "circles": [],
                            "polygons": []
                        }
                        
                        for w in pkg.findall("wire"):
                            curve = w.get("curve")
                            pkg_data["wires"].append({
                                "x1": float(w.get("x1", 0)),
                                "y1": float(w.get("y1", 0)),
                                "x2": float(w.get("x2", 0)),
                                "y2": float(w.get("y2", 0)),
                                "width": float(w.get("width", 0.127)),
                                "layer": int(w.get("layer", 21)),
                                "curve": float(curve) if curve is not None else None,
                                "cap": w.get("cap")
                            })
                        for s in pkg.findall("smd"):
                            pkg_data["smds"].append({
                                "name": s.get("name"),
                                "x": float(s.get("x", 0)),
                                "y": float(s.get("y", 0)),
                                "dx": float(s.get("dx", 0)),
                                "dy": float(s.get("dy", 0)),
                                "layer": int(s.get("layer", 1)),
                                "roundness": float(s.get("roundness", 0)),
                                "rot": s.get("rot", "R0")
                            })
                        for p in pkg.findall("pad"):
                            pkg_data["pads"].append({
                                "name": p.get("name"),
                                "x": float(p.get("x", 0)),
                                "y": float(p.get("y", 0)),
                                "drill": float(p.get("drill", 0.6)),
                                "diameter": float(p.get("diameter", 0)),
                                "shape": p.get("shape", "round"),
                                "rot": p.get("rot", "R0")
                            })
                        for t in pkg.findall("text"):
                            pkg_data["texts"].append({
                                "text": t.text or "",
                                "x": float(t.get("x", 0)),
                                "y": float(t.get("y", 0)),
                                "size": float(t.get("size", 1.0)),
                                "layer": int(t.get("layer", 25)),
                                "rot": t.get("rot", "R0"),
                                "ratio": int(t.get("ratio", 8)),
                                "font": t.get("font", "vector"),
                                "align": t.get("align", "bottom-left")
                            })
                        for h in pkg.findall("hole"):
                            pkg_data["holes"].append({
                                "x": float(h.get("x", 0)),
                                "y": float(h.get("y", 0)),
                                "drill": float(h.get("drill", 0))
                            })
                        for c in pkg.findall("circle"):
                            pkg_data["circles"].append({
                                "x": float(c.get("x", 0)),
                                "y": float(c.get("y", 0)),
                                "radius": float(c.get("radius", 0)),
                                "width": float(c.get("width", 0)),
                                "layer": int(c.get("layer", 21))
                            })
                        for poly in pkg.findall("polygon"):
                            poly_data = {
                                "width": float(poly.get("width", 0.127)),
                                "layer": int(poly.get("layer", 21)),
                                "vertices": []
                            }
                            for vertex in poly.findall("vertex"):
                                poly_data["vertices"].append({
                                    "x": float(vertex.get("x", 0)),
                                    "y": float(vertex.get("y", 0))
                                })
                            pkg_data["polygons"].append(poly_data)
                        
                        self.data["board"]["packages"][pkg_key] = pkg_data

        # 2. Parsear elementos de la placa
        elements_node = board_node.find("elements")
        if elements_node is not None:
            for elem in elements_node.findall("element"):
                elem_smashed = elem.get("smashed", "no").lower() in ["yes", "true", "1"]
                elem_attrs = []
                for attr in elem.findall("attribute"):
                    if attr.get("display") != "off" and "x" in attr.attrib and "y" in attr.attrib:
                        attr_name = attr.get("name")
                        val = attr.get("value", "")
                        if attr_name == "NAME":
                            val = elem.get("name")
                        elif attr_name == "VALUE":
                            val = elem.get("value", "")
                        elem_attrs.append({
                            "name": attr_name,
                            "value": val,
                            "x": float(attr.get("x", 0)),
                            "y": float(attr.get("y", 0)),
                            "size": float(attr.get("size", 1.0)),
                            "layer": int(attr.get("layer", 25)),
                            "rot": attr.get("rot", "R0"),
                            "ratio": int(attr.get("ratio", 8)),
                            "font": attr.get("font", "vector"),
                            "align": attr.get("align", "bottom-left")
                        })
                self.data["board"]["elements"].append({
                    "name": elem.get("name"),
                    "library": elem.get("library"),
                    "package": elem.get("package"),
                    "value": elem.get("value", ""),
                    "x": float(elem.get("x", 0)),
                    "y": float(elem.get("y", 0)),
                    "rot": elem.get("rot", "R0"),
                    "smashed": elem_smashed,
                    "attributes": elem_attrs
                })

        # 3. Parsear señales, pistas, vías y pads
        signals_node = board_node.find("signals")
        if signals_node is not None:
            for sig in signals_node.findall("signal"):
                sig_data = {
                    "name": sig.get("name"),
                    "wires": [],
                    "vias": [],
                    "contactrefs": [],
                    "polygons": []
                }
                for w in sig.findall("wire"):
                    curve = w.get("curve")
                    sig_data["wires"].append({
                        "x1": float(w.get("x1", 0)),
                        "y1": float(w.get("y1", 0)),
                        "x2": float(w.get("x2", 0)),
                        "y2": float(w.get("y2", 0)),
                        "width": float(w.get("width", 0.254)),
                        "layer": int(w.get("layer", 1)),
                        "curve": float(curve) if curve is not None else None,
                        "cap": w.get("cap")
                    })
                for v in sig.findall("via"):
                    drill_val = float(v.get("drill", 0.6096))
                    v_diam = v.get("diameter")
                    if v_diam is not None:
                        diam_val = float(v_diam)
                    else:
                        # Default EAGLE restring for vias: max(drill * 0.25, 0.254mm) on each side
                        restring = max(drill_val * 0.25, 0.254)
                        diam_val = round(drill_val + 2.0 * restring, 4)
                    sig_data["vias"].append({
                        "x": float(v.get("x", 0)),
                        "y": float(v.get("y", 0)),
                        "drill": drill_val,
                        "diameter": diam_val,
                        "shape": v.get("shape", "octagon")
                    })
                for cr in sig.findall("contactref"):
                    sig_data["contactrefs"].append({
                        "element": cr.get("element"),
                        "pad": cr.get("pad")
                    })
                for poly in sig.findall("polygon"):
                    poly_data = {
                        "width": float(poly.get("width", 0.254)),
                        "layer": int(poly.get("layer", 1)),
                        "vertices": []
                    }
                    for vertex in poly.findall("vertex"):
                        poly_data["vertices"].append({
                            "x": float(vertex.get("x", 0)),
                            "y": float(vertex.get("y", 0))
                        })
                    sig_data["polygons"].append(poly_data)
                self.data["board"]["signals"].append(sig_data)

        # 4. Parsear dimensiones de la placa y elementos planos del PCB (plain) en cualquier capa
        plain_node = board_node.find("plain")
        if plain_node is not None:
            self._parse_plain_node(plain_node, self.data["board"]["plain"], is_board=True)
 
        # 5. Parsear agujeros (holes) mecánicos directos de la placa
        holes_node = board_node.find("holes")
        if holes_node is not None:
            for h in holes_node.findall("hole"):
                self.data["board"]["holes"].append({
                    "x": float(h.get("x", 0)),
                    "y": float(h.get("y", 0)),
                    "drill": float(h.get("drill", 0.5))
                })

    def _parse_plain_node(self, plain_node, dest_list, is_board=False):
        for w in plain_node.findall("wire"):
            layer_num = int(w.get("layer", 1))
            curve = w.get("curve")
            wire_data = {
                "type": "wire",
                "x1": float(w.get("x1", 0)),
                "y1": float(w.get("y1", 0)),
                "x2": float(w.get("x2", 0)),
                "y2": float(w.get("y2", 0)),
                "width": float(w.get("width", 0.15)),
                "layer": layer_num,
                "curve": float(curve) if curve is not None else None,
                "cap": w.get("cap")
            }
            if is_board and layer_num == 20:
                self.data["board"]["dimension"].append(wire_data)
            else:
                dest_list.append(wire_data)
        if is_board:
            for h in plain_node.findall("hole"):
                self.data["board"]["holes"].append({
                    "x": float(h.get("x", 0)),
                    "y": float(h.get("y", 0)),
                    "drill": float(h.get("drill", 0.5))
                })
        for t in plain_node.findall("text"):
            dest_list.append({
                "type": "text",
                "text": t.text or "",
                "x": float(t.get("x", 0)),
                "y": float(t.get("y", 0)),
                "size": float(t.get("size", 1.0)),
                "layer": int(t.get("layer", 1)),
                "rot": t.get("rot", "R0"),
                "ratio": int(t.get("ratio", 8)),
                "font": t.get("font", "vector"),
                "align": t.get("align", "bottom-left")
            })
        for c in plain_node.findall("circle"):
            dest_list.append({
                "type": "circle",
                "x": float(c.get("x", 0)),
                "y": float(c.get("y", 0)),
                "radius": float(c.get("radius", 0)),
                "width": float(c.get("width", 0.15)),
                "layer": int(c.get("layer", 1))
            })
        for r in plain_node.findall("rectangle"):
            dest_list.append({
                "type": "rectangle",
                "x1": float(r.get("x1", 0)),
                "y1": float(r.get("y1", 0)),
                "x2": float(r.get("x2", 0)),
                "y2": float(r.get("y2", 0)),
                "layer": int(r.get("layer", 1))
            })
        for poly in plain_node.findall("polygon"):
            poly_data = {
                "type": "polygon",
                "width": float(poly.get("width", 0.15)),
                "layer": int(poly.get("layer", 1)),
                "vertices": []
            }
            for vertex in poly.findall("vertex"):
                poly_data["vertices"].append({
                    "x": float(vertex.get("x", 0)),
                    "y": float(vertex.get("y", 0))
                })
            dest_list.append(poly_data)

    def _build_bom(self):
        """Constructs an aggregated Bill of Materials."""
        parts_dict = {}

        def get_attr(attrs, key):
            if isinstance(attrs, dict):
                return attrs.get(key, "")
            elif isinstance(attrs, list):
                for a in attrs:
                    if isinstance(a, dict) and a.get("name") == key:
                        return a.get("value", "")
            return ""

        elements = self.data.get("board", {}).get("elements", [])
        if elements:
            for elem in elements:
                val = elem.get("value", "") or "No Value"
                pkg = elem.get("package", "") or "Unknown"
                key = (val.strip(), pkg.strip())
                if key not in parts_dict:
                    parts_dict[key] = {
                        "value": val,
                        "package": pkg,
                        "refs": [],
                        "quantity": 0,
                        "description": "",
                        "mpn": get_attr(elem.get("attributes"), "MPN")
                    }
                parts_dict[key]["refs"].append(elem["name"])
                parts_dict[key]["quantity"] += 1
        elif self.data.get("schematic", {}).get("parts"):
            for part in self.data["schematic"]["parts"]:
                val = part.get("value", "") or "No Value"
                devset = part.get("deviceset", "")
                key = (val.strip(), devset.strip())
                if key not in parts_dict:
                    parts_dict[key] = {
                        "value": val,
                        "package": devset,
                        "refs": [],
                        "quantity": 0,
                        "description": "",
                        "mpn": get_attr(part.get("attributes"), "MPN")
                    }
                parts_dict[key]["refs"].append(part["name"])
                parts_dict[key]["quantity"] += 1

        self.data["bom"] = sorted(parts_dict.values(), key=lambda x: (-x["quantity"], x["value"]))

    def _calculate_board_bounds(self):
        """Calculates precise board bounding box based on Dimension layer or elements."""
        dims = self.data.get("board", {}).get("dimension", [])
        min_x, max_x = 1e9, -1e9
        min_y, max_y = 1e9, -1e9

        if dims:
            for d in dims:
                min_x = min(min_x, d["x1"], d["x2"])
                max_x = max(max_x, d["x1"], d["x2"])
                min_y = min(min_y, d["y1"], d["y2"])
                max_y = max(max_y, d["y1"], d["y2"])
        else:
            for elem in self.data.get("board", {}).get("elements", []):
                min_x = min(min_x, elem["x"])
                max_x = max(max_x, elem["x"])
                min_y = min(min_y, elem["y"])
                max_y = max(max_y, elem["y"])

        if min_x > max_x:
            min_x, min_y, max_x, max_y = 0, 0, 100, 80

        if "board" not in self.data:
            self.data["board"] = {}
        self.data["board"]["bounds"] = {
            "min_x": round(min_x, 3),
            "min_y": round(min_y, 3),
            "max_x": round(max_x, 3),
            "max_y": round(max_y, 3),
            "width": round(max_x - min_x, 3),
            "height": round(max_y - min_y, 3)
        }

if __name__ == "__main__":
    parser = EagleParser("copper_viewer/samples/uno_rev3.sch", "copper_viewer/samples/uno_rev3.brd")
    res = parser.parse()
    print("Parsed Holes Count:", len(res["board"]["holes"]))
    print("Parsed BOM lines:", len(res["bom"]))
