# Deep Dive: Copper CAD Engine & Thumbnail Architecture

This document preserves the architectural analysis, data models, layer color schemes, and rendering mechanics reverse-engineered from **Copper Touch / CopperKit (iOS)**. It serves as the engineering reference for the clean-room CAD rendering and search engine in **Copper Viewer**.

---

## 1. Executive Summary & Forensic Context

- **Target App:** Copper Touch (by artandcode / Benjamin Scholtysik).
- **Core Framework:** `CopperKit.framework` (Mach-O 64-bit ARM64 dynamic library).
- **Inspected Environment:** iPad Air 1st Gen (iOS 12.4), inspected via live memory attachment and Mach-O symbol analysis.
- **Key Discovery:** Copper decouples data models (`AFBoard`, `AFSchematic`, `AFPackage`, `AFSignal`, `AFElement`) from an ultra-optimized vector renderer (`AFRenderer`). All thumbnails for search items and list views are generated dynamically on-the-fly using CoreGraphics vector drawing with an internal memory cache (`_imageCache`).

---

## 2. Core Architecture & Disassembled Interfaces

From our live process inspection and symbol recovery of `CopperKit.framework`, the rendering engine centers around `AFRenderer`:

```objc
@interface AFRenderer : NSObject

@property (nonatomic, strong) NSOperationQueue *renderQueue;
@property (nonatomic, strong) NSCache *imageCache;

+ (instancetype)sharedRenderer;

// MARK: - Package & Footprint Rendering
- (UIImage *)imageOfPackageFootprint:(id)package scale:(double)scale;
- (UIImage *)imageOfPackageFootprint:(id)package backgroundColor:(id)color size:(CGSize)size;
- (UIImage *)imageOfPackageFootprint:(id)package backgroundColor:(id)color size:(CGSize)size colorTheme:(NSUInteger)theme;
- (void)renderPackageFootprint:(id)package layerNumber:(NSInteger)layer;
- (void)renderPackageFootprint:(id)package layerNumber:(NSInteger)layer colorTheme:(NSUInteger)theme;

// MARK: - Signal / Net Rendering
- (UIImage *)imageOfSignal:(id)signal backgroundColor:(id)color size:(CGSize)size;
- (UIImage *)imageOfSignal:(id)signal backgroundColor:(id)color size:(CGSize)size colorTheme:(NSUInteger)theme;
- (void)renderSignal:(id)signal 
             inLayer:(NSInteger)layer 
              inRect:(CGRect)rect 
           withColor:(id)color 
     backgroundColor:(id)bgColor 
        drawPolygons:(BOOL)polygons 
         clipOutline:(BOOL)clip 
       renderPattern:(BOOL)pattern;

// MARK: - Primitives & Layer Transforms
- (CGRect)boundingBoxOfLayers:(id)layers;
- (void)drawPrimitive:(id)primitive fill:(BOOL)fill color:(id)color;
- (void)drawPrimitiveInstance:(id)instance fill:(BOOL)fill color:(id)color renderPattern:(BOOL)pattern;
- (void)drawPrimitiveInstances:(id)instances inDirtyRect:(CGRect)rect expandLinesBy:(CGFloat)expand color:(id)color fill:(BOOL)fill drawPolygons:(BOOL)polygons transform:(CGAffineTransform)transform;

@end
```

---

## 3. Thumbnail Generation Algorithms

### 3.1 Part & Footprint Thumbnails (`imageOfPackageFootprint:`)

1. **Coordinate Space:**
   - Packages are defined in their **local component coordinate system**, where `(0, 0)` is the centroid or pin 1 origin of the package.
   - Elements reference their package via the library mapping `${element.library}_${element.package}` or `${element.package}`.

2. **Bounding Box Calculation:**
   - Aggregates bounds from:
     - **SMD Pads (Layer 1 & 16):** `x ± dx/2`, `y ± dy/2`.
     - **THT Pads:** `x ± diameter/2` (or `drill * 1.6`).
     - **Silkscreen & Docu Lines (Layers 21, 22, 51, 52):** `x1, y1` to `x2, y2`.
     - **Circles & Holes:** `center ± radius`.
   - Adds **18% - 20% margin** around the maximum dimension `max(width, height)` to prevent clipping of thick silkscreen strokes.

3. **Layer Color Encoding:**
   - **Silkscreen (`tPlace` Layer 21 / `bPlace` Layer 22):** White / Light Slate (`#e2e8f0` / `rgba(255,255,255,0.9)`), line-cap round, stroke width scaled to ~3.5% of max dimension.
   - **Documentation (`tDocu` Layer 51 / `bDocu` Layer 52):** Translucent White (`rgba(226, 232, 240, 0.45)`).
   - **Top SMD Pads (Layer 1):** Vibrant Red (`#dc2626` / `#ef4444`) with amber/gold solder boundary accent (`#f59e0b`).
   - **Bottom SMD Pads (Layer 16):** Royal Blue (`#2563eb`) with sky-blue border (`#60a5fa`).
   - **THT Through-Hole Pads:** Emerald Green annular ring (`#16a34a` / `#22c55e`) with a dark center core (`#11141a`) representing the drill hole.

4. **Parametric Fallback:**
   - If a package is missing in the board XML, the engine deduces the component class from the reference designator prefix (`R` = resistor chip, `C` = capacitor, `D`/`LED` = diode triangle, `U`/`IC` = dual in-line microchip, `Q` = transistor, `L` = inductor coils) and generates an authentic CAD icon.

---

### 3.2 Signal / Net Thumbnails (`imageOfSignal:`)

1. **Global Trace Extraction:**
   - Aggregates all primitives belonging to the signal across all layers:
     - `wires`: start and end coordinates `(x1, y1) -> (x2, y2)` and `layer`.
     - `vias`: drill center `(x, y)` and diameter.
     - `polygons`: copper plane fills and isolation cuts.

2. **Scaling & Aspect Ratio:**
   - Calculates the signal's full board bounding box `(minX, minY)` to `(maxX, maxY)`.
   - Uniformly scales both X and Y into a square viewport with **15% padding** so the trace routing topology is instantly recognizable at micro scale.

3. **Multi-layer Routing Colors:**
   - **Top Layer (1):** Bright Red (`#ef4444`).
   - **Bottom Layer (16):** Bright Green (`#22c55e`).
   - **Inner Copper Layers (2-15):** Blue (`#3b82f6`).
   - **Vias:** Gold / Yellow circles (`#eab308`) with a dark center punch hole (`#11141a`).

---

## 4. Visual Comparison

| Feature | iPad Copper Touch (Original) | Copper Viewer (Web / SVG Vector) |
| :--- | :--- | :--- |
| **Search Scopes** | Parts, Signals, Both | Ambos, Componentes, Señales |
| **Part Thumbnails** | Native CoreGraphics Bitmaps | Scalable Vector Graphics (SVG `<svg class="copper-micro-thumb">`) |
| **Silkscreen** | Accurate Layer 21/51 outlines | Preserved EAGLE wires, curves & circles |
| **SMD Pads** | Layer 1 Red / Layer 16 Blue | Exact dx/dy dimensions, roundness & gold accents |
| **THT Pads** | Green annular ring + drill hole | Green annular ring with dark drill center |
| **Signal Routes** | Multi-layer colored traces + vias | Multi-layer colored SVG paths + gold via dots |
| **Subtitles** | Value + Package / Wire & Via Counts | Value • Package / Wire & Via Counts |
| **Zero Dependencies**| CocoaTouch / Objective-C | Pure HTML5 + SVG (No Node, No NPM) |

### Visual Artifacts

- **iPad Search - Parts:** `docs/research/assets/ipad_copper_search_parts.png`
- **iPad Search - Signals:** `docs/research/assets/ipad_copper_search_signals.png`
- **Copper Viewer - Parts:** `docs/research/assets/copper_viewer_search_parts.png`
- **Copper Viewer - Signals:** `docs/research/assets/copper_viewer_search_signals.png`

---

## 5. Clean-Room Implementation Guidelines

All implementations in `copper-viewer` (`copper_search.js`, `copper_tools.js`, `generator.py`, `svg_engine.py`) are strictly independent, clean-room creations written in Python and JavaScript. They translate standard XML EAGLE structures (`.sch`, `.brd`) into web-standards representations without incorporating any proprietary code.
