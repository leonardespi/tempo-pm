import jsPDF from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';

// ─── Misc helpers ─────────────────────────────────────────────────────────────

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ─── CSS var resolution ───────────────────────────────────────────────────────

export function buildCSSVarMap(): Record<string, string> {
  const cs = getComputedStyle(document.documentElement);
  const keys = [
    '--color-bg',
    '--color-bg-card',
    '--color-bg-muted',
    '--color-text',
    '--color-text-muted',
    '--color-border',
    '--color-accent',
    '--font-body',
    '--font-mono',
  ];
  return Object.fromEntries(keys.map((k) => [k, cs.getPropertyValue(k).trim()]));
}

function resolveVarStr(s: string, vars: Record<string, string | undefined>): string {
  return s.replace(/var\(\s*(--[\w-]+)\s*\)/g, (_, k: string) => vars[k] ?? '');
}

// ─── SVG preparation (inline computed styles, resolve CSS vars) ───────────────

const STYLE_PROPS = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-opacity',
  'opacity',
  'font-size',
  'font-family',
  'font-weight',
  'letter-spacing',
] as const;

export function prepareExportSVG(svgEl: SVGSVGElement): SVGSVGElement {
  const vars = buildCSSVarMap();
  const clone = svgEl.cloneNode(true) as SVGSVGElement;

  function walkPair(orig: Element, cl: Element) {
    // Resolve var() in clone's DOM attributes
    for (const attr of Array.from(cl.attributes)) {
      if (attr.value.includes('var(')) {
        cl.setAttribute(attr.name, resolveVarStr(attr.value, vars));
      }
    }

    // Copy computed property values inline so they survive serialization
    const cs = getComputedStyle(orig);
    const st = (cl as SVGElement).style;
    for (const prop of STYLE_PROPS) {
      const v = cs.getPropertyValue(prop);
      if (v && v !== 'none' && v !== 'normal') st.setProperty(prop, v);
    }

    for (let i = 0; i < orig.children.length && i < cl.children.length; i++) {
      walkPair(orig.children[i], cl.children[i]);
    }
  }

  walkPair(svgEl, clone);
  return clone;
}

// ─── Download helper ──────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

// ─── PNG export ───────────────────────────────────────────────────────────────

export async function exportAsPng(svgEl: SVGSVGElement, filename: string): Promise<void> {
  const prepared = prepareExportSVG(svgEl);

  const w =
    svgEl.width.baseVal.value ||
    svgEl.viewBox.baseVal.width ||
    parseFloat(svgEl.getAttribute('width') ?? '800');
  const h =
    svgEl.height.baseVal.value ||
    svgEl.viewBox.baseVal.height ||
    parseFloat(svgEl.getAttribute('height') ?? '600');
  const SCALE = 2;

  const xml = new XMLSerializer().serializeToString(prepared);
  const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  return new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w * SCALE;
      canvas.height = h * SCALE;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }
      ctx.scale(SCALE, SCALE);
      // White background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(svgUrl);
      canvas.toBlob((png) => {
        if (!png) {
          reject(new Error('Canvas export failed'));
          return;
        }
        triggerDownload(png, filename);
        resolve();
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      reject(new Error('Failed to load SVG for PNG export'));
    };
    img.src = svgUrl;
  });
}

// ─── Single-chart PDF export ──────────────────────────────────────────────────

export async function exportAsPdf(svgEl: SVGSVGElement, filename: string): Promise<void> {
  const prepared = prepareExportSVG(svgEl);

  const w =
    svgEl.width.baseVal.value ||
    svgEl.viewBox.baseVal.width ||
    parseFloat(svgEl.getAttribute('width') ?? '800');
  const h =
    svgEl.height.baseVal.value ||
    svgEl.viewBox.baseVal.height ||
    parseFloat(svgEl.getAttribute('height') ?? '600');

  // svg2pdf requires the element mounted in the DOM
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;top:-9999px;left:-9999px;pointer-events:none;';
  document.body.appendChild(host);
  host.appendChild(prepared);

  try {
    const orientation = w >= h ? 'l' : 'p';
    const pdf = new jsPDF({ orientation, unit: 'pt', format: [w, h] });
    await svg2pdf(prepared, pdf, { x: 0, y: 0, width: w, height: h });
    pdf.save(filename);
  } finally {
    document.body.removeChild(host);
  }
}

// ─── Multi-page PDF export ────────────────────────────────────────────────────

export async function exportAllAsPdf(
  pages: Array<{ title: string; svgEl: SVGSVGElement }>,
  filename: string,
): Promise<void> {
  if (pages.length === 0) return;

  const TITLE_H = 28; // header bar height per page

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;top:-9999px;left:-9999px;pointer-events:none;';
  document.body.appendChild(host);

  try {
    let pdf: jsPDF | null = null;
    const date = todayISO();

    for (const { title, svgEl } of pages) {
      const prepared = prepareExportSVG(svgEl);

      const w =
        svgEl.width.baseVal.value ||
        svgEl.viewBox.baseVal.width ||
        parseFloat(svgEl.getAttribute('width') ?? '1100');
      const h =
        svgEl.height.baseVal.value ||
        svgEl.viewBox.baseVal.height ||
        parseFloat(svgEl.getAttribute('height') ?? '700');

      const pageH = h + TITLE_H;

      if (!pdf) {
        pdf = new jsPDF({ orientation: w >= pageH ? 'l' : 'p', unit: 'pt', format: [w, pageH] });
      } else {
        pdf.addPage([w, pageH], w >= pageH ? 'l' : 'p');
      }

      // Title bar
      pdf.setFillColor(237, 232, 225);
      pdf.rect(0, 0, w, TITLE_H, 'F');
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(61, 53, 48);
      pdf.text(title, 12, 18);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(140, 123, 112);
      pdf.text(date, w - 12, 18, { align: 'right' });

      host.innerHTML = '';
      host.appendChild(prepared);
      await svg2pdf(prepared, pdf, { x: 0, y: TITLE_H, width: w, height: h });
    }

    pdf?.save(filename);
  } finally {
    document.body.removeChild(host);
  }
}

// ─── SVG element builder (used by chart buildExportSVG methods) ────────────────

export function makeSVGEl(tag: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  return el;
}
