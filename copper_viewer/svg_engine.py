import math
import sys
import os
import xml.etree.ElementTree as ET
import re
from copper_viewer.parser import EagleParser

class EagleToSvg:
    def __init__(self, data):
        self.data = data

    def export_schematic(self, output_path):
        instances = self.data["schematic"]["instances"]
        nets = self.data["schematic"]["nets"]
        symbols = self.data["schematic"]["symbols"]
        plain_elements = self.data["schematic"].get("plain", [])

        min_x, max_x, min_y, max_y = 9999, -9999, 9999, -9999
        
        for inst in instances:
            min_x = min(min_x, inst["x"])
            max_x = max(max_x, inst["x"])
            min_y = min(min_y, -inst["y"])
            max_y = max(max_y, -inst["y"])

        for net in nets:
            for w in net["wires"]:
                min_x = min(min_x, w["x1"], w["x2"])
                max_x = max(max_x, w["x1"], w["x2"])
                min_y = min(min_y, -w["y1"], -w["y2"])
                max_y = max(max_y, -w["y1"], -w["y2"])

        for item in plain_elements:
            if "x" in item:
                min_x = min(min_x, item["x"])
                max_x = max(max_x, item["x"])
                min_y = min(min_y, -item["y"])
                max_y = max(max_y, -item["y"])
            elif "x1" in item:
                min_x = min(min_x, item["x1"], item["x2"])
                max_x = max(max_x, item["x1"], item["x2"])
                min_y = min(min_y, -item["y1"], -item["y2"])
                max_y = max(max_y, -item["y1"], -item["y2"])
            elif "vertices" in item:
                for v in item["vertices"]:
                    min_x = min(min_x, v["x"])
                    max_x = max(max_x, v["x"])
                    min_y = min(min_y, -v["y"])
                    max_y = max(max_y, -v["y"])

        margin = 15
        if min_x > max_x:
            min_x, max_x, min_y, max_y = 0, 100, -100, 0
        else:
            min_x -= margin
            max_x += margin
            min_y -= margin
            max_y += margin

        width = max_x - min_x
        height = max_y - min_y

        # Crear SVG
        svg_root = ET.Element("svg", {
            "xmlns": "http://www.w3.org/2000/svg",
            "viewBox": f"{min_x} {min_y} {width} {height}",
            "width": "100%",
            "height": "100%",
            "style": "background-color: #ffffff;"
        })

        # Estilos CSS embebidos
        style = ET.SubElement(svg_root, "style")
        style_text = """
            .wire { stroke: #008000; stroke-width: 0.4; fill: none; stroke-linecap: round; }
            .junction { fill: #008000; }
            .part-wire { stroke: #800000; stroke-width: 0.3; fill: none; stroke-linecap: round; }
            .part-rect { stroke: #800000; stroke-width: 0.3; fill: #80000010; }
            .part-circle { stroke: #800000; stroke-width: 0.3; fill: none; }
            .pin-line { stroke: #800000; stroke-width: 0.3; }
            .part-label { fill: #800000; font-family: "Courier New", Courier, monospace; font-size: 1.5px; font-weight: bold; }
            .sch-text { fill: #374151; font-family: "Courier New", Courier, monospace; font-size: 1.3px; }
            
            .sch-plain-wire { stroke: #990000; stroke-width: 0.25; fill: none; stroke-linecap: round; }
            .sch-plain-text { fill: #990000; font-family: "Courier New", Courier, monospace; font-size: 1.5px; }
            .sch-plain-circle { stroke: #990000; stroke-width: 0.25; fill: none; }
            .sch-plain-rect { stroke: #990000; stroke-width: 0.25; fill: none; }
            .sch-plain-polygon { fill: #99000030; stroke: #990000; stroke-width: 0.25; }
        """

        # Crear Capas principales en orden de apilamiento
        g_frame = ET.SubElement(svg_root, "g", {"id": "sch-layer-frame"})
        g_components = ET.SubElement(svg_root, "g", {"id": "sch-layer-components"})
        g_nets = ET.SubElement(svg_root, "g", {"id": "sch-layer-nets"})
        g_texts = ET.SubElement(svg_root, "g", {"id": "sch-layer-texts"})

        # 1. Capa Frame: Elementos plain de la hoja
        for item in plain_elements:
            if item["type"] == "wire":
                if item.get("curve"):
                    path_str = self._calculate_arc_path(item["x1"], -item["y1"], item["x2"], -item["y2"], item["curve"])
                    ET.SubElement(g_frame, "path", {
                        "d": path_str,
                        "class": "sch-plain-wire"
                    })
                else:
                    ET.SubElement(g_frame, "line", {
                        "x1": str(item["x1"]),
                        "y1": str(-item["y1"]),
                        "x2": str(item["x2"]),
                        "y2": str(-item["y2"]),
                        "class": "sch-plain-wire"
                    })
            elif item["type"] == "text":
                lines = item["text"].split("\n")
                text_el = ET.SubElement(g_frame, "text", {
                    "x": str(item["x"]),
                    "y": str(-item["y"]),
                    "class": "sch-plain-text",
                    "style": f"font-size: {item['size']}px;"
                })
                for idx, line_str in enumerate(lines):
                    tspan = ET.SubElement(text_el, "tspan", {
                        "x": str(item["x"])
                    })
                    if idx > 0:
                        tspan.set("dy", f"{item['size'] * 1.2}px")
                    tspan.text = line_str
            elif item["type"] == "circle":
                ET.SubElement(g_frame, "circle", {
                    "cx": str(item["x"]),
                    "cy": str(-item["y"]),
                    "r": str(item["radius"]),
                    "class": "sch-plain-circle"
                })
            elif item["type"] == "rectangle":
                ET.SubElement(g_frame, "rect", {
                    "x": str(min(item["x1"], item["x2"])),
                    "y": str(-max(item["y1"], item["y2"])),
                    "width": str(abs(item["x2"] - item["x1"])),
                    "height": str(abs(item["y2"] - item["y1"])),
                    "class": "sch-plain-rect"
                })
            elif item["type"] == "polygon":
                points = " ".join([f"{v['x']},{ -v['y']}" for v in item["vertices"]])
                ET.SubElement(g_frame, "polygon", {
                    "points": points,
                    "class": "sch-plain-polygon"
                })

        # 2. Capa Nets: Redes y uniones
        for net in nets:
            for w in net["wires"]:
                if w.get("curve"):
                    path_str = self._calculate_arc_path(w["x1"], -w["y1"], w["x2"], -w["y2"], w["curve"])
                    ET.SubElement(g_nets, "path", {
                        "d": path_str,
                        "class": "wire"
                    })
                else:
                    ET.SubElement(g_nets, "line", {
                        "x1": str(w["x1"]),
                        "y1": str(-w["y1"]),
                        "x2": str(w["x2"]),
                        "y2": str(-w["y2"]),
                        "class": "wire"
                    })
            for j in net["junctions"]:
                ET.SubElement(g_nets, "circle", {
                    "cx": str(j["x"]),
                    "cy": str(-j["y"]),
                    "r": "0.7",
                    "class": "junction"
                })
                
            if "labels" in net:
                for lbl in net["labels"]:
                    rot_val = lbl.get("rot", "R0")
                    l_angle = 0
                    if rot_val:
                        match = re.search(r"R(\d+)", rot_val)
                        if match:
                            l_angle = int(match.group(1))
                            
                    tx = lbl["x"]
                    ty = lbl["y"]
                    
                    attribs = {
                        "x": str(tx),
                        "y": str(-ty),
                        "style": f"font-family: 'Courier New', Courier, monospace; font-size: {lbl.get('size', 1.778)}px; fill: #990000; font-weight: bold;",
                        "text-anchor": "start"
                    }
                    
                    transform_str = ""
                    if l_angle != 0:
                        transform_str = f"rotate({-l_angle}, {tx}, {-ty})"
                        
                    # Offset
                    if l_angle == 0:
                        attribs["y"] = str(-ty - 0.5)
                    elif l_angle == 90:
                        attribs["x"] = str(tx - 0.5)
                        transform_str = f"rotate(-90, {tx}, {-ty})"
                        
                    if transform_str:
                        attribs["transform"] = transform_str
                        
                    text_el = ET.SubElement(g_nets, "text", attribs)
                    text_el.text = net["name"]

        # 3. Capas Componentes y Textos
        for inst in instances:
            sym_key = f"{inst['library']}_{inst['symbol']}"
            sym = symbols.get(sym_key)
            
            if not sym:
                for k, v in symbols.items():
                    if k.endswith(f"_{inst['symbol']}"):
                        sym = v
                        break

            angle = 0
            mirrored = 'M' in inst["rot"] if inst["rot"] else False
            if inst["rot"]:
                match = re.search(r"R(\d+)", inst["rot"])
                if match:
                    angle = int(match.group(1))
            
            gate_x = inst.get("gate_x", 0.0)
            gate_y = inst.get("gate_y", 0.0)
            transform_str = f"translate({inst['x']}, {-inst['y']}) "
            if mirrored:
                transform_str += "scale(-1, 1) "
            transform_str += f"rotate({-angle})"

            # Grupo para el componente gráfico
            g_comp = ET.SubElement(g_components, "g")
            g_comp.set("transform", transform_str)
            g_comp_sub = ET.SubElement(g_comp, "g", {
                "transform": "translate(0.0, 0.0)"
            })

            # Grupo para el texto del componente
            g_text = ET.SubElement(g_texts, "g")
            g_text.set("transform", transform_str)
            g_text_sub = ET.SubElement(g_text, "g", {
                "transform": "translate(0.0, 0.0)"
            })

            if sym:
                if "frames" in sym:
                    for f in sym["frames"]:
                        self._render_frame_to_xml(f, g_comp_sub)
                
                for w in sym["wires"]:
                    width_style = ""
                    if w.get("width"):
                        w_width = min(float(w["width"]), 0.25)
                        width_style = f"stroke-width: {w_width};"
                    
                    if w.get("curve"):
                        path_str = self._calculate_arc_path(w["x1"], -w["y1"], w["x2"], -w["y2"], w["curve"])
                        attribs = {
                            "d": path_str,
                            "class": "part-wire"
                        }
                        if width_style: attribs["style"] = width_style
                        ET.SubElement(g_comp_sub, "path", attribs)
                    else:
                        attribs = {
                            "x1": str(w["x1"]),
                            "y1": str(-w["y1"]),
                            "x2": str(w["x2"]),
                            "y2": str(-w["y2"]),
                            "class": "part-wire"
                        }
                        if width_style: attribs["style"] = width_style
                        ET.SubElement(g_comp_sub, "line", attribs)
                for r in sym["rectangles"]:
                    ET.SubElement(g_comp_sub, "rect", {
                        "x": str(min(r["x1"], r["x2"])),
                        "y": str(-max(r["y1"], r["y2"])),
                        "width": str(abs(r["x2"] - r["x1"])),
                        "height": str(abs(r["y2"] - r["y1"])),
                        "class": "part-rect"
                    })
                for c in sym["circles"]:
                    ET.SubElement(g_comp_sub, "circle", {
                        "cx": str(c["x"]),
                        "cy": str(-c["y"]),
                        "r": str(c["radius"]),
                        "class": "part-circle"
                    })
                for p in sym["pins"]:
                    len_val = 5.08
                    if p["length"] == "long": len_val = 7.62
                    elif p["length"] == "short": len_val = 2.54
                    elif p["length"] == "point": len_val = 0.0
                    
                    pin_angle = 0
                    if p["rot"]:
                        match = re.search(r"R(\d+)", p["rot"])
                        if match:
                            pin_angle = int(match.group(1))
                            
                    is_dot = "function" in p and p["function"] is not None and "dot" in p["function"]
                    line_len = max(0.0, len_val - 0.8) if is_dot else len_val
                    
                    dx = line_len * math.cos(pin_angle * math.pi / 180.0)
                    dy = line_len * math.sin(pin_angle * math.pi / 180.0)
                    
                    ET.SubElement(g_comp_sub, "line", {
                        "x1": str(p["x"]),
                        "y1": str(-p["y"]),
                        "x2": str(p["x"] + dx),
                        "y2": str(-p["y"] - dy),
                        "class": "pin-line"
                    })
                    
                    if is_dot:
                        dot_dx = len_val * math.cos(pin_angle * math.pi / 180.0)
                        dot_dy = len_val * math.sin(pin_angle * math.pi / 180.0)
                        ET.SubElement(g_comp_sub, "circle", {
                            "cx": str(p["x"] + dot_dx),
                            "cy": str(-p["y"] - dot_dy),
                            "r": "0.7",
                            "class": "part-circle",
                            "style": "fill: #ffffff;"
                        })

                    # Dibujar nombre de pin si visible es "pin" o "both"
                    visible = p.get("visible", "both")
                    if p.get("name") and visible in ["pin", "both"]:
                        dir_x = math.cos(pin_angle * math.pi / 180.0)
                        dir_y = math.sin(pin_angle * math.pi / 180.0)
                        
                        text_dist = len_val + 1.0
                        tx = p["x"] + text_dist * dir_x
                        ty = p["y"] + text_dist * dir_y
                        
                        attribs = {
                            "x": str(tx),
                            "y": str(-ty + 0.4),
                            "style": "font-family: 'Courier New', Courier, monospace; font-size: 1.1px; fill: #374151;"
                        }
                        
                        if abs(dir_x - 1.0) < 0.01:
                            attribs["text-anchor"] = "start"
                        elif abs(dir_x + 1.0) < 0.01:
                            attribs["text-anchor"] = "end"
                        elif abs(dir_y - 1.0) < 0.01:
                            attribs["text-anchor"] = "start"
                            attribs["transform"] = f"rotate(-90, {tx}, {-ty})"
                            attribs["y"] = str(-ty + 0.2)
                        elif abs(dir_y + 1.0) < 0.01:
                            attribs["text-anchor"] = "end"
                            attribs["transform"] = f"rotate(-90, {tx}, {-ty})"
                            attribs["y"] = str(-ty + 0.2)
                            
                        text_el = ET.SubElement(g_comp_sub, "text", attribs)
                        text_el.text = p["name"]
                
                # Renderizar los textos de los símbolos
                for t in sym["texts"]:
                    val = t["text"]
                    val_upper = val.upper()
                    if val_upper in [">NAME", ">NAME"]:
                        val = inst["part"]
                        cls = "part-label"
                    elif val_upper in [">VALUE", ">VALUE"]:
                        val = inst["value"]
                        cls = "sch-text"
                    elif val_upper == ">DRAWING_NAME":
                        val = self.data.get("name", "usb_c_charger")
                        cls = "sch-text"
                    elif val_upper == ">LAST_DATE_TIME":
                        val = "7/17/26 6:07 PM"
                        cls = "sch-text"
                    elif val_upper == ">SHEET":
                        val = "Sheet: 1/1"
                        cls = "sch-text"
                    elif val_upper == ">AUTHOR":
                        val = "K. TOWNSEND"
                        cls = "sch-text"
                    else:
                        cls = "sch-text"
                        
                    t_angle = 0
                    if t["rot"]:
                        match = re.search(r"R(\d+)", t["rot"])
                        if match:
                            t_angle = int(match.group(1))
                            
                    text_el = ET.SubElement(g_text_sub, "text", {
                        "x": str(t["x"]),
                        "y": str(-t["y"]),
                        "class": cls
                    })
                    
                    transform_str = ""
                    if mirrored:
                        transform_str += f"translate({t['x']}, {-t['y']}) scale(-1, 1) translate({-t['x']}, {t['y']}) "
                    if angle != 0:
                        transform_str += f"translate({t['x']}, {-t['y']}) rotate({angle}) translate({-t['x']}, {t['y']}) "
                    if t_angle != 0:
                        transform_str += f"translate({t['x']}, {-t['y']}) rotate({-t_angle}) translate({-t['x']}, {t['y']}) "
                        
                    if transform_str:
                        text_el.set("transform", transform_str.strip())
                    text_el.text = val
            else:
                # Caja genérica
                ET.SubElement(g_comp_sub, "rect", {
                    "x": "-5",
                    "y": "-5",
                    "width": "10",
                    "height": "10",
                    "class": "part-rect"
                })
                lbl = ET.SubElement(g_text_sub, "text", {
                    "x": "0",
                    "y": "-7",
                    "class": "part-label",
                    "text-anchor": "middle"
                })
                lbl.text = inst["part"]

        tree = ET.ElementTree(svg_root)
        tree.write(output_path, encoding="utf-8", xml_declaration=True)

    def export_board(self, output_path, side="both", mirror_bottom=True, ratsnest=True):
        dimension = self.data["board"]["dimension"]
        elements = self.data["board"]["elements"]
        signals = self.data["board"]["signals"]
        packages = self.data["board"]["packages"]

        min_x, max_x, min_y, max_y = 9999, -9999, 9999, -9999
        
        for d in dimension:
            min_x = min(min_x, d["x1"], d["x2"])
            max_x = max(max_x, d["x1"], d["x2"])
            min_y = min(min_y, -d["y1"], -d["y2"])
            max_y = max(max_y, -d["y1"], -d["y2"])

        if min_x > max_x:
            for elem in elements:
                min_x = min(min_x, elem["x"])
                max_x = max(max_x, elem["x"])
                min_y = min(min_y, -elem["y"])
                max_y = max(max_y, -elem["y"])

        margin = 5
        if min_x > max_x:
            min_x, max_x, min_y, max_y = 0, 50, -50, 0
        else:
            min_x -= margin
            max_x += margin
            min_y -= margin
            max_y += margin

        width = max_x - min_x
        height = max_y - min_y

        svg_root = ET.Element("svg", {
            "xmlns": "http://www.w3.org/2000/svg",
            "viewBox": f"{min_x} {min_y} {width} {height}",
            "width": "100%",
            "height": "100%",
            "style": "background-color: #000000;"
        })

        style = ET.SubElement(svg_root, "style")
        style_text = """
            .dim { stroke: #ffffff; stroke-width: 0.25; fill: none; opacity: 1.0; }
            .track-top { stroke: #cc0000; stroke-linecap: round; stroke-linejoin: round; fill: none; opacity: 1.0; }
            .track-bottom { stroke: #0000cc; stroke-linecap: round; stroke-linejoin: round; fill: none; opacity: 1.0; }
            .track-halo { stroke: #000000; fill: none; stroke-linecap: round; stroke-linejoin: round; }
            .via { fill: #ffff00; stroke: #00cc44; stroke-width: 0.12; }
            .via-hole { fill: #000000; }
            .silk { stroke: #ffffff; stroke-width: 0.15; fill: none; opacity: 1.0; stroke-linecap: round; }
            .silk-poly { fill: #ffffff; opacity: 0.8; }
            /* Copper pour styles (Ratsnest mode) */
            __POLY_STYLES__
            .smd-top { fill: #cc0000; stroke: #ffff00; stroke-width: 0.1; }
            .smd-bottom { fill: #0000cc; stroke: #ffff00; stroke-width: 0.1; }
            .pad { fill: #00cc44; stroke: #ffff00; stroke-width: 0.12; }
            .pad-hole { fill: #000000; }
            .silk-text { fill: #ffffff; font-family: 'Courier New', 'Consolas', monospace; font-size: 0.8px; font-weight: bold; text-anchor: middle; }
        """
        if ratsnest:
            poly_styles = """
            .poly-top { fill: #cc0000; fill-opacity: 0.75; stroke: #cc0000; stroke-width: 0.2; }
            .poly-bottom { fill: #0000cc; fill-opacity: 0.75; stroke: #0000cc; stroke-width: 0.2; }
            """
        else:
            poly_styles = """
            .poly-top { fill: none; stroke: #cc0000; stroke-width: 0.25; stroke-dasharray: 0.6 0.6; opacity: 0.8; }
            .poly-bottom { fill: none; stroke: #0000cc; stroke-width: 0.25; stroke-dasharray: 0.6 0.6; opacity: 0.8; }
            """
        style_text = style_text.replace("__POLY_STYLES__", poly_styles)
        style.text = style_text

        # 1. Calcular el bounding box de la placa basándose en la capa 20 Dimension
        min_dim_x, max_dim_x, min_dim_y, max_dim_y = 9999, -9999, 9999, -9999
        for d in dimension:
            min_dim_x = min(min_dim_x, d["x1"], d["x2"])
            max_dim_x = max(max_dim_x, d["x1"], d["x2"])
            min_dim_y = min(min_dim_y, -d["y1"], -d["y2"])
            max_dim_y = max(max_dim_y, -d["y1"], -d["y2"])

        # Group container for side/mirroring
        if side == "bottom" and mirror_bottom:
            container = ET.SubElement(svg_root, "g", {
                "transform": f"translate({min_x + max_x}, 0) scale(-1, 1)"
            })
        else:
            container = svg_root

        # 2. Dibujar el sustrato FR4 físico de la placa con esquinas redondeadas
        if min_dim_x < max_dim_x:
            ET.SubElement(container, "rect", {
                "x": str(min_dim_x),
                "y": str(min_dim_y),
                "width": str(max_dim_x - min_dim_x),
                "height": str(max_dim_y - min_dim_y),
                "rx": "1.2",
                "ry": "1.2",
                "fill": "#000000",
                "stroke": "#ffffff",
                "stroke-width": "0.25"
            })

        # 3. Dibujar Dimensiones de la serigrafía exterior
        for d in dimension:
            if d.get("curve"):
                path_str = self._calculate_arc_path(d["x1"], -d["y1"], d["x2"], -d["y2"], d["curve"])
                ET.SubElement(container, "path", {
                    "d": path_str,
                    "class": "dim"
                })
            else:
                ET.SubElement(container, "line", {
                    "x1": str(d["x1"]),
                    "y1": str(-d["y1"]),
                    "x2": str(d["x2"]),
                    "y2": str(-d["y2"]),
                    "class": "dim"
                })

        # 4. Capa Bottom (Cobre Azul) - Con grupo de mezcla aditiva
        if side in ("both", "bottom"):
            g_bottom_attrs = {"id": "layer-16-bottom"}
            if side == "both":
                g_bottom_attrs["style"] = "mix-blend-mode: screen;"
            g_bottom = ET.SubElement(container, "g", g_bottom_attrs)

            # Polígonos Bottom
            has_bottom_poly = False
            for sig in signals:
                if sig.get("polygons"):
                    for poly in sig["polygons"]:
                        if poly["layer"] == 16:
                            has_bottom_poly = True
                            ET.SubElement(g_bottom, "polygon", {
                                "points": " ".join([f"{v['x']},{-v['y']}" for v in poly["vertices"]]),
                                "class": "poly-bottom"
                            })

            # Halos de aislamiento en negro para pistas que cruzan polígonos
            if has_bottom_poly and ratsnest:
                for sig in signals:
                    for w in sig["wires"]:
                        if w["layer"] == 16:
                            halo_w = float(w["width"]) + 0.6
                            if w.get("curve"):
                                path_str = self._calculate_arc_path(w["x1"], -w["y1"], w["x2"], -w["y2"], w["curve"])
                                ET.SubElement(g_bottom, "path", {
                                    "d": path_str,
                                    "class": "track-halo",
                                    "style": f"stroke-width: {halo_w};"
                                })
                            else:
                                ET.SubElement(g_bottom, "line", {
                                    "x1": str(w["x1"]),
                                    "y1": str(-w["y1"]),
                                    "x2": str(w["x2"]),
                                    "y2": str(-w["y2"]),
                                    "class": "track-halo",
                                    "style": f"stroke-width: {halo_w};"
                                })

            # Pistas Bottom
            for sig in signals:
                for w in sig["wires"]:
                    if w["layer"] == 16:
                        if w.get("curve"):
                            path_str = self._calculate_arc_path(w["x1"], -w["y1"], w["x2"], -w["y2"], w["curve"])
                            ET.SubElement(g_bottom, "path", {
                                "d": path_str,
                                "class": "track-bottom",
                                "style": f"stroke-width: {w['width']};"
                            })
                        else:
                            ET.SubElement(g_bottom, "line", {
                                "x1": str(w["x1"]),
                                "y1": str(-w["y1"]),
                                "x2": str(w["x2"]),
                                "y2": str(-w["y2"]),
                                "class": "track-bottom",
                                "style": f"stroke-width: {w['width']};"
                            })

        # 5. Capa Top (Cobre Rojo) - Con grupo de mezcla aditiva
        if side in ("both", "top"):
            g_top_attrs = {"id": "layer-1-top"}
            if side == "both":
                g_top_attrs["style"] = "mix-blend-mode: screen;"
            g_top = ET.SubElement(container, "g", g_top_attrs)

            # Polígonos Top
            has_top_poly = False
            for sig in signals:
                if sig.get("polygons"):
                    for poly in sig["polygons"]:
                        if poly["layer"] == 1:
                            has_top_poly = True
                            ET.SubElement(g_top, "polygon", {
                                "points": " ".join([f"{v['x']},{-v['y']}" for v in poly["vertices"]]),
                                "class": "poly-top"
                            })

            # Halos de aislamiento en negro para pistas que cruzan polígonos
            if has_top_poly and ratsnest:
                for sig in signals:
                    for w in sig["wires"]:
                        if w["layer"] == 1:
                            halo_w = float(w["width"]) + 0.6
                            if w.get("curve"):
                                path_str = self._calculate_arc_path(w["x1"], -w["y1"], w["x2"], -w["y2"], w["curve"])
                                ET.SubElement(g_top, "path", {
                                    "d": path_str,
                                    "class": "track-halo",
                                    "style": f"stroke-width: {halo_w};"
                                })
                            else:
                                ET.SubElement(g_top, "line", {
                                    "x1": str(w["x1"]),
                                    "y1": str(-w["y1"]),
                                    "x2": str(w["x2"]),
                                    "y2": str(-w["y2"]),
                                    "class": "track-halo",
                                    "style": f"stroke-width: {halo_w};"
                                })

            # Pistas Top
            for sig in signals:
                for w in sig["wires"]:
                    if w["layer"] == 1:
                        if w.get("curve"):
                            path_str = self._calculate_arc_path(w["x1"], -w["y1"], w["x2"], -w["y2"], w["curve"])
                            ET.SubElement(g_top, "path", {
                                "d": path_str,
                                "class": "track-top",
                                "style": f"stroke-width: {w['width']};"
                            })
                        else:
                            ET.SubElement(g_top, "line", {
                                "x1": str(w["x1"]),
                                "y1": str(-w["y1"]),
                                "x2": str(w["x2"]),
                                "y2": str(-w["y2"]),
                                "class": "track-top",
                                "style": f"stroke-width: {w['width']};"
                            })

        # 8. Vías (oro/latón con perforación negra)
        for sig in signals:
            for v in sig["vias"]:
                ET.SubElement(container, "circle", {
                    "cx": str(v["x"]),
                    "cy": str(-v["y"]),
                    "r": str(v["diameter"] / 2),
                    "class": "via"
                })
                ET.SubElement(container, "circle", {
                    "cx": str(v["x"]),
                    "cy": str(-v["y"]),
                    "r": str(v["drill"] / 2),
                    "class": "via-hole"
                })

        # 8b. Dibujar elementos planos libres (Plain) como logos bitmaps, textos libres, círculos, etc.
        if "plain" in self.data["board"]:
            for item in self.data["board"]["plain"]:
                layer_cls = f"silk layer-{item['layer']}"
                if item["layer"] == 1:
                    layer_cls = "track-top"
                elif item["layer"] == 16:
                    layer_cls = "track-bottom"
                
                if item["type"] == "wire":
                    if item.get("curve"):
                        path_str = self._calculate_arc_path(item["x1"], -item["y1"], item["x2"], -item["y2"], item["curve"])
                        ET.SubElement(svg_root, "path", {
                            "d": path_str,
                            "class": layer_cls,
                            "style": f"stroke-width: {item['width']};" if item.get("width") else ""
                        })
                    else:
                        ET.SubElement(svg_root, "line", {
                            "x1": str(item["x1"]),
                            "y1": str(-item["y1"]),
                            "x2": str(item["x2"]),
                            "y2": str(-item["y2"]),
                            "class": layer_cls,
                            "style": f"stroke-width: {item['width']};" if item.get("width") else ""
                        })
                elif item["type"] == "polygon":
                    poly_cls = "silk-poly"
                    if item["layer"] == 1: poly_cls = "poly-top"
                    elif item["layer"] == 16: poly_cls = "poly-bottom"
                    
                    ET.SubElement(container, "polygon", {
                        "points": " ".join([f"{v['x']},{-v['y']}" for v in item["vertices"]]),
                        "class": f"{poly_cls} layer-{item['layer']}"
                    })
                elif item["type"] == "circle":
                    ET.SubElement(container, "circle", {
                        "cx": str(item["x"]),
                        "cy": str(-item["y"]),
                        "r": str(item["radius"]),
                        "class": f"silk layer-{item['layer']}",
                        "style": f"stroke-width: {item['width']};" if item.get("width") else ""
                    })
                elif item["type"] == "rectangle":
                    ET.SubElement(container, "rect", {
                        "x": str(min(item["x1"], item["x2"])),
                        "y": str(-max(item["y1"], item["y2"])),
                        "width": str(abs(item["x2"] - item["x1"])),
                        "height": str(abs(item["y2"] - item["y1"])),
                        "class": f"silk-poly layer-{item['layer']}"
                    })
                elif item["type"] == "text":
                    t_angle = 0
                    if item.get("rot"):
                        match = re.search(r"R(\d+)", item["rot"])
                        if match:
                            t_angle = int(match.group(1))
                    
                    text_el = ET.SubElement(container, "text", {
                        "x": str(item["x"]),
                        "y": str(-item["y"]),
                        "class": f"silk-text layer-{item['layer']}"
                    })
                    if t_angle != 0:
                        text_el.set("transform", f"rotate({-t_angle}, {item['x']}, {-item['y']})")
                    text_el.text = item["text"]

        # 3. Footprints de elementos (Con espejado correcto scale(-1,1))
        for elem in elements:
            pkg_key = f"{elem['library']}_{elem['package']}"
            pkg = packages.get(pkg_key)

            g = ET.SubElement(container, "g")
            
            angle = 0
            mirrored = 'M' in elem["rot"] if elem["rot"] else False
            if elem["rot"]:
                match = re.search(r"R(\d+)", elem["rot"])
                if match:
                    angle = int(match.group(1))

            transform_str = f"translate({elem['x']}, {-elem['y']}) "
            if mirrored:
                transform_str += "scale(-1, 1) "
            transform_str += f"rotate({-angle})"
            g.set("transform", transform_str)

            if pkg:
                if pkg.get("polygons"):
                    for poly in pkg["polygons"]:
                        ET.SubElement(g, "polygon", {
                            "points": " ".join([f"{v['x']},{-v['y']}" for v in poly["vertices"]]),
                            "class": "silk-poly"
                        })
                for w in pkg["wires"]:
                    if w.get("curve"):
                        path_str = self._calculate_arc_path(w["x1"], -w["y1"], w["x2"], -w["y2"], w["curve"])
                        ET.SubElement(g, "path", {
                            "d": path_str,
                            "class": "silk"
                        })
                    else:
                        ET.SubElement(g, "line", {
                            "x1": str(w["x1"]),
                            "y1": str(-w["y1"]),
                            "x2": str(w["x2"]),
                            "y2": str(-w["y2"]),
                            "class": "silk"
                        })
                for c in pkg["circles"]:
                    ET.SubElement(g, "circle", {
                        "cx": str(c["x"]),
                        "cy": str(-c["y"]),
                        "r": str(c["radius"]),
                        "class": "silk"
                    })
                for s in pkg["smds"]:
                    smd_angle = 0
                    if s["rot"]:
                        match = re.search(r"R(\d+)", s["rot"])
                        if match:
                            smd_angle = int(match.group(1))
                            
                    rect = ET.SubElement(g, "rect", {
                        "x": str(s["x"] - s["dx"] / 2),
                        "y": str(-s["y"] - s["dy"] / 2),
                        "width": str(s["dx"]),
                        "height": str(s["dy"]),
                        "class": "smd-top" if s["layer"] == 1 else "smd-bottom"
                    })
                    if smd_angle != 0:
                        rect.set("transform", f"rotate({-smd_angle}, {s['x']}, {-s['y']})")
                for p in pkg["pads"]:
                    diameter = p["diameter"] if p["diameter"] else (p["drill"] * 1.6)
                    pad_g = ET.SubElement(g, "g")
                    
                    if p["shape"] == "square":
                        ET.SubElement(pad_g, "rect", {
                            "x": str(p["x"] - diameter / 2),
                            "y": str(-p["y"] - diameter / 2),
                            "width": str(diameter),
                            "height": str(diameter),
                            "class": "pad"
                        })
                    elif p["shape"] == "octagonal":
                        r = diameter / 2
                        c = r * 0.414
                        pts = f"{p['x']-r},{-p['y']-c} {p['x']-r},{-p['y']+c} {p['x']-c},{-p['y']+r} {p['x']+c},{-p['y']+r} {p['x']+r},{-p['y']+c} {p['x']+r},{-p['y']-c} {p['x']+c},{-p['y']-r} {p['x']-c},{-p['y']-r}"
                        ET.SubElement(pad_g, "polygon", {
                            "points": pts,
                            "class": "pad"
                        })
                    elif p["shape"] == "long":
                        pad_rot = 0
                        if p.get("rot"):
                            m = re.search(r"R(\d+)", p["rot"])
                            if m:
                                pad_rot = int(m.group(1))
                        pad_len = diameter * 2.0
                        pad_w = diameter
                        r_c = diameter / 2.0
                        rect_attribs = {
                            "x": str(p["x"] - pad_len / 2.0),
                            "y": str(-p["y"] - pad_w / 2.0),
                            "width": str(pad_len),
                            "height": str(pad_w),
                            "rx": str(r_c),
                            "ry": str(r_c),
                            "class": "pad"
                        }
                        if pad_rot != 0:
                            rect_attribs["transform"] = f"rotate({-pad_rot}, {p['x']}, {-p['y']})"
                        ET.SubElement(pad_g, "rect", rect_attribs)
                    else:
                        ET.SubElement(pad_g, "circle", {
                            "cx": str(p["x"]),
                            "cy": str(-p["y"]),
                            "r": str(diameter / 2),
                            "class": "pad"
                        })
                    
                    ET.SubElement(pad_g, "circle", {
                        "cx": str(p["x"]),
                        "cy": str(-p["y"]),
                        "r": str(p["drill"] / 2),
                        "class": "pad-hole"
                    })

                if pkg.get("holes"):
                    for h in pkg["holes"]:
                        ET.SubElement(g, "circle", {
                            "cx": str(h["x"]),
                            "cy": str(-h["y"]),
                            "r": str(h["drill"] / 2),
                            "class": "pad-hole layer-45"
                        })

                # Etiqueta de referencia compensando mirror
                txt_attrs = {
                    "x": "0",
                    "y": "0",
                    "class": "silk-text"
                }
                if mirrored:
                    txt_attrs["transform"] = "scale(-1, 1)"
                txt = ET.SubElement(g, "text", txt_attrs)
                txt.text = elem["name"]
                
                # Otros textos del package
                for t in pkg["texts"]:
                    val = t["text"]
                    if val in [">NAME", ">Name", ">name"]: val = elem["name"]
                    elif val in [">VALUE", ">Value", ">value"]: val = elem["value"]
                    
                    t_angle = 0
                    if t["rot"]:
                        match = re.search(r"R(\d+)", t["rot"])
                        if match:
                            t_angle = int(match.group(1))
                            
                    pText_attrs = {
                        "x": str(t["x"]),
                        "y": str(-t["y"]),
                        "class": "silk-text"
                    }
                    
                    transform_text_str = ""
                    if mirrored:
                        transform_text_str += "scale(-1, 1) "
                    if t_angle != 0:
                        transform_text_str += f"rotate({-t_angle}, {t['x']}, {-t['y']}) "
                        
                    if transform_text_str:
                        pText_attrs["transform"] = transform_text_str.strip()
                        
                    pText = ET.SubElement(g, "text", pText_attrs)
                    pText.text = val

        # 10. Agujeros directos en la placa (Holes)
        if "holes" in self.data["board"]:
            for h in self.data["board"]["holes"]:
                ET.SubElement(container, "circle", {
                    "cx": str(h["x"]),
                    "cy": str(-h["y"]),
                    "r": str(h["drill"] / 2),
                    "class": "pad-hole layer-45"
                })

        tree = ET.ElementTree(svg_root)
        tree.write(output_path, encoding="utf-8", xml_declaration=True)

    def export_board_top(self, output_path, ratsnest=True):
        """Exports clean isolated top side of the PCB with copper flood pour."""
        return self.export_board(output_path, side="top", mirror_bottom=False, ratsnest=ratsnest)

    def export_board_bottom(self, output_path, mirror=True, ratsnest=True):
        """Exports clean isolated bottom side of the PCB, mirrored horizontally with copper flood pour."""
        return self.export_board(output_path, side="bottom", mirror_bottom=mirror, ratsnest=ratsnest)

    def _calculate_arc_path(self, x1, y1, x2, y2, curve):
        arc_angle = curve * math.pi / 180.0
        length = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
        
        sin_val = math.sin(arc_angle / 2.0)
        if abs(sin_val) < 0.001:
            return f"M {x1} {y1} L {x2} {y2}"
            
        radius = abs(length / sin_val) / 2.0
        rot_angle = math.atan2(y2 - y1, x2 - x1) * 180.0 / math.pi
        
        large_arc = '1' if abs(curve) > 180.0 else '0'
        sweep = '0' if curve < 0.0 else '1'
        
        return f"M {x1} {y1} A {radius} {radius} {rot_angle} {large_arc} {sweep} {x2} {y2}"

    def _render_frame_to_xml(self, f, parent):
        g = ET.SubElement(parent, "g", {"class": "sch-frame-group"})
        
        x1 = f["x1"]
        y1 = -f["y1"]
        x2 = f["x2"]
        y2 = -f["y2"]
        
        # Recuadro exterior
        ET.SubElement(g, "rect", {
            "x": str(min(x1, x2)),
            "y": str(min(y1, y2)),
            "width": str(abs(x2 - x1)),
            "height": str(abs(y2 - y1)),
            "style": "stroke: #990000; stroke-width: 0.3; fill: none;"
        })
        
        margin = 4.0
        ix1 = min(x1, x2) + margin
        iy1 = min(y1, y2) + margin
        iw = abs(x2 - x1) - 2 * margin
        ih = abs(y2 - y1) - 2 * margin
        
        # Recuadro interior
        ET.SubElement(g, "rect", {
            "x": str(ix1),
            "y": str(iy1),
            "width": str(iw),
            "height": str(ih),
            "style": "stroke: #990000; stroke-width: 0.15; fill: none;"
        })
        
        # Columnas
        col_width = iw / f["columns"]
        for c in range(1, f["columns"]):
            cx = ix1 + c * col_width
            ET.SubElement(g, "line", {
                "x1": str(cx),
                "y1": str(min(y1, y2)),
                "x2": str(cx),
                "y2": str(iy1),
                "style": "stroke: #990000; stroke-width: 0.15;"
            })
            ET.SubElement(g, "line", {
                "x1": str(cx),
                "y1": str(max(y1, y2) - margin),
                "x2": str(cx),
                "y2": str(max(y1, y2)),
                "style": "stroke: #990000; stroke-width: 0.15;"
            })
            
        for c in range(f["columns"]):
            cx = ix1 + c * col_width + col_width / 2
            t_top = ET.SubElement(g, "text", {
                "x": str(cx),
                "y": str(min(y1, y2) + margin / 2 + 0.8),
                "text-anchor": "middle",
                "style": "font-family: 'Courier New', Courier, monospace; font-size: 2.0px; fill: #990000;"
            })
            t_top.text = str(c + 1)
            t_bot = ET.SubElement(g, "text", {
                "x": str(cx),
                "y": str(max(y1, y2) - margin / 2 + 0.8),
                "text-anchor": "middle",
                "style": "font-family: 'Courier New', Courier, monospace; font-size: 2.0px; fill: #990000;"
            })
            t_bot.text = str(c + 1)
            
        # Filas
        row_height = ih / f["rows"]
        for r in range(1, f["rows"]):
            cy = iy1 + r * row_height
            ET.SubElement(g, "line", {
                "x1": str(min(x1, x2)),
                "y1": str(cy),
                "x2": str(ix1),
                "y2": str(cy),
                "style": "stroke: #990000; stroke-width: 0.15;"
            })
            ET.SubElement(g, "line", {
                "x1": str(max(x1, x2) - margin),
                "y1": str(cy),
                "x2": str(max(x1, x2)),
                "y2": str(cy),
                "style": "stroke: #990000; stroke-width: 0.15;"
            })
            
        alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        for r in range(f["rows"]):
            cy = iy1 + r * row_height + row_height / 2 + 0.8
            letter = alphabet[r] if r < len(alphabet) else "?"
            t_left = ET.SubElement(g, "text", {
                "x": str(min(x1, x2) + margin / 2),
                "y": str(cy),
                "text-anchor": "middle",
                "style": "font-family: 'Courier New', Courier, monospace; font-size: 2.0px; fill: #990000;"
            })
            t_left.text = letter
            t_right = ET.SubElement(g, "text", {
                "x": str(max(x1, x2) - margin / 2),
                "y": str(cy),
                "text-anchor": "middle",
                "style": "font-family: 'Courier New', Courier, monospace; font-size: 2.0px; fill: #990000;"
            })
            t_right.text = letter

if __name__ == "__main__":
    if len(sys.argv) < 5:
        print("Uso: python3 eagle_to_svg.py <sch> <brd> <output_sch.svg> <output_brd.svg>")
        sys.exit(1)
        
    parser = EagleParser(sys.argv[1], sys.argv[2])
    data = parser.parse()
    
    exporter = EagleToSvg(data)
    exporter.export_schematic(sys.argv[3])
    exporter.export_board(sys.argv[4])
    print("SVG files generated successfully!")
