#!/usr/bin/env python3
"""Deterministically import the captured da63 SVG glyphs as native Android path data.

Usage: python3 tools/import_da63_vectors.py --source /path/to/design-da63/assets/vectors
       python3 tools/import_da63_vectors.py --source /path/to/... --check
No network or third-party Python packages are needed. Unsupported SVG features fail closed.
"""

import argparse
import hashlib
import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ICONS = {
    "pen": "pen_",
    "pencil": "highlighter_",
    "highlighter": "marker_",
    "eraser": "eraser_",
    "lasso": "lasso_",
    "scissors": "snip_",
    "contrast": "glass_",
    "document": "new_page_",
    "undo": "undo_",
    "redo": "redo_",
    "more": "more_",
}
OUTPUT = Path(__file__).resolve().parents[1] / "app/src/main/java/com/claude/compose/screen/Da63VectorAssets.kt"
TRANSFORM = re.compile(r"matrix\(([^)]+)\)")
ROOT_ATTRIBUTES = {"width", "height", "viewBox", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "data-dc-tpl"}
CHILD_ATTRIBUTES = {
    "path": {"d", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "fill-rule", "transform", "data-dc-tpl"},
    "rect": {"x", "y", "width", "height", "rx", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "transform", "data-dc-tpl"},
    "circle": {"cx", "cy", "r", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "transform", "data-dc-tpl"},
}


def reject_unknown(path, tag, attributes, allowed):
    unknown = set(attributes) - allowed
    if unknown:
        raise ValueError(f"{path.name}: unsupported {tag} attributes: {', '.join(sorted(unknown))}")


def kfloat(value):
    return f"{float(value):.6g}f" if "." in str(value) or "e" in str(value).lower() else f"{int(value)}f"


def parse_file(path):
    root = ET.parse(path).getroot()
    if root.tag.split("}")[-1] != "svg":
        raise ValueError(f"{path.name}: not SVG")
    reject_unknown(path, "svg", root.attrib, ROOT_ATTRIBUTES)
    if root.attrib.get("width") != root.attrib.get("height"):
        raise ValueError(f"{path.name}: expected square SVG dimensions")
    box = [float(v) for v in root.attrib["viewBox"].replace(",", " ").split()]
    if box[:2] != [0.0, 0.0] or box[2] != box[3]:
        raise ValueError(f"{path.name}: expected square viewBox at origin")
    inherited = {k: root.attrib.get(k) for k in ("fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin")}
    parts = []
    for node in root:
        kind = node.tag.split("}")[-1]
        if kind not in ("path", "rect", "circle"):
            raise ValueError(f"{path.name}: unsupported SVG node {kind}")
        reject_unknown(path, kind, node.attrib, CHILD_ATTRIBUTES[kind])
        fill = node.attrib.get("fill", inherited["fill"] or "none")
        stroke = node.attrib.get("stroke", inherited["stroke"] or "none")
        if fill not in ("none", "currentColor") or stroke not in ("none", "currentColor"):
            raise ValueError(f"{path.name}: unsupported color {fill}/{stroke}")
        fill_rule = node.attrib.get("fill-rule", "nonzero")
        if fill_rule not in ("nonzero", "evenodd"):
            raise ValueError(f"{path.name}: unsupported fill rule {fill_rule}")
        transforms = TRANSFORM.findall(node.attrib.get("transform", ""))
        residual = TRANSFORM.sub("", node.attrib.get("transform", "")).strip()
        if residual:
            raise ValueError(f"{path.name}: unsupported transform {residual}")
        matrices = []
        for transform in transforms:
            values = [float(x) for x in transform.replace(",", " ").split()]
            if len(values) != 6:
                raise ValueError(f"{path.name}: matrix must have six values")
            matrices.append(values)
        if kind == "path":
            data = node.attrib["d"]
            numbers = []
        elif kind == "rect":
            data = ""
            numbers = [float(node.attrib.get(k, 0)) for k in ("x", "y", "width", "height", "rx")]
        else:
            data = ""
            numbers = [float(node.attrib[k]) for k in ("cx", "cy", "r")]
        cap = node.attrib.get("stroke-linecap", inherited["stroke-linecap"] or "butt")
        join = node.attrib.get("stroke-linejoin", inherited["stroke-linejoin"] or "miter")
        if cap not in ("butt", "round", "square") or join not in ("miter", "round", "bevel"):
            raise ValueError(f"{path.name}: unsupported stroke cap/join {cap}/{join}")
        parts.append({
            "kind": kind,
            "data": data,
            "numbers": numbers,
            "fill": fill == "currentColor",
            "stroke": stroke == "currentColor",
            "stroke_width": float(node.attrib.get("stroke-width", inherited["stroke-width"] or 1)),
            "cap": cap,
            "join": join,
            "even_odd": fill_rule == "evenodd",
            "matrices": matrices,
        })
    return box[2], parts


def emit(source):
    lines = [
        "// Generated by tools/import_da63_vectors.py from captured da63 SVGs. Do not hand-edit.",
        "package com.claude.compose.screen",
        "",
        "internal data class Da63VectorPart(",
        "    val kind: String, val data: String, val numbers: FloatArray, val fill: Boolean,",
        "    val stroke: Boolean, val strokeWidth: Float, val cap: String, val join: String,",
        "    val evenOdd: Boolean, val matrices: List<FloatArray>",
        ")",
        "internal data class Da63VectorAsset(val viewBox: Float, val sourceSha256: String, val parts: List<Da63VectorPart>)",
        "internal object Da63VectorAssets {",
        "    val all: Map<String, Da63VectorAsset> = mapOf(",
    ]
    for name, prefix in ICONS.items():
        found = sorted(source.glob(prefix + "*.svg"))
        if len(found) != 1:
            raise ValueError(f"expected exactly one {prefix}*.svg, got {len(found)}")
        path = found[0]
        sha = hashlib.sha256(path.read_bytes()).hexdigest()
        box, parts = parse_file(path)
        lines.append(f'        "{name}" to Da63VectorAsset({kfloat(box)}, "{sha}", listOf(')
        for part in parts:
            nums = ", ".join(kfloat(v) for v in part["numbers"])
            mats = ", ".join("floatArrayOf(" + ", ".join(kfloat(v) for v in m) + ")" for m in part["matrices"])
            lines.append(
                "            Da63VectorPart(" + ", ".join([
                    json.dumps(part["kind"]), json.dumps(part["data"]), f"floatArrayOf({nums})",
                    str(part["fill"]).lower(), str(part["stroke"]).lower(), kfloat(part["stroke_width"]),
                    json.dumps(part["cap"]), json.dumps(part["join"]), str(part["even_odd"]).lower(),
                    f"listOf({mats})",
                ]) + "),"
            )
        lines.append("        )),")
    lines += ["    )", "}", ""]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path, help="Captured design-da63/assets/vectors directory")
    parser.add_argument("--check", action="store_true", help="Fail if generated Kotlin differs")
    args = parser.parse_args()
    generated = emit(args.source)
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text() != generated:
            print(f"stale generated vectors: {OUTPUT}", file=sys.stderr)
            return 1
        print(f"verified {len(ICONS)} SVG imports: {OUTPUT}")
        return 0
    OUTPUT.write_text(generated)
    print(f"wrote {len(ICONS)} SVG imports: {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
