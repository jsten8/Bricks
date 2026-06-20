import { test, expect, Page } from '@playwright/test';
import path from 'path';

const FILE = 'file://' + path.resolve(__dirname, '../bricks.html');

async function openFresh(page: Page) {
  await page.goto(FILE);
  await page.evaluate(() => {
    localStorage.removeItem('bricks_log_v1');
    localStorage.removeItem('bricks_projects_v1');
    localStorage.removeItem('bricks_last_export');
    localStorage.removeItem('bricks_drive_file_id');
    localStorage.removeItem('nw_checkins_v1');
    localStorage.removeItem('nw_calcs_v1');
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
}

// ─────────────────────────────────────────────
// BRICKS — entry shape
// ─────────────────────────────────────────────
test.describe('Bricks — entry data structure', () => {

  test('logged entry has all required fields with correct types', async ({ page }) => {
    await openFresh(page);

    await page.fill('#input-date', '2026-06-20');
    await page.selectOption('#input-project', { index: 0 });
    await page.fill('#input-bricks', '2');
    await page.fill('#input-note', 'Integrity check');
    await page.click('.btn-log');

    const raw = await page.evaluate(() => localStorage.getItem('bricks_log_v1'));
    expect(raw).not.toBeNull();

    const entries = JSON.parse(raw!);
    expect(Array.isArray(entries)).toBe(true);
    expect(entries).toHaveLength(1);

    const e = entries[0];
    // Required fields exist
    expect(e).toHaveProperty('id');
    expect(e).toHaveProperty('date');
    expect(e).toHaveProperty('project');
    expect(e).toHaveProperty('bricks');
    expect(e).toHaveProperty('note');

    // Correct types
    expect(typeof e.id).toBe('number');
    expect(typeof e.date).toBe('string');
    expect(typeof e.project).toBe('string');
    expect(typeof e.bricks).toBe('number');
    expect(typeof e.note).toBe('string');

    // Correct values
    expect(e.date).toBe('2026-06-20');
    expect(e.bricks).toBe(2);
    expect(e.note).toBe('Integrity check');

    // Date format: YYYY-MM-DD
    expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // id is a positive integer (timestamp)
    expect(e.id).toBeGreaterThan(0);
    expect(Number.isInteger(e.id)).toBe(true);

    // No extra unexpected fields that could indicate data mutation
    const allowedKeys = ['id', 'date', 'project', 'bricks', 'note'];
    const actualKeys = Object.keys(e);
    for (const key of actualKeys) {
      expect(allowedKeys).toContain(key);
    }
  });

  test('multiple entries are stored in reverse-chronological order (newest first)', async ({ page }) => {
    await openFresh(page);

    await page.fill('#input-date', '2026-06-01');
    await page.fill('#input-bricks', '1');
    await page.click('.btn-log');

    await page.fill('#input-date', '2026-06-15');
    await page.fill('#input-bricks', '2');
    await page.click('.btn-log');

    await page.fill('#input-date', '2026-06-20');
    await page.fill('#input-bricks', '3');
    await page.click('.btn-log');

    const raw = await page.evaluate(() => localStorage.getItem('bricks_log_v1'));
    const entries = JSON.parse(raw!);
    expect(entries).toHaveLength(3);

    // Newest first
    expect(entries[0].date).toBe('2026-06-20');
    expect(entries[1].date).toBe('2026-06-15');
    expect(entries[2].date).toBe('2026-06-01');
  });

  test('each entry has a unique id', async ({ page }) => {
    await openFresh(page);

    for (let i = 0; i < 3; i++) {
      await page.fill('#input-date', '2026-06-20');
      await page.fill('#input-bricks', '1');
      await page.click('.btn-log');
    }

    const raw = await page.evaluate(() => localStorage.getItem('bricks_log_v1'));
    const entries = JSON.parse(raw!);
    const ids = entries.map((e: any) => e.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test('edit preserves all fields and only changes the edited ones', async ({ page }) => {
    await openFresh(page);

    await page.fill('#input-date', '2026-06-20');
    await page.fill('#input-bricks', '1');
    await page.fill('#input-note', 'Original note');
    await page.click('.btn-log');

    const rawBefore = await page.evaluate(() => localStorage.getItem('bricks_log_v1'));
    const before = JSON.parse(rawBefore!)[0];
    const originalId = before.id;

    // Edit — change only bricks
    await page.click('.btn-edit');
    await page.fill(`#edit-bricks-${originalId}`, '4');
    await page.click('.btn-save');

    const rawAfter = await page.evaluate(() => localStorage.getItem('bricks_log_v1'));
    const after = JSON.parse(rawAfter!)[0];

    // id must not change
    expect(after.id).toBe(originalId);
    // date must not change
    expect(after.date).toBe('2026-06-20');
    // note must not change
    expect(after.note).toBe('Original note');
    // bricks updated
    expect(after.bricks).toBe(4);
    // project must not change
    expect(after.project).toBe(before.project);
  });

  test('delete removes exactly that entry and leaves others intact', async ({ page }) => {
    await openFresh(page);

    await page.fill('#input-date', '2026-06-01'); await page.fill('#input-bricks', '1'); await page.fill('#input-note', 'Keep A'); await page.click('.btn-log');
    await page.fill('#input-date', '2026-06-10'); await page.fill('#input-bricks', '2'); await page.fill('#input-note', 'Delete me'); await page.click('.btn-log');
    await page.fill('#input-date', '2026-06-20'); await page.fill('#input-bricks', '3'); await page.fill('#input-note', 'Keep B'); await page.click('.btn-log');

    const rawBefore = await page.evaluate(() => localStorage.getItem('bricks_log_v1'));
    const before = JSON.parse(rawBefore!);
    const toDelete = before.find((e: any) => e.note === 'Delete me');

    // Delete the middle entry (it's first in DOM since newest-first, actually it's second)
    const deleteButtons = page.locator('.btn-delete');
    await deleteButtons.nth(1).click(); // index 1 = middle entry in newest-first order

    const rawAfter = await page.evaluate(() => localStorage.getItem('bricks_log_v1'));
    const after = JSON.parse(rawAfter!);

    expect(after).toHaveLength(2);
    expect(after.some((e: any) => e.id === toDelete.id)).toBe(false);
    expect(after.find((e: any) => e.note === 'Keep A')).toBeTruthy();
    expect(after.find((e: any) => e.note === 'Keep B')).toBeTruthy();
  });

  test('bricks value stored as number, not string', async ({ page }) => {
    await openFresh(page);

    await page.fill('#input-date', '2026-06-20');
    await page.fill('#input-bricks', '2.5');
    await page.click('.btn-log');

    const raw = await page.evaluate(() => localStorage.getItem('bricks_log_v1'));
    const entries = JSON.parse(raw!);
    expect(typeof entries[0].bricks).toBe('number');
    expect(entries[0].bricks).toBe(2.5);
  });

  test('note defaults to empty string (not null or undefined) when omitted', async ({ page }) => {
    await openFresh(page);

    await page.fill('#input-date', '2026-06-20');
    await page.fill('#input-bricks', '1');
    // Intentionally leave note empty
    await page.click('.btn-log');

    const raw = await page.evaluate(() => localStorage.getItem('bricks_log_v1'));
    const entries = JSON.parse(raw!);
    expect(entries[0].note).toBeDefined();
    expect(entries[0].note).not.toBeNull();
    expect(typeof entries[0].note).toBe('string');
  });

});

// ─────────────────────────────────────────────
// BRICKS — projects structure
// ─────────────────────────────────────────────
test.describe('Bricks — projects data structure', () => {

  test('projects stored as object with color and bg per project', async ({ page }) => {
    await openFresh(page);

    // Add a custom project to trigger a save
    await page.click('.btn-manage-toggle');
    await page.fill('#new-project-name', 'Test Project');
    await page.click('.manage-projects-panel .btn-log');

    const raw = await page.evaluate(() => localStorage.getItem('bricks_projects_v1'));
    expect(raw).not.toBeNull();
    const projects = JSON.parse(raw!);

    // Is a plain object (not array)
    expect(typeof projects).toBe('object');
    expect(Array.isArray(projects)).toBe(false);

    // Each entry has color and bg
    for (const [name, cfg] of Object.entries(projects) as [string, any][]) {
      expect(typeof name).toBe('string');
      expect(cfg).toHaveProperty('color');
      expect(cfg).toHaveProperty('bg');
      expect(typeof cfg.color).toBe('string');
      expect(typeof cfg.bg).toBe('string');
      // Colors are valid hex
      expect(cfg.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(cfg.bg).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }

    // Custom project is in there
    expect(projects).toHaveProperty('Test Project');
  });

  test('deleting a project removes it from storage without affecting others', async ({ page }) => {
    await openFresh(page);

    await page.click('.btn-manage-toggle');
    await page.fill('#new-project-name', 'To Delete');
    await page.click('.manage-projects-panel .btn-log');
    await page.fill('#new-project-name', 'To Keep');
    await page.click('.manage-projects-panel .btn-log');

    const rawBefore = await page.evaluate(() => localStorage.getItem('bricks_projects_v1'));
    const before = JSON.parse(rawBefore!);
    expect(before).toHaveProperty('To Delete');
    expect(before).toHaveProperty('To Keep');

    // Delete "To Delete"
    const items = page.locator('#project-list .project-list-item');
    const count = await items.count();
    for (let i = 0; i < count; i++) {
      const text = await items.nth(i).textContent();
      if (text?.includes('To Delete')) {
        await items.nth(i).locator('.btn-delete-project').click();
        break;
      }
    }

    const rawAfter = await page.evaluate(() => localStorage.getItem('bricks_projects_v1'));
    const after = JSON.parse(rawAfter!);
    expect(after).not.toHaveProperty('To Delete');
    expect(after).toHaveProperty('To Keep');
  });

});

// ─────────────────────────────────────────────
// BRICKS — survive reload with real data
// ─────────────────────────────────────────────
test.describe('Bricks — data survives reload', () => {

  test('seeded entries load correctly after reload', async ({ page }) => {
    await openFresh(page);

    // Seed a known payload directly into localStorage — simulates a returning user
    const seedData = [
      { id: 1000001, date: '2026-06-01', project: 'CVET Career', bricks: 3, note: 'Deep focus block' },
      { id: 1000002, date: '2026-06-10', project: 'Building My Body', bricks: 1.5, note: 'Morning workout planning' },
      { id: 1000003, date: '2026-06-20', project: 'CVET Career', bricks: 2, note: '' },
    ];
    await page.evaluate((data) => {
      localStorage.setItem('bricks_log_v1', JSON.stringify(data));
    }, seedData);

    await page.reload();
    await page.waitForLoadState('networkidle');

    // All three entries visible in table
    await expect(page.locator('#log-body')).toContainText('Deep focus block');
    await expect(page.locator('#log-body')).toContainText('Morning workout planning');
    await expect(page.locator('#log-body')).toContainText('2026-06-01');
    await expect(page.locator('#log-body')).toContainText('2026-06-10');
    await expect(page.locator('#log-body')).toContainText('2026-06-20');

    // Stats correct (3 + 1.5 + 2 = 6.5)
    await expect(page.locator('#stat-total')).toHaveText('6.5');

    // Data in storage is unchanged (not mutated on load)
    const raw = await page.evaluate(() => localStorage.getItem('bricks_log_v1'));
    const loaded = JSON.parse(raw!);
    expect(loaded).toHaveLength(3);
    expect(loaded[0].id).toBe(1000001);
    expect(loaded[1].id).toBe(1000002);
    expect(loaded[2].id).toBe(1000003);
  });

  test('seeded projects load correctly after reload', async ({ page }) => {
    await openFresh(page);

    const seedProjects = {
      'My Project A': { color: '#8B9E7A', bg: '#F0F4ED' },
      'My Project B': { color: '#C4956A', bg: '#FAF1E8' },
    };
    await page.evaluate((data) => {
      localStorage.setItem('bricks_projects_v1', JSON.stringify(data));
    }, seedProjects);

    await page.reload();
    await page.waitForLoadState('networkidle');

    // Projects appear in dropdown
    const options = page.locator('#input-project option');
    await expect(options.filter({ hasText: 'My Project A' })).toHaveCount(1);
    await expect(options.filter({ hasText: 'My Project B' })).toHaveCount(1);

    // Storage unchanged
    const raw = await page.evaluate(() => localStorage.getItem('bricks_projects_v1'));
    const loaded = JSON.parse(raw!);
    expect(loaded).toHaveProperty('My Project A');
    expect(loaded['My Project A'].color).toBe('#8B9E7A');
  });

  test('loading then logging a new entry does not corrupt existing entries', async ({ page }) => {
    await openFresh(page);

    const seed = [
      { id: 9000001, date: '2026-05-01', project: 'CVET Career', bricks: 4, note: 'Existing entry' },
    ];
    await page.evaluate((data) => {
      localStorage.setItem('bricks_log_v1', JSON.stringify(data));
    }, seed);

    await page.reload();
    await page.waitForLoadState('networkidle');

    // Log a new entry
    await page.fill('#input-date', '2026-06-20');
    await page.fill('#input-bricks', '2');
    await page.fill('#input-note', 'New entry');
    await page.click('.btn-log');

    const raw = await page.evaluate(() => localStorage.getItem('bricks_log_v1'));
    const entries = JSON.parse(raw!);

    expect(entries).toHaveLength(2);

    // Original entry untouched
    const original = entries.find((e: any) => e.id === 9000001);
    expect(original).toBeTruthy();
    expect(original.date).toBe('2026-05-01');
    expect(original.bricks).toBe(4);
    expect(original.note).toBe('Existing entry');

    // New entry present
    const newEntry = entries.find((e: any) => e.note === 'New entry');
    expect(newEntry).toBeTruthy();
    expect(newEntry.bricks).toBe(2);
  });

});

// ─────────────────────────────────────────────
// NET WORTH — check-in data structure
// ─────────────────────────────────────────────
test.describe('Net Worth — check-in data structure', () => {

  async function openNetWorth(page: Page) {
    await openFresh(page);
    await page.click('#nav-networth');
    await page.waitForTimeout(300);
  }

  test('saved check-in has all required top-level fields with correct types', async ({ page }) => {
    await openNetWorth(page);

    // Fill some values
    await page.fill('#nwval-shares', '10000');
    await page.fill('#nwval-property', '248333');
    await page.fill('#nwval-mortgage', '186000');
    await page.fill('#nw-overall-commentary', 'First check-in test');
    await page.click('button.btn-checkin');

    const raw = await page.evaluate(() => localStorage.getItem('nw_checkins_v1'));
    expect(raw).not.toBeNull();
    const checkins = JSON.parse(raw!);
    expect(Array.isArray(checkins)).toBe(true);
    expect(checkins).toHaveLength(1);

    const c = checkins[0];

    // Required top-level fields
    expect(c).toHaveProperty('id');
    expect(c).toHaveProperty('date');
    expect(c).toHaveProperty('label');
    expect(c).toHaveProperty('nw');
    expect(c).toHaveProperty('nwExSuper');
    expect(c).toHaveProperty('commentary');
    expect(c).toHaveProperty('assets');
    expect(c).toHaveProperty('liabs');

    // Types
    expect(typeof c.id).toBe('number');
    expect(typeof c.date).toBe('string');
    expect(typeof c.label).toBe('string');
    expect(typeof c.nw).toBe('number');
    expect(typeof c.nwExSuper).toBe('number');
    expect(typeof c.commentary).toBe('string');
    expect(typeof c.assets).toBe('object');
    expect(typeof c.liabs).toBe('object');

    // Date format
    expect(c.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('assets object has all required keys with numeric values', async ({ page }) => {
    await openNetWorth(page);

    await page.fill('#nwval-shares', '8912');
    await page.fill('#nwval-property', '248333');
    await page.fill('#nwval-cashEm', '1630');
    await page.fill('#nwval-cashOff', '8000');
    await page.fill('#nwval-super', '119358');
    await page.click('button.btn-checkin');

    const raw = await page.evaluate(() => localStorage.getItem('nw_checkins_v1'));
    const checkins = JSON.parse(raw!);
    const assets = checkins[0].assets;

    const requiredAssetKeys = ['shares', 'property', 'cashEm', 'cashOff', 'super'];
    for (const key of requiredAssetKeys) {
      expect(assets).toHaveProperty(key);
      expect(typeof assets[key]).toBe('number');
    }

    expect(assets.shares).toBe(8912);
    expect(assets.property).toBe(248333);
    expect(assets.cashEm).toBe(1630);
    expect(assets.cashOff).toBe(8000);
    expect(assets.super).toBe(119358);
  });

  test('liabilities object has all required keys with numeric values', async ({ page }) => {
    await openNetWorth(page);

    await page.fill('#nwval-mortgage', '186226');
    await page.fill('#nwval-hecs', '18582');
    await page.fill('#nwval-lucas', '16655');
    await page.click('button.btn-checkin');

    const raw = await page.evaluate(() => localStorage.getItem('nw_checkins_v1'));
    const checkins = JSON.parse(raw!);
    const liabs = checkins[0].liabs;

    const requiredLiabKeys = ['mortgage', 'hecs', 'lucas'];
    for (const key of requiredLiabKeys) {
      expect(liabs).toHaveProperty(key);
      expect(typeof liabs[key]).toBe('number');
    }

    expect(liabs.mortgage).toBe(186226);
    expect(liabs.hecs).toBe(18582);
    expect(liabs.lucas).toBe(16655);
  });

  test('nw is calculated correctly as assets minus liabilities', async ({ page }) => {
    await openNetWorth(page);

    await page.fill('#nwval-shares', '10000');
    await page.fill('#nwval-property', '200000');
    await page.fill('#nwval-cashEm', '5000');
    await page.fill('#nwval-cashOff', '0');
    await page.fill('#nwval-super', '50000');
    await page.fill('#nwval-mortgage', '150000');
    await page.fill('#nwval-hecs', '20000');
    await page.fill('#nwval-lucas', '5000');
    await page.click('button.btn-checkin');

    const raw = await page.evaluate(() => localStorage.getItem('nw_checkins_v1'));
    const c = JSON.parse(raw!)[0];

    // totalAssets = 10000 + 200000 + 5000 + 0 + 50000 = 265000
    // totalLiabs  = 150000 + 20000 + 5000 = 175000
    // nw = 265000 - 175000 = 90000
    expect(c.nw).toBe(90000);

    // nwExSuper = nw - super = 90000 - 50000 = 40000
    expect(c.nwExSuper).toBe(40000);
  });

  test('saving twice on the same date replaces, not duplicates, the check-in', async ({ page }) => {
    await openNetWorth(page);

    await page.fill('#nwval-shares', '10000');
    await page.click('button.btn-checkin');

    await page.fill('#nwval-shares', '12000');
    await page.click('button.btn-checkin');

    const raw = await page.evaluate(() => localStorage.getItem('nw_checkins_v1'));
    const checkins = JSON.parse(raw!);

    // Should be 1, not 2
    expect(checkins).toHaveLength(1);
    expect(checkins[0].assets.shares).toBe(12000);
  });

  test('check-ins stored newest-first', async ({ page }) => {
    await openNetWorth(page);

    // Seed two check-ins directly
    const seed = [
      { id: 2000002, date: '2026-06-20', label: 'Jun 2026', nw: 164770, nwExSuper: 45412, commentary: '', assets: { shares: 8912, property: 248333, cashEm: 1630, cashOff: 8000, super: 119358 }, liabs: { mortgage: 186226, hecs: 18582, lucas: 16655 }, assetCommentary: {}, liabCommentary: {} },
      { id: 2000001, date: '2026-04-15', label: 'Apr 2026', nw: 145621, nwExSuper: 26264, commentary: '', assets: { shares: 7540, property: 248333, cashEm: 4618, cashOff: 0, super: 119358 }, liabs: { mortgage: 198415, hecs: 19557, lucas: 16255 }, assetCommentary: {}, liabCommentary: {} },
    ];
    await page.evaluate((data) => {
      localStorage.setItem('nw_checkins_v1', JSON.stringify(data));
    }, seed);

    await page.reload();
    await page.waitForLoadState('networkidle');

    const raw = await page.evaluate(() => localStorage.getItem('nw_checkins_v1'));
    const checkins = JSON.parse(raw!);
    expect(checkins[0].date).toBe('2026-06-20');
    expect(checkins[1].date).toBe('2026-04-15');
  });

  test('seeded check-in data loads without corruption', async ({ page }) => {
    await openFresh(page);

    const seed = [
      {
        id: 3000001,
        date: '2026-06-20',
        label: 'Jun 2026',
        nw: 164770,
        nwExSuper: 45412,
        commentary: 'Test commentary',
        assets: { shares: 8912, property: 248333, cashEm: 1630, cashOff: 8000, super: 119358 },
        liabs: { mortgage: 186226, hecs: 18582, lucas: 16655 },
        assetCommentary: { shares: 'Shares note' },
        liabCommentary: { mortgage: 'Mortgage note' },
      },
    ];
    await page.evaluate((data) => {
      localStorage.setItem('nw_checkins_v1', JSON.stringify(data));
    }, seed);

    await page.click('#nav-networth');
    await page.waitForTimeout(300);

    // Values populated in form
    await expect(page.locator('#nwval-shares')).toHaveValue('8912');
    await expect(page.locator('#nwval-property')).toHaveValue('248333');
    await expect(page.locator('#nwval-mortgage')).toHaveValue('186226');
    await expect(page.locator('#nw-overall-commentary')).toHaveValue('Test commentary');

    // Storage not mutated by loading
    const raw = await page.evaluate(() => localStorage.getItem('nw_checkins_v1'));
    const loaded = JSON.parse(raw!);
    expect(loaded[0].id).toBe(3000001);
    expect(loaded[0].nw).toBe(164770);
    expect(loaded[0].assets.shares).toBe(8912);
    expect(loaded[0].liabs.mortgage).toBe(186226);
  });

  test('nw_calcs_v1 stores how-to-calculate instructions as string values', async ({ page }) => {
    await openNetWorth(page);

    // Trigger a save which also saves calcs
    await page.fill('#nwval-shares', '1000');
    await page.click('button.btn-checkin');

    const raw = await page.evaluate(() => localStorage.getItem('nw_calcs_v1'));
    expect(raw).not.toBeNull();
    const calcs = JSON.parse(raw!);

    expect(typeof calcs).toBe('object');
    const requiredCalcKeys = ['shares', 'property', 'cashEm', 'cashOff', 'super', 'mortgage', 'hecs', 'lucas'];
    for (const key of requiredCalcKeys) {
      expect(calcs).toHaveProperty(key);
      expect(typeof calcs[key]).toBe('string');
    }
  });

});

// ─────────────────────────────────────────────
// CROSS-APP — namespace isolation
// ─────────────────────────────────────────────
test.describe('Cross-app namespace isolation', () => {

  test('Bricks localStorage keys are not touched when using Net Worth', async ({ page }) => {
    await openFresh(page);

    // Seed Bricks data
    const bricksData = [{ id: 7000001, date: '2026-06-20', project: 'CVET Career', bricks: 3, note: 'Must survive' }];
    await page.evaluate((data) => {
      localStorage.setItem('bricks_log_v1', JSON.stringify(data));
    }, bricksData);

    await page.reload();
    await page.waitForLoadState('networkidle');

    // Switch to Net Worth and save a check-in
    await page.click('#nav-networth');
    await page.waitForTimeout(300);
    await page.fill('#nwval-shares', '5000');
    await page.click('button.btn-checkin');

    // Bricks data must be exactly as seeded
    const raw = await page.evaluate(() => localStorage.getItem('bricks_log_v1'));
    const entries = JSON.parse(raw!);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(7000001);
    expect(entries[0].note).toBe('Must survive');
    expect(entries[0].bricks).toBe(3);
  });

  test('Net Worth localStorage keys are not touched when using Bricks', async ({ page }) => {
    await openFresh(page);

    // Seed NW data
    const nwData = [{
      id: 8000001, date: '2026-06-20', label: 'Jun 2026', nw: 50000, nwExSuper: 10000,
      commentary: 'Must survive', assets: { shares: 5000, property: 0, cashEm: 0, cashOff: 0, super: 40000 },
      liabs: { mortgage: 0, hecs: 0, lucas: 0 }, assetCommentary: {}, liabCommentary: {},
    }];
    await page.evaluate((data) => {
      localStorage.setItem('nw_checkins_v1', JSON.stringify(data));
    }, nwData);

    await page.reload();
    await page.waitForLoadState('networkidle');

    // Use Bricks — log, edit, delete
    await page.fill('#input-date', '2026-06-20');
    await page.fill('#input-bricks', '2');
    await page.click('.btn-log');
    await page.click('.btn-edit');
    await page.waitForTimeout(100);
    const raw1 = await page.evaluate(() => localStorage.getItem('bricks_log_v1'));
    const id = JSON.parse(raw1!)[0].id;
    await page.fill(`#edit-bricks-${id}`, '3');
    await page.click('.btn-save');

    // NW data must be exactly as seeded
    const raw = await page.evaluate(() => localStorage.getItem('nw_checkins_v1'));
    const checkins = JSON.parse(raw!);
    expect(checkins).toHaveLength(1);
    expect(checkins[0].id).toBe(8000001);
    expect(checkins[0].commentary).toBe('Must survive');
    expect(checkins[0].nw).toBe(50000);
  });

});
