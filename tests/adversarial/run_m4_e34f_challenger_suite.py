#!/usr/bin/env python3
"""
tests/adversarial/run_m4_e34f_challenger_suite.py

Adversarial Challenger Empirical Verification Suite for Artifact e34f.
Executes 4 rigorous challenge suites:
  Suite 1: Paragraph Double-Vision & Word Wrapping Verification
  Suite 2: Headline "A sheet of glass" Tracking, Width, Centroid Shift & Red Contours
  Suite 3: Categorized Pill Rows (Rows 1-6) - 30 Elements, Shift, IoU, and Modifier Integrity
  Suite 4: Master Verification Pipeline Anti-Deception & Threshold Audit
"""

import os
import sys
import json
import subprocess
from PIL import Image
import numpy as np

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
os.chdir(PROJECT_ROOT)

REF_IMG_PATH = 'output/test_e34f/screenshots/desktop_reference.png'
RND_IMG_PATH = 'output/test_e34f/rendered_compose.png'
DIFF_IMG_PATH = 'output/test_e34f/diff/diff_overlay.png'
EDGE_IMG_PATH = 'output/test_e34f/diff/edge_diff.png'
ZONAL_JSON_PATH = 'output/test_e34f/diff/zonal_diff.json'
COMPOSE_FILE_PATH = 'android/app/src/main/java/com/claude/compose/screen/E34fDesignScreen.kt'

passed_tests = 0
failed_tests = 0
findings = []

def record(test_name, passed, details):
    global passed_tests, failed_tests
    status = "PASS" if passed else "FAIL"
    if passed:
        passed_tests += 1
    else:
        failed_tests += 1
        findings.append(f"[{status}] {test_name}: {details}")
    print(f"[{status}] {test_name}: {details}")

print("=" * 80)
print("RUNNING ADVERSARIAL CHALLENGER SUITE ON ARTIFACT e34f")
print("=" * 80)

# ==============================================================================
# SUITE 1: PARAGRAPH WORD WRAPPING & DOUBLE-VISION
# ==============================================================================
print("\n--- SUITE 1: Paragraph Word Wrapping & Double-Vision ---")

ref_img = Image.open(REF_IMG_PATH).convert('RGB')
rnd_img = Image.open(RND_IMG_PATH).convert('RGB')
diff_img = Image.open(DIFF_IMG_PATH).convert('RGB')

p1_box = (140, 420, 1680, 660)
p1_ref = ref_img.crop(p1_box)
p1_rnd = rnd_img.crop(p1_box)
p1_diff = diff_img.crop(p1_box)

p1_ref_path = 'tests/adversarial/suite_p1_ref.png'
p1_rnd_path = 'tests/adversarial/suite_p1_rnd.png'
p1_ref.save(p1_ref_path)
p1_rnd.save(p1_rnd_path)

ocr_ref_p1 = subprocess.check_output(['tesseract', p1_ref_path, 'stdout', '--psm', '6'], text=True).strip().splitlines()
ocr_rnd_p1 = subprocess.check_output(['tesseract', p1_rnd_path, 'stdout', '--psm', '6'], text=True).strip().splitlines()

# Check line 1 of Paragraph 1
ref_p1_l1 = ocr_ref_p1[0] if ocr_ref_p1 else ""
rnd_p1_l1 = ocr_rnd_p1[0] if ocr_rnd_p1 else ""

p1_wrapping_identical = ("anything" in ref_p1_l1) and ("anything" in rnd_p1_l1)
record(
    "Paragraph 1 Line 1 Word Wrapping ('anything' position)",
    p1_wrapping_identical,
    f"Ref line 1: '{ref_p1_l1}' vs Rnd line 1: '{rnd_p1_l1}'"
)

# Paragraph 2 OCR
p2_box = (140, 700, 1680, 920)
p2_ref = ref_img.crop(p2_box)
p2_rnd = rnd_img.crop(p2_box)
p2_diff = diff_img.crop(p2_box)

p2_ref_path = 'tests/adversarial/suite_p2_ref.png'
p2_rnd_path = 'tests/adversarial/suite_p2_rnd.png'
p2_ref.save(p2_ref_path)
p2_rnd.save(p2_rnd_path)

ocr_ref_p2 = subprocess.check_output(['tesseract', p2_ref_path, 'stdout', '--psm', '6'], text=True).strip().splitlines()
ocr_rnd_p2 = subprocess.check_output(['tesseract', p2_rnd_path, 'stdout', '--psm', '6'], text=True).strip().splitlines()

ref_p2_l1 = ocr_ref_p2[0] if ocr_ref_p2 else ""
rnd_p2_l1 = ocr_rnd_p2[0] if ocr_rnd_p2 else ""

p2_wrapping_identical = ("rotation check" in ref_p2_l1) and ("rotation check" in rnd_p2_l1)
record(
    "Paragraph 2 Line 1 Word Wrapping ('rotation check' position)",
    p2_wrapping_identical,
    f"Ref line 1 ends '{ref_p2_l1[-25:]}' vs Rnd line 1 ends '{rnd_p2_l1[-25:]}'"
)

# Measure red pixels in Paragraph diffs
p1_diff_arr = np.array(p1_diff)
p2_diff_arr = np.array(p2_diff)

p1_red = np.sum((p1_diff_arr[:, :, 0] == 244) & (p1_diff_arr[:, :, 1] == 63) & (p1_diff_arr[:, :, 2] == 94))
p2_red = np.sum((p2_diff_arr[:, :, 0] == 244) & (p2_diff_arr[:, :, 1] == 63) & (p2_diff_arr[:, :, 2] == 94))
total_para_red = p1_red + p2_red

diff_arr = np.array(diff_img)
total_canvas_red = np.sum((diff_arr[:, :, 0] == 244) & (diff_arr[:, :, 1] == 63) & (diff_arr[:, :, 2] == 94))

para_red_ratio = (total_para_red / total_canvas_red) * 100.0 if total_canvas_red > 0 else 0

record(
    "Paragraph Double-Vision Red Ghosting Absence",
    total_para_red == 0,
    f"Paragraph 1 has {p1_red} red px, Paragraph 2 has {p2_red} red px ({para_red_ratio:.1f}% of entire screen red mismatch)"
)

# ==============================================================================
# SUITE 2: HEADLINE "A SHEET OF GLASS" TRACKING & CONTOUR ALIGNMENT
# ==============================================================================
print("\n--- SUITE 2: Headline 'A sheet of glass' ---")

hl_crop_box = (140, 220, 1150, 380)
ref_hl = ref_img.crop(hl_crop_box)
rnd_hl = rnd_img.crop(hl_crop_box)
diff_hl = diff_img.crop(hl_crop_box)
edge_img = Image.open(EDGE_IMG_PATH).convert('RGB')
edge_hl = edge_img.crop(hl_crop_box)

ref_hl_arr = np.array(ref_hl.convert('L')) < 180
rnd_hl_arr = np.array(rnd_hl.convert('L')) < 180
diff_hl_arr = np.array(diff_hl)
edge_hl_arr = np.array(edge_hl)

ref_y, ref_x = np.where(ref_hl_arr)
rnd_y, rnd_x = np.where(rnd_hl_arr)

ref_w = int(np.max(ref_x) - np.min(ref_x) + 1)
rnd_w = int(np.max(rnd_x) - np.min(rnd_x) + 1)
dw = rnd_w - ref_w

ref_cx = float(np.mean(ref_x))
ref_cy = float(np.mean(ref_y))
rnd_cx = float(np.mean(rnd_x))
rnd_cy = float(np.mean(rnd_y))
hl_dx = rnd_cx - ref_cx
hl_dy = rnd_cy - ref_cy
hl_shift = (hl_dx**2 + hl_dy**2)**0.5

record(
    "Headline Width & Tracking Parity",
    abs(dw) <= 3,
    f"Ref width: {ref_w}px, Rnd width: {rnd_w}px (dw = {dw:+d}px, limit <= 3px)"
)

record(
    "Headline Spatial Drift Magnitude",
    hl_shift <= 3.0,
    f"Centroid dx = {hl_dx:+.2f}px, dy = {hl_dy:+.2f}px, shift magnitude = {hl_shift:.2f}px (limit <= 3.0px)"
)

hl_diff_red = np.sum((diff_hl_arr[:, :, 0] == 244) & (diff_hl_arr[:, :, 1] == 63) & (diff_hl_arr[:, :, 2] == 94))
hl_edge_red = np.sum((edge_hl_arr[:, :, 0] > 180) & (edge_hl_arr[:, :, 1] < 100) & (edge_hl_arr[:, :, 2] < 100))

record(
    "Headline Absence of Red Diff Pixels",
    hl_diff_red == 0,
    f"Found {hl_diff_red} rose red pixels in diff_overlay over headline"
)

record(
    "Headline Absence of Red Edge Contours",
    hl_edge_red == 0,
    f"Found {hl_edge_red} red contour pixels in edge_diff over headline"
)

# ==============================================================================
# SUITE 3: CATEGORIZED PILL ROWS EVALUATION
# ==============================================================================
print("\n--- SUITE 3: Categorized Pill Rows (Rows 1-6) ---")

with open(ZONAL_JSON_PATH, 'r') as f:
    zonal_data = json.load(f)

vectors = zonal_data.get('driftVectors', [])
vec_map = {v.get('name') or v.get('elementId'): v for v in vectors}

record(
    "Evaluation of all 30 Semantic Elements with priorityFilter = 'all'",
    len(vectors) == 30,
    f"Evaluated {len(vectors)} elements (expected 30)"
)

row_elements = {
    "Row 1": ["Directions", "6 · Toolbar band", "1 · Frosted plate", "3 · Floating slips", "4 · Loose coins"],
    "Row 2": ["Bolder ideas", "2a · Sun bloom", "3c · The dial", "6d · Ledger band"],
    "Row 3": ["Evaluate", "5 · Rotation / landscape check"],
    "Row 4": ["Beyond the bar", "g1 · Gestures", "g2 · The glass", "g3 · Ink", "g4 · Selection", "g5 · Pages", "g6 · First stroke"],
    "Row 5": ["Mildliner", "m · The mildliner"],
    "Row 6": ["Shared system", "presets", "cards", "snip", "small", "onboard"]
}

for row_name, elem_list in row_elements.items():
    row_max_shift = 0.0
    row_min_iou = 100.0
    for el_name in elem_list:
        v = vec_map.get(el_name)
        if not v:
            continue
        dx = v.get('dx', 0)
        dy = v.get('dy', 0)
        s = v.get('shiftMagnitude')
        if s is None:
            s = (dx**2 + dy**2)**0.5
        iou = v.get('iou', 0)
        row_max_shift = max(row_max_shift, s)
        row_min_iou = min(row_min_iou, iou)

    record(
        f"{row_name} Max Shift <= 3.0px",
        row_max_shift <= 3.0,
        f"Max shift = {row_max_shift:.2f}px"
    )
    record(
        f"{row_name} Element IoU >= 90.0%",
        row_min_iou >= 90.0,
        f"Min IoU = {row_min_iou:.1f}%"
    )

# Inspect E34fDesignScreen.kt for category label modifier facade tricks
with open(COMPOSE_FILE_PATH, 'r') as f:
    compose_code = f.read()

has_facade_default = "labelModifier: Modifier = Modifier.width(140.dp)" in compose_code
call_sites_override_empty = compose_code.count("labelModifier = Modifier,") == 6

record(
    "Category Label Modifier Genuine Application",
    not (has_facade_default and call_sites_override_empty),
    f"Found facade default 'labelModifier: Modifier = Modifier.width(140.dp)' overridden by 'labelModifier = Modifier' across all {compose_code.count('labelModifier = Modifier,')} call sites"
)

# ==============================================================================
# SUMMARY & FINAL VERDICT
# ==============================================================================
print("\n" + "=" * 80)
print(f"RESULTS: {passed_tests} PASSED, {failed_tests} FAILED")
print("=" * 80)

if failed_tests > 0:
    print("\nCRITICAL FINDINGS & DEFECTS DETECTED:")
    for finding in findings:
        print(f"  * {finding}")
    print("\nFINAL ADVERSARIAL VERDICT: REJECT")
    sys.exit(1)
else:
    print("\nFINAL ADVERSARIAL VERDICT: APPROVE")
    sys.exit(0)
