#!/usr/bin/env python3
"""
===============================================================================
Copper Viewer - Command-Line Interface (cli.py)
===============================================================================
CLI tool for Autodesk & CadSoft EAGLE CAD, Gerber and PCB inspection.
Inspired by Copper Touch on iPad.
"""

import sys
import os

# Ensure package directory is in sys.path when invoked via symlink
project_root = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

import json
import shutil
import argparse
import subprocess
import webbrowser
from typing import Optional, Tuple, List, Dict, Any

from copper_viewer import __version__
from copper_viewer.parser import EagleParser
from copper_viewer.svg_engine import EagleToSvg
from copper_viewer.generator import build_viewer_html


def resolve_companion_files(files: List[str], sch_arg: Optional[str], brd_arg: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """Automatically pairs .sch and .brd companion files if only one was provided."""
    sch_path = sch_arg
    brd_path = brd_arg

    for f in files:
        ext = os.path.splitext(f)[1].lower()
        if ext == ".sch" and not sch_path:
            sch_path = f
        elif ext == ".brd" and not brd_path:
            brd_path = f

    # Auto-discovery in same directory
    if sch_path and not brd_path:
        candidate = os.path.splitext(sch_path)[0] + ".brd"
        if os.path.exists(candidate):
            brd_path = candidate
    elif brd_path and not sch_path:
        candidate = os.path.splitext(brd_path)[0] + ".sch"
        if os.path.exists(candidate):
            sch_path = candidate

    return sch_path, brd_path


def parse_args():
    parser = argparse.ArgumentParser(
        prog="copper-viewer",
        description="Next-generation EAGLE CAD, Gerber and PCB interactive viewer inspired by Copper Touch for iPad.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Open interactive 2D/3D viewer for a board and schematic:
  copper-viewer uno_rev3.brd uno_rev3.sch

  # Auto-discover companion file in same directory:
  copper-viewer bluepill.brd

  # Launch a bundled reference sample circuit:
  copper-viewer --sample uno
  copper-viewer --sample bluepill
  copper-viewer --sample usbc

  # Generate standalone HTML viewer silently:
  copper-viewer my_board.brd --no-open -o /path/to/viewer.html

  # Export vector SVGs for documentation:
  copper-viewer my_board.brd --export-svg ./svg_out/ --no-open

  # Dump parsed topology JSON for UNIX pipelines:
  copper-viewer my_board.brd --json-only > circuit.json
"""
    )

    parser.add_argument(
        "files",
        nargs="*",
        help="Path to EAGLE .brd and/or .sch files."
    )
    parser.add_argument(
        "--sch",
        help="Explicit path to schematic file (.sch)."
    )
    parser.add_argument(
        "--brd",
        help="Explicit path to board file (.brd)."
    )
    parser.add_argument(
        "--sample",
        choices=["uno", "bluepill", "usbc"],
        help="Quickly load a bundled reference hardware demo board."
    )
    parser.add_argument(
        "-o", "--output",
        help="Path for generated standalone HTML viewer file."
    )
    parser.add_argument(
        "--export-svg",
        metavar="DIR",
        help="Export schematic and board layer SVGs into specified directory."
    )
    parser.add_argument(
        "--export-png",
        metavar="DIR",
        help="Export high-resolution PNG previews using headless Chromium/Chrome."
    )
    parser.add_argument(
        "--json",
        metavar="FILE",
        help="Write parsed circuit topology JSON to a file (or '-' for stdout)."
    )
    parser.add_argument(
        "--json-only",
        action="store_true",
        help="Print pure parsed circuit topology JSON to stdout and exit."
    )
    parser.add_argument(
        "--no-open",
        action="store_true",
        help="Do not automatically launch the web browser."
    )
    parser.add_argument(
        "-v", "--version",
        action="version",
        version=f"%(prog)s {__version__}"
    )

    return parser.parse_args()


def get_sample_paths(sample_name: str) -> Tuple[str, str]:
    """Retrieves path to bundled sample files."""
    base_dir = os.path.dirname(os.path.realpath(__file__))
    samples_dir = os.path.join(base_dir, "samples")
    mapping = {
        "uno": ("uno_rev3.sch", "uno_rev3.brd"),
        "bluepill": ("bluepill.sch", "bluepill.brd"),
        "usbc": ("usb_c_charger.sch", "usb_c_charger.brd")
    }
    sch_file, brd_file = mapping.get(sample_name, ("", ""))
    return os.path.join(samples_dir, sch_file), os.path.join(samples_dir, brd_file)


def main():
    args = parse_args()

    sch_path = None
    brd_path = None

    if args.sample:
        sch_path, brd_path = get_sample_paths(args.sample)
    else:
        sch_path, brd_path = resolve_companion_files(args.files, args.sch, args.brd)

    if not sch_path and not brd_path:
        print("Error: No EAGLE schematic (.sch) or board (.brd) files specified.", file=sys.stderr)
        print("Try 'copper-viewer --sample uno' or run 'copper-viewer --help' for usage.", file=sys.stderr)
        sys.exit(1)

    if sch_path and not os.path.exists(sch_path):
        print(f"Error: Schematic file not found: '{sch_path}'", file=sys.stderr)
        sys.exit(1)

    if brd_path and not os.path.exists(brd_path):
        print(f"Error: Board file not found: '{brd_path}'", file=sys.stderr)
        sys.exit(1)

    circuit_name = "copper_design"
    if brd_path:
        circuit_name = os.path.splitext(os.path.basename(brd_path))[0]
    elif sch_path:
        circuit_name = os.path.splitext(os.path.basename(sch_path))[0]

    if not args.json_only:
        print(f"⚡ Copper Viewer v{__version__} - Inspecting '{circuit_name}'")
        if sch_path:
            print(f"   Schematic: {sch_path}")
        if brd_path:
            print(f"   Board:     {brd_path}")

    # Parse XML CAD data
    try:
        parser = EagleParser(sch_path or "", brd_path or "")
        circuit_data = parser.parse()
        circuit_data["name"] = circuit_name
    except Exception as e:
        print(f"Error parsing EAGLE XML files: {e}", file=sys.stderr)
        sys.exit(1)

    # JSON output options
    if args.json_only:
        try:
            print(json.dumps(circuit_data, indent=2))
        except BrokenPipeError:
            sys.stderr.close()
        sys.exit(0)

    if args.json:
        json_output_str = json.dumps(circuit_data, indent=2)
        if args.json == "-":
            print(json_output_str)
        else:
            with open(args.json, "w", encoding="utf-8") as f:
                f.write(json_output_str)
            print(f"-> Parsed circuit JSON saved to: {args.json}")

    # SVG Export
    if args.export_svg is not None:
        target_dir = args.export_svg
        if target_dir == ".":
            target_dir = os.getcwd()
        os.makedirs(target_dir, exist_ok=True)

        exporter = EagleToSvg(circuit_data)
        if sch_path and circuit_data.get("schematic", {}).get("instances"):
            sch_svg = os.path.join(target_dir, f"{circuit_name}_schematic.svg")
            exporter.export_schematic(sch_svg)
            print(f"-> Exported Schematic SVG: {sch_svg}")

        if brd_path and (circuit_data.get("board", {}).get("elements") or circuit_data.get("board", {}).get("dimension")):
            brd_top_svg = os.path.join(target_dir, f"{circuit_name}_board_top.svg")
            exporter.export_board_top(brd_top_svg)
            print(f"-> Exported Board Top SVG: {brd_top_svg}")

            brd_bot_svg = os.path.join(target_dir, f"{circuit_name}_board_bottom.svg")
            exporter.export_board_bottom(brd_bot_svg, mirror=True)
            print(f"-> Exported Board Bottom SVG: {brd_bot_svg}")

            brd_svg = os.path.join(target_dir, f"{circuit_name}_board.svg")
            exporter.export_board(brd_svg, side="both")
            print(f"-> Exported Board PCB (Combined) SVG: {brd_svg}")

    # PNG Export via Headless Chromium
    if args.export_png is not None:
        target_png_dir = args.export_png
        if target_png_dir == ".":
            target_png_dir = os.getcwd()
        os.makedirs(target_png_dir, exist_ok=True)

        chrome_bin = shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chromium-browser")
        if not chrome_bin:
            print("Warning: Chrome/Chromium not found for PNG rendering.", file=sys.stderr)
        else:
            exporter = EagleToSvg(circuit_data)
            if brd_path:
                brd_svg = os.path.join(target_png_dir, f"{circuit_name}_board.svg")
                if not os.path.exists(brd_svg):
                    exporter.export_board(brd_svg, side="both")
                brd_png = os.path.join(target_png_dir, f"{circuit_name}_board.png")
                subprocess.run([
                    chrome_bin, "--headless", "--disable-gpu",
                    f"--screenshot={brd_png}", "--window-size=1600,1100",
                    f"file://{os.path.abspath(brd_svg)}"
                ], capture_output=True)
                if os.path.exists(brd_png):
                    print(f"-> Exported Board PNG: {brd_png}")

    # Generate HTML Standalone Viewer
    output_path = args.output
    if not output_path:
        output_path = os.path.join(os.getcwd(), f"{circuit_name}_copper_viewer.html")

    try:
        rendered_html = build_viewer_html(circuit_data)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(rendered_html)
        print(f"-> Interactive Copper Viewer ready: {output_path}")
    except Exception as e:
        print(f"Error generating viewer HTML: {e}", file=sys.stderr)
        sys.exit(1)

    # Launch browser unless --no-open was passed
    if not args.no_open:
        abs_output = os.path.abspath(output_path)
        file_url = f"file://{abs_output}"
        print(f"-> Launching Copper Viewer in browser: {file_url}")
        webbrowser.open(file_url)


if __name__ == "__main__":
    main()
