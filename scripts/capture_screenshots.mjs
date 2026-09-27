import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

// Target URL: prefers local dev server, falls back to production Vercel
const DEFAULT_LOCAL = 'http://localhost:5174/?lat=31.8000&lon=34.8000&zoom=7.40';
const DEFAULT_PROD = 'https://sea-level-map-seven.vercel.app/?lat=31.8000&lon=34.8000&zoom=7.40';
const targetUrl = process.env.APP_URL || process.argv[2] || DEFAULT_LOCAL;

const SCREENSHOT_DIR = path.resolve('screenshots');

const RESOLUTIONS = [
  { name: 'vertical_1080x1920', width: 1080, height: 1920, label: 'Vertical Monitor (1080x1920)' },
  { name: 'qhd_2560x1440', width: 2560, height: 1440, label: 'QHD / 2K Widescreen (2560x1440)' },
  { name: 'mobile_390x844', width: 390, height: 844, label: 'Mobile Device (390x844)' }
];

async function run() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  console.log(`🚀 Starting Playwright UX/UI screenshot suite`);
  console.log(`🌐 Target URL: ${targetUrl}`);
  console.log(`📁 Output Directory: ${SCREENSHOT_DIR}\n`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-webgl', '--use-gl=swiftshader', '--no-sandbox']
  });

  try {
    for (const res of RESOLUTIONS) {
      console.log(`\n======================================================`);
      console.log(`🖥️  Capturing Resolution: ${res.label}`);
      console.log(`======================================================`);

      const context = await browser.newContext({
        viewport: { width: res.width, height: res.height },
        deviceScaleFactor: 1
      });

      const page = await context.newPage();

      // Collect any page console errors or uncaught exceptions
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          console.warn(`[Browser Console Error] ${msg.text()}`);
        }
      });

      console.log(`Navigating to ${targetUrl}...`);
      try {
        await page.goto(targetUrl, { waitUntil: 'load', timeout: 30000 });
      } catch (err) {
        console.warn(`Load warning: ${err.message}`);
      }

      // Wait for MapLibre canvas
      console.log(`Waiting for MapLibre canvas...`);
      await page.waitForSelector('canvas.maplibregl-canvas', { timeout: 15000 });
      // Extra pause to ensure tiles and labels render
      await page.waitForTimeout(3000);

      // Check overflow & scroll dimensions
      const scrollMetrics = await page.evaluate(() => {
        return {
          windowInnerWidth: window.innerWidth,
          windowInnerHeight: window.innerHeight,
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          bodyScrollWidth: document.body.scrollWidth,
          bodyScrollHeight: document.body.scrollHeight,
          hasHorizontalScroll: document.documentElement.scrollWidth > window.innerWidth,
          hasVerticalScroll: document.documentElement.scrollHeight > window.innerHeight
        };
      });
      console.log(`📏 Viewport & Scroll Metrics for ${res.name}:`, scrollMetrics);

      // --- STATE 1: Default View ---
      const fileDefault = path.join(SCREENSHOT_DIR, `${res.name}_01_default.png`);
      await page.screenshot({ path: fileDefault, fullPage: false });
      console.log(`📸 [1/4] Saved Default View: ${fileDefault}`);

      // --- STATE 2: Interaction with Controls (Adjust Sea Level to +10m and open Landmarks tab) ---
      console.log(`Interacting: Selecting +10m preset and Landmarks tab...`);
      
      // Try clicking +10m preset button
      const preset10m = page.locator('button:has-text("+10m")').first();
      if (await preset10m.isVisible({ timeout: 2000 }).catch(() => false)) {
        await preset10m.click();
        console.log(`Clicked '+10m' preset button.`);
      } else {
        // Fallback: move range slider
        const slider = page.locator('input[type="range"]').first();
        if (await slider.isVisible()) {
          await slider.fill('10');
          await slider.dispatchEvent('input');
          await slider.dispatchEvent('change');
          console.log(`Adjusted slider to 10m.`);
        }
      }

      // Switch tab in unified panel to 'Impact'
      const impactTab = page.locator('button:has-text("Impact")').first();
      if (await impactTab.isVisible({ timeout: 1500 }).catch(() => false)) {
        await impactTab.click();
        console.log(`Switched to 'Impact' tab in unified panel.`);
      }

      // Allow visual animation / tile re-color to settle
      await page.waitForTimeout(2000);

      const fileInteraction = path.join(SCREENSHOT_DIR, `${res.name}_02_interaction.png`);
      await page.screenshot({ path: fileInteraction, fullPage: false });
      console.log(`📸 [2/4] Saved Interaction View (+10m & Landmarks): ${fileInteraction}`);

      // --- STATE 3: Zoom In (Close-up view of coastline & flooded zones) ---
      console.log(`Zooming in (+3 clicks)...`);
      const zoomInBtn = page.locator('.maplibregl-ctrl-zoom-in');
      if (await zoomInBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await zoomInBtn.click();
        await page.waitForTimeout(600);
        await zoomInBtn.click();
        await page.waitForTimeout(600);
        await zoomInBtn.click();
      } else {
        // Mouse wheel zoom
        await page.mouse.wheel(0, -600);
      }
      await page.waitForTimeout(2500);

      const fileZoomIn = path.join(SCREENSHOT_DIR, `${res.name}_03_zoom_in.png`);
      await page.screenshot({ path: fileZoomIn, fullPage: false });
      console.log(`📸 [3/4] Saved Zoom In View: ${fileZoomIn}`);

      // --- STATE 4: Zoom Out (Wide regional/global perspective) ---
      console.log(`Zooming out (-5 clicks)...`);
      const zoomOutBtn = page.locator('.maplibregl-ctrl-zoom-out');
      if (await zoomOutBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        for (let i = 0; i < 5; i++) {
          await zoomOutBtn.click();
          await page.waitForTimeout(400);
        }
      } else {
        await page.mouse.wheel(0, 1000);
      }
      await page.waitForTimeout(2500);

      const fileZoomOut = path.join(SCREENSHOT_DIR, `${res.name}_04_zoom_out.png`);
      await page.screenshot({ path: fileZoomOut, fullPage: false });
      console.log(`📸 [4/4] Saved Zoom Out View: ${fileZoomOut}`);

      await context.close();
    }

    console.log(`\n🎉 All screenshots captured successfully in ${SCREENSHOT_DIR}!`);
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
