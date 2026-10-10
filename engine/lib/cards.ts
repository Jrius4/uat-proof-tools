import { chromium } from 'playwright';
import type { Browser } from 'playwright';

export type CardRenderer = {
  /** Unit in px used for sizing text: scales with the frame so phones and desktops both read well. */
  unit: number;
  render(html: string, file: string, opts?: { transparent?: boolean }): Promise<void>;
  close(): Promise<void>;
};

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

export async function openCards(width: number, height: number): Promise<CardRenderer> {
  const browser: Browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  // Landscape sizes against a 16:9 frame; portrait phones need relatively larger type because the frame is narrow.
  const unit = Math.round(height > width ? width / 24 : Math.min(width, (height * 16) / 9) / 34);
  return {
    unit,
    async render(html, file, opts = {}) {
      await page.setContent(`<!doctype html><meta charset="utf-8"><style>
        *{box-sizing:border-box;margin:0}
        html,body{width:${width}px;height:${height}px;overflow:hidden;background:${opts.transparent ? 'transparent' : '#0f172a'};
          font-family:-apple-system,"SF Pro Display","Helvetica Neue",Arial,sans-serif;color:#fff}
      </style>${html}`);
      await page.screenshot({ path: file, omitBackground: !!opts.transparent });
    },
    close: () => browser.close(),
  };
}

type Meta = { platform: string; date: string; commit?: string; device?: string };

export function titleCardHtml(u: number, style: 'plain' | 'technical', id: string, title: string, proves: string, meta: Meta): string {
  const tech = style === 'technical';
  return `<div style="height:100%;display:flex;flex-direction:column;justify-content:center;padding:0 ${u * 3}px;
      background:linear-gradient(135deg,#0f172a,#1e3a8a)">
    ${tech ? `<div style="font:600 ${u * 0.9}px ui-monospace,Menlo,monospace;color:#93c5fd;letter-spacing:.06em">${esc(id)}</div>` : ''}
    <div style="font-weight:800;font-size:${u * 2.1}px;line-height:1.12;margin-top:${u * 0.5}px">${esc(title)}</div>
    <div style="font-size:${u * 1.15}px;line-height:1.35;margin-top:${u}px;color:#dbeafe">${esc(proves)}</div>
    ${tech ? `<div style="margin-top:${u * 1.6}px;font:${u * 0.8}px ui-monospace,Menlo,monospace;color:#93c5fd">
      ${esc([meta.platform, meta.device, meta.commit && `commit ${meta.commit}`, meta.date].filter(Boolean).join('  ·  '))}</div>` : ''}
  </div>`;
}

export function endCardHtml(u: number, style: 'plain' | 'technical', passed: boolean, id: string, outro: string, failedItems: string[]): string {
  const bg = passed ? 'linear-gradient(135deg,#052e16,#166534)' : 'linear-gradient(135deg,#450a0a,#991b1b)';
  return `<div style="height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:0 ${u * 3}px;background:${bg}">
    <div style="font-size:${u * 4}px;line-height:1">${passed ? '✓' : '✗'}</div>
    <div style="font-weight:800;font-size:${u * 2.6}px;margin-top:${u * 0.5}px">${passed ? 'PASSED' : 'NOT PASSED'}</div>
    <div style="font-size:${u * 1.1}px;line-height:1.4;margin-top:${u}px;max-width:${u * 24}px">${esc(outro)}</div>
    ${style === 'technical' ? `<div style="margin-top:${u * 1.2}px;font:${u * 0.8}px ui-monospace,Menlo,monospace;opacity:.85">${esc(id)}${failedItems.length ? ' · failed: ' + esc(failedItems.join(', ')) : ''}</div>` : ''}
  </div>`;
}

/** Bottom caption strip with safe margins; transparent elsewhere. */
export function captionHtml(u: number, text: string): string {
  return `<div style="position:absolute;left:0;right:0;bottom:${u * 1.6}px;display:flex;justify-content:center;padding:0 ${u * 1.5}px">
    <div style="background:rgba(0,0,0,.78);border-radius:${u * 0.4}px;padding:${u * 0.45}px ${u * 0.9}px;font-weight:650;
      font-size:${u * 1.05}px;line-height:1.3;text-align:center;text-shadow:0 1px 2px #000">${esc(text)}</div></div>`;
}

/** Top-left step tag used by the QA profile. */
export function stepBadgeHtml(u: number, id: string, label: string): string {
  return `<div style="position:absolute;left:${u * 0.8}px;top:${u * 0.8}px;max-width:${u * 20}px;background:rgba(15,23,42,.85);border-radius:${u * 0.3}px;
    padding:${u * 0.3}px ${u * 0.6}px;font:600 ${u * 0.75}px ui-monospace,Menlo,monospace">
    <span style="color:#93c5fd">${esc(id)}</span> ${esc(label)}</div>`;
}

/** Top-centre banner shown while an expectation is being demonstrated. */
export function checkBannerHtml(u: number, ok: boolean, text: string): string {
  return `<div style="position:absolute;left:0;right:0;top:${u * 1.2}px;display:flex;justify-content:center;padding:0 ${u}px">
    <div style="background:${ok ? 'rgba(22,101,52,.94)' : 'rgba(153,27,27,.94)'};border-radius:${u * 0.5}px;padding:${u * 0.45}px ${u * 1}px;
      font-weight:700;font-size:${u * 1.05}px;line-height:1.3;text-align:center;box-shadow:0 4px 14px rgba(0,0,0,.4)">${ok ? '✓' : '✗'} ${esc(text)}</div></div>`;
}
