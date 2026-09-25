"""
===============================================================================
Copper Viewer - HTML & Asset Generator (generator.py)
===============================================================================
Assembles standalone, zero-dependency interactive HTML viewers inspired by
the Copper Touch app on iPad, embedding 2D vector CAD, Three.js 3D engine,
precision caliper, net tracer, BOM tables, and project gallery.
"""

import os
import json
import base64
from typing import Dict, Any, Optional
from copper_viewer.svg_engine import EagleToSvg


def get_vendor_bundle() -> str:
    """Loads vendored Three.js and OrbitControls bundle."""
    base_dir = os.path.dirname(os.path.realpath(__file__))
    bundle_path = os.path.join(base_dir, "templates", "vendor", "three_bundle.min.js")
    if os.path.exists(bundle_path):
        with open(bundle_path, "r", encoding="utf-8") as f:
            return f.read()
    return ""


def build_viewer_html(circuit_data: Dict[str, Any], template_path: Optional[str] = None) -> str:
    """Builds the complete interactive Copper Viewer HTML document."""
    base_dir = os.path.dirname(os.path.realpath(__file__))
    if not template_path:
        template_path = os.path.join(base_dir, "templates", "viewer.html")

    if not os.path.exists(template_path):
        raise FileNotFoundError(f"Template not found at: {template_path}")

    with open(template_path, "r", encoding="utf-8") as f:
        html = f.read()

    # Vendor Three.js bundle
    vendor_js = get_vendor_bundle()
    html = html.replace("/*VENDOR_THREE_BUNDLE*/", vendor_js)

    # Inject circuit data
    json_data = json.dumps(circuit_data, indent=2)
    html = html.replace("/*EAGLE_DATA_PLACEHOLDER*/", json_data)

    return html
