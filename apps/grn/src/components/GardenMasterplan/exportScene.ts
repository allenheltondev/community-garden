// Export the masterplan SVG as a downloadable SVG or PNG. The scene is
// styled by stylesheet classes (mp-label, mp-el, …), so a straight
// serialization would lose all text and shading styles — we inline the
// computed styles that matter onto a clone first.

const STYLE_PROPERTIES = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'letter-spacing',
  'text-anchor',
  'text-transform',
  'paint-order',
  'filter',
] as const;

export function inlineSceneStyles(source: SVGSVGElement): SVGSVGElement {
  const clone = source.cloneNode(true) as SVGSVGElement;
  const sourceNodes = source.querySelectorAll<SVGElement>('*');
  const cloneNodes = clone.querySelectorAll<SVGElement>('*');
  sourceNodes.forEach((node, idx) => {
    const target = cloneNodes[idx];
    if (!target) return;
    const computed = window.getComputedStyle(node);
    for (const property of STYLE_PROPERTIES) {
      const value = computed.getPropertyValue(property);
      if (value && value !== 'none' && value !== 'normal') {
        target.style.setProperty(property, value);
      }
    }
    // Interaction styling (hover lift, dim) must not bake into the file.
    target.removeAttribute('tabindex');
  });
  clone.removeAttribute('class');
  return clone;
}

export function serializeScene(source: SVGSVGElement): string {
  const clone = inlineSceneStyles(source);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return new XMLSerializer().serializeToString(clone);
}

export function exportFilename(extension: 'svg' | 'png', now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `garden-masterplan-${y}-${m}-${d}.${extension}`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadSceneSvg(source: SVGSVGElement): void {
  const blob = new Blob([serializeScene(source)], { type: 'image/svg+xml' });
  downloadBlob(blob, exportFilename('svg'));
}

// Rasterize at 2x for crisp prints. The SVG data URL keeps everything
// same-origin so the canvas stays untainted.
export function downloadScenePng(source: SVGSVGElement, scale = 2): Promise<void> {
  return new Promise((resolve, reject) => {
    const width = source.width.baseVal.value || source.clientWidth;
    const height = source.height.baseVal.value || source.clientHeight;
    const svgText = serializeScene(source);
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;

    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }
      // Paper-white backdrop: the scene itself is transparent outside the
      // lawn blob, which prints poorly.
      context.fillStyle = '#fdfaf1';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('PNG encoding failed'));
          return;
        }
        downloadBlob(blob, exportFilename('png'));
        resolve();
      }, 'image/png');
    };
    image.onerror = () => reject(new Error('Could not rasterize the masterplan'));
    image.src = url;
  });
}
