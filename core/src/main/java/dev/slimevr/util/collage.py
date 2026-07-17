import cv2
import os
import sys
from PIL import Image, ImageDraw
import math

if len(sys.argv) < 2:
    print("Error: No video path provided.")
    sys.exit(1)

video_path = sys.argv[1]
if not os.path.exists(video_path):
    print(f"Error: Video file does not exist at {video_path}")
    sys.exit(1)

base_dir = os.path.dirname(video_path)
base_name = os.path.splitext(os.path.basename(video_path))[0]
output = os.path.join(base_dir, f"{base_name}.png")

print(f"Opening video {video_path}...")

# ==========================================
# PASS 1: Manually count the ACTUAL frames
# ==========================================
cap = cv2.VideoCapture(video_path)
if not cap.isOpened():
    print(f"Error: Could not open video '{video_path}'. (Check video codec or file corruption)")
    sys.exit(1)

actual_total_frames = 0
while True:
    ret, _ = cap.read()
    if not ret:
        break
    actual_total_frames += 1
cap.release()

print(f"True frame count: {actual_total_frames}")

if actual_total_frames < 16:
    print("Error: Video actually has fewer than 16 readable frames.")
    sys.exit(1)

frame_indices = [int(i * (actual_total_frames - 1) / 15) for i in range(16)]
target_frames = set(frame_indices)

# ==========================================
# PASS 2: Extract the targeted frames
# ==========================================
cap = cv2.VideoCapture(video_path)
extracted_frames = {}
current_frame = 0

while True:
    ret, frame = cap.read()
    if not ret:
        break
    
    if current_frame in target_frames:
        for i, target_idx in enumerate(frame_indices):
            if target_idx == current_frame and i not in extracted_frames:
                cv2.putText(frame, str(i + 1), (40, 80), cv2.FONT_HERSHEY_SIMPLEX, 2.5, (0, 255, 255), 6)
                
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                pil_img = Image.fromarray(frame_rgb)
                extracted_frames[i] = pil_img
        
    current_frame += 1
    if len(extracted_frames) == 16:
        break
cap.release()

imgs = []
for i in range(16):
    if i in extracted_frames:
        imgs.append(extracted_frames[i])
    else:
        w, h = imgs[0].size if imgs else (100, 100)
        imgs.append(Image.new("RGB", (w, h), "black"))

# ==========================================
# Build the Collage
# ==========================================
w, h = imgs[0].size
rows = cols = 4
layout = [[0, 1, 2, 3], [7, 6, 5, 4], [8, 9, 10, 11], [15, 14, 13, 12]]

collage = Image.new("RGB", (cols * w, rows * h), "white")
draw = ImageDraw.Draw(collage)
centers = {}

for r in range(rows):
    for c in range(cols):
        idx = layout[r][c]
        x, y = c * w, r * h
        collage.paste(imgs[idx], (x, y))
        centers[idx] = (x + w // 2, y + h // 2)
        draw.rectangle([x, y, x + w - 1, y + h - 1], outline="black", width=3)

def draw_short_arrow(draw, start, end, color="red", width=7, head=45, length_h=300, length_v=200):
    x1, y1 = start
    x2, y2 = end
    dx = x2 - x1
    dy = y2 - y1
    L = math.hypot(dx, dy)
    if L == 0: return
    
    ux, uy = dx / L, dy / L
    mx, my = (x1 + x2) / 2, (y1 + y2) / 2
    
    # Check if the arrow is horizontal or vertical
    is_horizontal = abs(dx) > abs(dy)
    arrow_length = length_h if is_horizontal else length_v
    
    sx, sy = mx - ux * (arrow_length / 2), my - uy * (arrow_length / 2)
    ex, ey = mx + ux * (arrow_length / 2), my + uy * (arrow_length / 2)
    
    draw.line((sx, sy, ex, ey), fill=color, width=width)
    left = (ex - ux * head - uy * head / 2, ey - uy * head + ux * head / 2)
    right = (ex - ux * head + uy * head / 2, ey - uy * head - ux * head / 2)
    draw.polygon([(ex, ey), left, right], fill=color)

for i in range(15):
    draw_short_arrow(draw, centers[i], centers[i + 1])

collage.save(output)
print(f"Saved {output} successfully!")