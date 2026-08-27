import sys
from PIL import Image, ImageEnhance, ImageFilter, ImageOps
import numpy as np

def process_product_photo(input_path: str, output_path: str, target_size: int = 1200):
    """
    Full Alta-style product photo pipeline:
    1. Remove background (via ClearBackdrop API)
    2. Find product bounds and auto-crop
    3. Center product on white background
    4. Fix lighting (auto-levels, contrast, brightness)
    5. Sharpen details
    6. Output clean product shot
    """
    img = Image.open(input_path).convert("RGBA")
    
    # Step 1: Find the product (non-transparent pixels)
    alpha = img.split()[3]
    bbox = alpha.getbbox()
    
    if bbox is None:
        # No transparent pixels = no background removed yet
        # Try to detect and remove background manually
        img = remove_background_manual(img)
        alpha = img.split()[3]
        bbox = alpha.getbbox()
    
    if bbox is None:
        raise ValueError("Could not detect product in image")
    
    # Step 2: Auto-crop to product bounds with padding
    padding = 40
    bbox = (
        max(0, bbox[0] - padding),
        max(0, bbox[1] - padding),
        min(img.width, bbox[2] + padding),
        min(img.height, bbox[3] + padding)
    )
    img = img.crop(bbox)
    
    # Step 3: Center on white background (1:1 ratio for clean product shots)
    product_w, product_h = img.size
    max_dim = max(product_w, product_h)
    canvas_size = int(max_dim * 1.15)  # 15% padding around product
    
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (255, 255, 255, 255))
    paste_x = (canvas_size - product_w) // 2
    paste_y = (canvas_size - product_h) // 2
    canvas.paste(img, (paste_x, paste_y), img)
    
    # Step 4: Fix lighting and colors
    canvas = fix_lighting(canvas)
    
    # Step 5: Convert to RGB (no transparency) for final output
    final = Image.new("RGB", canvas.size, (255, 255, 255))
    final.paste(canvas, mask=canvas.split()[3])
    
    # Step 6: Resize to target while maintaining quality
    final.thumbnail((target_size, target_size), Image.LANCZOS)
    
    # Step 7: Sharpen
    final = final.filter(ImageFilter.SHARPEN)
    
    # Step 8: Final quality pass
    enhancer = ImageEnhance.Contrast(final)
    final = enhancer.enhance(1.05)  # Very subtle contrast boost
    
    final.save(output_path, "PNG", optimize=True)
    return output_path


def remove_background_manual(img: Image.Image) -> Image.Image:
    """Simple background removal for photos with uniform-ish backgrounds."""
    img_array = np.array(img.convert("RGB"))
    
    # Sample corners to estimate background color
    h, w = img_array.shape[:2]
    corners = [
        img_array[0, 0],
        img_array[0, w-1],
        img_array[h-1, 0],
        img_array[h-1, w-1],
    ]
    bg_color = np.mean(corners, axis=0).astype(np.uint8)
    
    # Create mask: pixels close to background color become transparent
    diff = np.sqrt(np.sum((img_array.astype(float) - bg_color.astype(float)) ** 2, axis=2))
    threshold = 60
    mask = (diff > threshold).astype(np.uint8) * 255
    
    # Clean up mask with morphological operations
    mask_img = Image.fromarray(mask)
    mask_img = mask_img.filter(ImageFilter.MinFilter(3))  # Remove noise
    mask_img = mask_img.filter(ImageFilter.MaxFilter(5))  # Fill holes
    mask_img = mask_img.filter(ImageFilter.GaussianBlur(2))  # Smooth edges
    
    # Apply mask
    result = img.copy()
    result.putalpha(mask_img)
    return result


def fix_lighting(img: Image.Image) -> Image.Image:
    """Fix lighting, contrast, and color balance."""
    # Auto-levels: stretch histogram to full range
    r, g, b, a = img.split()
    r = ImageOps.autocontrast(r, cutoff=1)
    g = ImageOps.autocontrast(g, cutoff=1)
    b = ImageOps.autocontrast(b, cutoff=1)
    img = Image.merge("RGBA", (r, g, b, a))
    
    # Brightness: slightly brighten to make product pop
    enhancer = ImageEnhance.Brightness(img)
    img = enhancer.enhance(1.08)
    
    # Contrast: subtle boost
    enhancer = ImageEnhance.Contrast(img)
    img = enhancer.enhance(1.12)
    
    # Color saturation: boost slightly for vibrant product colors
    enhancer = ImageEnhance.Color(img)
    img = enhancer.enhance(1.10)
    
    return img


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python product-pipeline.py <input> <output>")
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    
    result = process_product_photo(input_path, output_path)
    print(f"Done: {result}")
