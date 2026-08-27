#!/usr/bin/env python3
"""
Garment Staging Pipeline v2
============================
One garment per image. AI cleans it up, we post-process.

Pipeline:
  1. AI garment staging via Cloudflare Workers AI (FLUX.2 Klein 4B)
  2. Auto-crop + center on white + sharpen

Config rationale (from research):
- FLUX.2 Klein 4B is step-distilled: steps=4 is FIXED, changing doesn't help
- Guidance is baked into distillation (fixed at 1.0), but Cloudflare allows 3.0
- Short prompts work best: describe transformation, let input image carry details
- Never use negative prompts (model ignores them)
- Prompt structure: subject first, transformation second, style third
"""

import sys
import os
import base64
import time
import requests
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
VENV_SITE = SCRIPT_DIR / ".venv" / "lib"
for p in VENV_SITE.glob("python*/site-packages"):
    sys.path.insert(0, str(p))

from PIL import Image, ImageEnhance
import numpy as np

# ── Config ──────────────────────────────────────────────────────────────────

CF_ACCOUNT_ID = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
CF_API_TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", "")
CF_MODEL = "@cf/black-forest-labs/flux-2-klein-4b"
CF_API_URL = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/ai/run/{CF_MODEL}"

# Short prompt: describe transformation, let input image provide garment details.
STAGING_PROMPT = '''Professional e-commerce product photography of the [GARMENT TYPE], laid completely flat and straightened on a pure white (#FFFFFF) seamless background. This is [EXACT SLEEVE/LENGTH TYPE — e.g. sleeveless / short-sleeve / long-sleeve / cropped / full-length] — do NOT change the sleeve or leg length, do NOT add or remove sleeves, do NOT alter the original cut in any way. Preserve the exact silhouette, neckline/collar, hem shape, and proportions exactly as shown in the original photo. Fabric is smooth and taut with no wrinkles, folds, creases, or draping — as if steamed and pinned flat for a catalog shoot. Preserve exact color, pattern, graphic print, text, stitching, and hardware (buttons, zippers, drawstrings) exactly as in the original — do not invent or omit any design details. Studio lighting, soft even shadows only, sharp focus, high resolution, centered composition. No mannequin, no model, no hangers, no props — just the garment isolated on white.'''

TARGET_SIZE = 1200


def load_env():
    env_path = SCRIPT_DIR / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                os.environ.setdefault(key.strip(), val.strip())

    global CF_ACCOUNT_ID, CF_API_TOKEN, CF_API_URL
    CF_ACCOUNT_ID = os.environ.get("CLOUDFLARE_ACCOUNT_ID", CF_ACCOUNT_ID)
    CF_API_TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", CF_API_TOKEN)
    CF_API_URL = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/ai/run/{CF_MODEL}"


def ai_garment_stage(image_path: str, max_retries: int = 3) -> str:
    """Call Cloudflare Workers AI to clean up the garment."""
    if not CF_ACCOUNT_ID or not CF_API_TOKEN:
        raise RuntimeError("Cloudflare credentials not set. Check .env file.")

    img = Image.open(image_path).convert("RGB")
    w, h = img.size
    if max(w, h) > 512:
        scale = 512 / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    resized_path = str(Path(image_path).parent / f"{Path(image_path).stem}_api.png")
    img.save(resized_path, "PNG")

    headers = {"Authorization": f"Bearer {CF_API_TOKEN}"}

    for attempt in range(max_retries):
        try:
            print(f"  [AI] Attempt {attempt + 1}/{max_retries}...")
            with open(resized_path, "rb") as f:
                files = {"input_image_0": (Path(resized_path).name, f, "image/png")}
                data = {
                    "prompt": STAGING_PROMPT,
                    "width": "1024",
                    "height": "1024",
                    "guidance": "3.0",
                    "steps": "10",
                }
                response = requests.post(CF_API_URL, headers=headers, files=files, data=data, timeout=120)

            if response.status_code != 200:
                print(f"  [AI] HTTP {response.status_code}: {response.text[:200]}")
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
                continue

            result = response.json()
            if not result.get("success"):
                print(f"  [AI] Error: {result.get('errors', [])}")
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
                continue

            img_data = result["result"]["image"]
            if "," in img_data:
                img_data = img_data.split(",", 1)[1]

            img_bytes = base64.b64decode(img_data)
            out_path = str(Path(image_path).parent / f"{Path(image_path).stem}_staged.png")
            with open(out_path, "wb") as f:
                f.write(img_bytes)
            print(f"  [AI] Staged: {out_path}")
            return out_path

        except Exception as e:
            print(f"  [AI] Failed: {e}")
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)

    raise RuntimeError("AI staging failed after all retries")


def post_process(input_path: str, output_path: str):
    """Auto-crop, center on white, sharpen."""
    img = Image.open(input_path).convert("RGB")

    # Auto-crop white borders
    arr = np.array(img)
    is_content = np.any(arr < 245, axis=2)
    rows = np.any(is_content, axis=1)
    cols = np.any(is_content, axis=0)
    if rows.any() and cols.any():
        y1, y2 = np.where(rows)[0][[0, -1]]
        x1, x2 = np.where(cols)[0][[0, -1]]
        pad = 20
        x1, y1 = max(0, x1 - pad), max(0, y1 - pad)
        x2, y2 = min(img.width, x2 + pad), min(img.height, y2 + pad)
        img = img.crop((x1, y1, x2, y2))

    # Center on white 1:1 canvas
    pw, ph = img.size
    canvas_size = int(max(pw, ph) * 1.1)
    canvas = Image.new("RGB", (canvas_size, canvas_size), (255, 255, 255))
    canvas.paste(img, ((canvas_size - pw) // 2, (canvas_size - ph) // 2))

    canvas.thumbnail((TARGET_SIZE, TARGET_SIZE), Image.LANCZOS)

    enhancer = ImageEnhance.Sharpness(canvas)
    canvas = enhancer.enhance(1.3)

    canvas.save(output_path, "PNG", optimize=True)
    print(f"  Saved: {output_path}")


def run_pipeline(input_path: str, output_path: str, keep_intermediates: bool = False):
    if not os.path.exists(input_path):
        print(f"Error: Input file not found: {input_path}")
        sys.exit(1)

    load_env()

    print(f"=== Garment Staging Pipeline v2 ===")
    print(f"Input:  {input_path}")
    print(f"Output: {output_path}")
    print(f"Backend: Cloudflare Workers AI ({CF_MODEL})")
    print(f"Config: guidance=3.0, steps=10")

    # Step 1: AI garment staging (direct FLUX call)
    print("\n[1/2] AI garment staging...")
    try:
        staged_path = ai_garment_stage(input_path)
    except Exception as e:
        print(f"  FAIL: {e}")
        sys.exit(1)

    # Step 2: Post-process
    print("\n[2/2] Post-processing...")
    post_process(staged_path, output_path)

    if not keep_intermediates:
        api_path = str(Path(input_path).parent / f"{Path(input_path).stem}_api.png")
        for p in [staged_path, api_path]:
            if p and os.path.exists(p):
                try:
                    os.remove(p)
                except OSError:
                    pass

    print(f"\n=== Done ===")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python garment-staging.py <input_image> <output_image> [--keep]")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]
    keep = "--keep" in sys.argv

    run_pipeline(input_path, output_path, keep_intermediates=keep)
