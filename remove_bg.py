from PIL import Image

img = Image.open('frontend/public/devxray-logo.png').convert('RGBA')
datas = img.getdata()

newData = []
for item in datas:
    # If the pixel is very dark, make it transparent, but preserve antialiasing
    r, g, b, _ = item
    brightness = max(r, g, b)
    if brightness < 15:
        newData.append((0, 0, 0, 0))
    elif brightness < 60:
        # Scale alpha for smooth edge
        alpha = int((brightness - 15) * (255 / 45))
        newData.append((r, g, b, alpha))
    else:
        newData.append(item)

img.putdata(newData)
img.save('frontend/public/devxray-logo.png', 'PNG')
