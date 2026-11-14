"""Assemble the display PDF from the exact, reviewed slide previews."""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
images = [Image.open(p).convert('RGB') for p in sorted((root / 'preview').glob('slide-*.png'))]
assert len(images) == 10
assert all(im.size == (1920, 1080) for im in images)
images[0].save(root / 'output/Siriva-visual-final.pdf', save_all=True,
               append_images=images[1:], resolution=144,
               title='Siriva: упражнения для речи и памяти',
               author='Shadil Nurmukhammed; Amangeldiev Kaisar')
print('Saved 10 pages at 1920 x 1080 px, 16:9')
