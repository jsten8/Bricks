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
    localStorage.removeItem('chores_v1');
    localStorage.removeItem('bodystats_v1');
    localStorage.removeItem('bodystats_records_baseline_v1');
    localStorage.removeItem('macros_targets_v1');
    localStorage.removeItem('macros_catalog_v1');
    localStorage.removeItem('macros_log_v1');
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

    // Form is locked after save — unlock to edit again
    await page.click('#nw-btn-edit-entry');
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
// NET WORTH — data integrity edge cases
// ─────────────────────────────────────────────
test.describe('Net Worth — data integrity edge cases', () => {

  async function openNetWorth(page: Page) {
    await openFresh(page);
    await page.click('#nav-networth');
    await page.waitForTimeout(300);
  }

  test('overall commentary survives save and full page reload', async ({ page }) => {
    await openNetWorth(page);

    await page.fill('#nwval-shares', '5000');
    await page.fill('#nw-overall-commentary', 'This is my test commentary');
    await page.click('button.btn-checkin');

    // Reload the page entirely — simulates user returning
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Navigate to Net Worth
    await page.click('#nav-networth');
    await page.waitForTimeout(300);

    // Commentary must be visible in the form (it loads locked, showing the saved value)
    await expect(page.locator('#nw-overall-commentary')).toHaveValue('This is my test commentary');

    // Also verify it's in localStorage
    const raw = await page.evaluate(() => localStorage.getItem('nw_checkins_v1'));
    const checkins = JSON.parse(raw!);
    expect(checkins[0].commentary).toBe('This is my test commentary');
  });

  test('adding a new check-in on a different date preserves existing (via + New button)', async ({ page }) => {
    await openFresh(page);

    const existing = [{
      id: 5000002,
      date: '2026-04-15',
      label: 'Apr 2026',
      nw: 145000,
      nwExSuper: 25000,
      commentary: 'Must survive NW test',
      assets: { shares: 7000, property: 200000, cashEm: 3000, cashOff: 0, super: 120000 },
      liabs: { mortgage: 185000, hecs: 0, lucas: 0 },
      assetCommentary: {},
      liabCommentary: {},
    }];
    await page.evaluate((data) => {
      localStorage.setItem('nw_checkins_v1', JSON.stringify(data));
    }, existing);

    await page.click('#nav-networth');
    await page.waitForTimeout(300);

    // Create a new check-in on a different date
    await page.click('button:has-text("+ New")');
    await page.fill('#nw-checkin-date', '2026-06-22');
    await page.fill('#nwval-shares', '9000');
    await page.click('button.btn-checkin');

    const raw = await page.evaluate(() => localStorage.getItem('nw_checkins_v1'));
    const checkins = JSON.parse(raw!);

    // Both check-ins must exist
    expect(checkins).toHaveLength(2);

    // Original untouched
    const original = checkins.find((c: any) => c.id === 5000002);
    expect(original).toBeTruthy();
    expect(original.commentary).toBe('Must survive NW test');
    expect(original.assets.shares).toBe(7000);
    expect(original.nw).toBe(145000);

    // New one present
    const newOne = checkins.find((c: any) => c.date === '2026-06-22');
    expect(newOne).toBeTruthy();
    expect(newOne.assets.shares).toBe(9000);
  });

  test('per-row asset commentary saves to storage via UI', async ({ page }) => {
    await openNetWorth(page);

    await page.fill('#nwval-shares', '10000');
    await page.fill('#nwcom-shares', 'Bought more ETFs this month');
    await page.fill('#nwcom-mortgage', 'Regular repayment');
    await page.click('button.btn-checkin');

    const raw = await page.evaluate(() => localStorage.getItem('nw_checkins_v1'));
    const checkins = JSON.parse(raw!);
    const c = checkins[0];

    expect(c.assetCommentary).toHaveProperty('shares');
    expect(c.assetCommentary.shares).toBe('Bought more ETFs this month');
    expect(c.liabCommentary).toHaveProperty('mortgage');
    expect(c.liabCommentary.mortgage).toBe('Regular repayment');
  });

});

// ─────────────────────────────────────────────
// DRIVE BACKUP — buildPayload completeness
// ─────────────────────────────────────────────
test.describe('Drive backup — buildPayload completeness', () => {

  test('buildPayload includes all Bricks entries in the backup', async ({ page }) => {
    await openFresh(page);

    // Log two bricks entries via UI
    await page.fill('#input-date', '2026-06-01');
    await page.fill('#input-bricks', '3');
    await page.fill('#input-note', 'Backup entry A');
    await page.click('.btn-log');

    await page.fill('#input-date', '2026-06-15');
    await page.fill('#input-bricks', '1.5');
    await page.fill('#input-note', 'Backup entry B');
    await page.click('.btn-log');

    const payload = await page.evaluate(() => (window as any).buildPayload());
    expect(typeof payload).toBe('string');
    const data = JSON.parse(payload);

    // Top-level shape
    expect(data).toHaveProperty('exported');
    expect(data).toHaveProperty('entries');
    expect(data).toHaveProperty('projects');
    expect(data).toHaveProperty('nwCheckins');
    expect(data).toHaveProperty('nwCalcs');

    // Bricks entries correct
    expect(Array.isArray(data.entries)).toBe(true);
    expect(data.entries).toHaveLength(2);
    expect(data.entries.some((e: any) => e.note === 'Backup entry A')).toBe(true);
    expect(data.entries.some((e: any) => e.note === 'Backup entry B')).toBe(true);
  });

  test('buildPayload includes all Net Worth check-ins in the backup', async ({ page }) => {
    await openFresh(page);

    // Seed NW data directly (Drive backup reads from localStorage)
    const nwSeed = [
      { id: 6000001, date: '2026-06-20', label: 'Jun 2026', nw: 164770, nwExSuper: 45412, commentary: 'NW backup test', assets: { shares: 8912, property: 248333, cashEm: 1630, cashOff: 8000, super: 119358 }, liabs: { mortgage: 186226, hecs: 18582, lucas: 16655 }, assetCommentary: {}, liabCommentary: {} },
      { id: 6000002, date: '2026-04-15', label: 'Apr 2026', nw: 145621, nwExSuper: 26264, commentary: '', assets: { shares: 7540, property: 248333, cashEm: 4618, cashOff: 0, super: 119358 }, liabs: { mortgage: 198415, hecs: 19557, lucas: 16255 }, assetCommentary: {}, liabCommentary: {} },
    ];
    await page.evaluate((data) => {
      localStorage.setItem('nw_checkins_v1', JSON.stringify(data));
    }, nwSeed);

    await page.reload();
    await page.waitForLoadState('networkidle');

    const payload = await page.evaluate(() => (window as any).buildPayload());
    const data = JSON.parse(payload);

    expect(Array.isArray(data.nwCheckins)).toBe(true);
    expect(data.nwCheckins).toHaveLength(2);

    const jun = data.nwCheckins.find((c: any) => c.id === 6000001);
    expect(jun).toBeTruthy();
    expect(jun.nw).toBe(164770);
    expect(jun.commentary).toBe('NW backup test');
    expect(jun.assets.shares).toBe(8912);
    expect(jun.liabs.mortgage).toBe(186226);

    const apr = data.nwCheckins.find((c: any) => c.id === 6000002);
    expect(apr).toBeTruthy();
    expect(apr.assets.shares).toBe(7540);
  });

  test('buildPayload captures both apps simultaneously — no data dropped', async ({ page }) => {
    await openFresh(page);

    // Seed both Bricks and NW data
    const bricksSeed = [
      { id: 7500001, date: '2026-06-01', project: 'CVET Career', bricks: 2, note: 'Concurrent Bricks test' },
    ];
    const nwSeed = [
      { id: 7500002, date: '2026-06-01', label: 'Jun 2026', nw: 50000, nwExSuper: 10000, commentary: 'Concurrent NW test', assets: { shares: 5000, property: 100000, cashEm: 0, cashOff: 0, super: 40000 }, liabs: { mortgage: 95000, hecs: 0, lucas: 0 }, assetCommentary: {}, liabCommentary: {} },
    ];
    await page.evaluate(({ b, nw }) => {
      localStorage.setItem('bricks_log_v1', JSON.stringify(b));
      localStorage.setItem('nw_checkins_v1', JSON.stringify(nw));
    }, { b: bricksSeed, nw: nwSeed });

    await page.reload();
    await page.waitForLoadState('networkidle');

    const payload = await page.evaluate(() => (window as any).buildPayload());
    const data = JSON.parse(payload);

    // Bricks data present
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].id).toBe(7500001);
    expect(data.entries[0].note).toBe('Concurrent Bricks test');

    // NW data present
    expect(data.nwCheckins).toHaveLength(1);
    expect(data.nwCheckins[0].id).toBe(7500002);
    expect(data.nwCheckins[0].commentary).toBe('Concurrent NW test');
    expect(data.nwCheckins[0].nw).toBe(50000);

    // Neither is empty or null
    expect(data.entries.length).toBeGreaterThan(0);
    expect(data.nwCheckins.length).toBeGreaterThan(0);

    // exported timestamp is present and a valid ISO string
    expect(typeof data.exported).toBe('string');
    expect(data.exported).toMatch(/^\d{4}-\d{2}-\d{2}T/);
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

// ─────────────────────────────────────────────
// CHORES — data integrity
// ─────────────────────────────────────────────
test.describe('Chores — data integrity', () => {

  async function openChores(page: Page) {
    await openFresh(page);
    await page.click('#nav-chores');
    await page.waitForTimeout(300);
  }

  test('adding a task via UI creates correct structure in chores_v1', async ({ page }) => {
    await openChores(page);

    await page.click('#chore-add-toggle-btn');
    await page.fill('#chore-new-name', 'Wash dog bed');
    await page.selectOption('#chore-new-color', 'peach');
    await page.click('#chore-add-panel .btn-log');

    const raw = await page.evaluate(() => localStorage.getItem('chores_v1'));
    expect(raw).not.toBeNull();
    const chores = JSON.parse(raw!);
    expect(Array.isArray(chores)).toBe(true);
    expect(chores).toHaveLength(1);

    const c = chores[0];
    expect(typeof c.id).toBe('string');
    expect(c.name).toBe('Wash dog bed');
    expect(c.color).toBe('peach');
    expect(c.note).toBe('');
    // lastDone is today's ISO date (as computed by the app itself)
    const appToday = await page.evaluate(() => (window as any).today());
    expect(c.lastDone).toBe(appToday);
    expect(c.lastDone).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('"Log now" sets lastDone to today and does not affect other tasks', async ({ page }) => {
    await openFresh(page);

    const seed = [
      { id: 'c-1', name: 'Descale kettle', color: 'mint', lastDone: '2026-01-05', note: '' },
      { id: 'c-2', name: 'Wash car', color: 'sky', lastDone: '2026-02-10', note: 'takes an hour' },
    ];
    await page.evaluate((data) => {
      localStorage.setItem('chores_v1', JSON.stringify(data));
    }, seed);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.click('#nav-chores');
    await page.waitForTimeout(300);

    // Rows are sorted oldest lastDone first — c-1 is first. Click its "Log now".
    await page.locator('.chore-row', { hasText: 'Descale kettle' }).locator('button:has-text("Log now")').click();

    const raw = await page.evaluate(() => localStorage.getItem('chores_v1'));
    const chores = JSON.parse(raw!);
    const appToday = await page.evaluate(() => (window as any).today());

    const logged = chores.find((c: any) => c.id === 'c-1');
    expect(logged.lastDone).toBe(appToday);
    // Other task untouched
    const other = chores.find((c: any) => c.id === 'c-2');
    expect(other.lastDone).toBe('2026-02-10');
    expect(other.note).toBe('takes an hour');
  });

  test('editing the date input persists the new lastDone', async ({ page }) => {
    await openFresh(page);

    const seed = [{ id: 'c-9', name: 'Clean oven', color: 'olive', lastDone: '2026-03-01', note: '' }];
    await page.evaluate((data) => {
      localStorage.setItem('chores_v1', JSON.stringify(data));
    }, seed);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.click('#nav-chores');
    await page.waitForTimeout(300);

    await page.locator('.chore-row input[type="date"]').fill('2026-06-15');

    const raw = await page.evaluate(() => localStorage.getItem('chores_v1'));
    const chores = JSON.parse(raw!);
    expect(chores[0].lastDone).toBe('2026-06-15');
    expect(chores[0].name).toBe('Clean oven');
  });

  test('saving a note persists and survives reload', async ({ page }) => {
    await openFresh(page);

    const seed = [{ id: 'c-7', name: 'Wash bins', color: 'rose', lastDone: '2026-06-01', note: '' }];
    await page.evaluate((data) => {
      localStorage.setItem('chores_v1', JSON.stringify(data));
    }, seed);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.click('#nav-chores');
    await page.waitForTimeout(300);

    await page.click('#chore-note-btn-c-7');
    await page.fill('#chore-note-text-c-7', 'Smells after 14 days');
    await page.click('#chore-note-panel-c-7 button:has-text("Save note")');

    let raw = await page.evaluate(() => localStorage.getItem('chores_v1'));
    expect(JSON.parse(raw!)[0].note).toBe('Smells after 14 days');

    // Survives full reload
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.click('#nav-chores');
    await page.waitForTimeout(300);

    raw = await page.evaluate(() => localStorage.getItem('chores_v1'));
    expect(JSON.parse(raw!)[0].note).toBe('Smells after 14 days');
    // Note text visible in the (hidden) panel textarea after re-render
    await expect(page.locator('#chore-note-text-c-7')).toHaveValue('Smells after 14 days');
  });

  test('duplicate task name (case-insensitive) is rejected', async ({ page }) => {
    await openChores(page);

    await page.click('#chore-add-toggle-btn');
    await page.fill('#chore-new-name', 'Mop floors');
    await page.click('#chore-add-panel .btn-log');

    // Panel closed after successful add — reopen and try a case-variant duplicate
    await page.click('#chore-add-toggle-btn');
    await page.fill('#chore-new-name', 'MOP FLOORS');
    await page.click('#chore-add-panel .btn-log');

    const raw = await page.evaluate(() => localStorage.getItem('chores_v1'));
    const chores = JSON.parse(raw!);
    expect(chores).toHaveLength(1);
    expect(chores[0].name).toBe('Mop floors');
  });

  test('seeded chores load and render after reload without corruption', async ({ page }) => {
    await openFresh(page);

    const seed = [
      { id: 'c-100', name: 'Task A', color: 'mint', lastDone: '2026-01-01', note: 'note A' },
      { id: 'c-101', name: 'Task B', color: 'lav', lastDone: '2026-05-05', note: '' },
    ];
    await page.evaluate((data) => {
      localStorage.setItem('chores_v1', JSON.stringify(data));
    }, seed);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.click('#nav-chores');
    await page.waitForTimeout(300);

    await expect(page.locator('#chore-list')).toContainText('Task A');
    await expect(page.locator('#chore-list')).toContainText('Task B');

    // Storage not mutated by loading
    const raw = await page.evaluate(() => localStorage.getItem('chores_v1'));
    const loaded = JSON.parse(raw!);
    expect(loaded).toHaveLength(2);
    expect(loaded[0]).toEqual(seed[0]);
    expect(loaded[1]).toEqual(seed[1]);
  });

  test('setting the interval input persists intervalDays; clearing it removes the field', async ({ page }) => {
    await openFresh(page);

    const seed = [{ id: 'c-int', name: 'Descale kettle', color: 'sky', lastDone: '2026-06-01', note: '' }];
    await page.evaluate((data) => { localStorage.setItem('chores_v1', JSON.stringify(data)); }, seed);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.click('#nav-chores');
    await page.waitForTimeout(300);

    // Set interval
    await page.locator('.chore-row input[type="number"]').fill('14');
    await page.locator('.chore-row input[type="number"]').blur();
    let chores = JSON.parse(await page.evaluate(() => localStorage.getItem('chores_v1')) as string);
    expect(chores[0].intervalDays).toBe(14);

    // Clear interval → field removed entirely
    await page.locator('.chore-row input[type="number"]').fill('');
    await page.locator('.chore-row input[type="number"]').blur();
    chores = JSON.parse(await page.evaluate(() => localStorage.getItem('chores_v1')) as string);
    expect(chores[0]).not.toHaveProperty('intervalDays');
  });

  test('status label reflects due state and due tasks float to the top', async ({ page }) => {
    await openFresh(page);

    const appToday = await page.evaluate(() => (window as any).today());
    const daysAgo = (n: number) => {
      const d = new Date(appToday + 'T00:00:00');
      d.setDate(d.getDate() - n);
      return d.toISOString().split('T')[0];
    };

    // Task A: cleaned today, 14-day interval → not due (Clean). Seeded first.
    // Task B: cleaned 20 days ago, 7-day interval → due (Time to clean). Seeded second.
    const seed = [
      { id: 'c-a', name: 'Fresh task', color: 'mint', lastDone: appToday, note: '', intervalDays: 14 },
      { id: 'c-b', name: 'Overdue task', color: 'rose', lastDone: daysAgo(20), note: '', intervalDays: 7 },
    ];
    await page.evaluate((data) => { localStorage.setItem('chores_v1', JSON.stringify(data)); }, seed);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.click('#nav-chores');
    await page.waitForTimeout(300);

    // Due task rendered first despite being seeded second
    const names = await page.locator('.chore-row .chore-name').allInnerTexts();
    expect(names[0]).toContain('Overdue task');
    expect(names[1]).toContain('Fresh task');

    // Correct pills
    await expect(page.locator('.chore-row', { hasText: 'Overdue task' }).locator('.chore-status.due')).toHaveText('Time to clean');
    await expect(page.locator('.chore-row', { hasText: 'Fresh task' }).locator('.chore-status.ok')).toHaveText('Clean');
  });

  test('task with no interval shows no status pill', async ({ page }) => {
    await openFresh(page);

    const seed = [{ id: 'c-noint', name: 'Whenever task', color: 'peach', lastDone: '2026-01-01', note: '' }];
    await page.evaluate((data) => { localStorage.setItem('chores_v1', JSON.stringify(data)); }, seed);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.click('#nav-chores');
    await page.waitForTimeout(300);

    await expect(page.locator('.chore-row .chore-status')).toHaveCount(0);
  });

});

// ─────────────────────────────────────────────
// BODY STATS — data integrity
// ─────────────────────────────────────────────
test.describe('Body Stats — data integrity', () => {

  async function openBodyStats(page: Page) {
    await openFresh(page);
    await page.click('#nav-bodystats');
    await page.waitForTimeout(300);
  }

  test('logging a full check-in stores all fields as numbers', async ({ page }) => {
    await openBodyStats(page);

    await page.fill('#bs-date', '2026-06-20');
    await page.fill('#bs-fat', '18.5');
    await page.fill('#bs-weight', '78.2');
    await page.fill('#bs-lean', '63.7');
    await page.fill('#bs-chest', '8');
    await page.fill('#bs-stomach', '14');
    await page.fill('#bs-leg', '10.5');
    await page.click('#bs-submit-btn');

    const raw = await page.evaluate(() => localStorage.getItem('bodystats_v1'));
    expect(raw).not.toBeNull();
    const entries = JSON.parse(raw!);
    expect(entries).toHaveLength(1);

    const e = entries[0];
    expect(typeof e.id).toBe('string');
    expect(e.date).toBe('2026-06-20');
    expect(e.bodyFat).toBe(18.5);
    expect(e.weight).toBe(78.2);
    expect(e.leanMass).toBe(63.7);
    expect(e.chestPinch).toBe(8);
    expect(e.stomachPinch).toBe(14);
    expect(e.legPinch).toBe(10.5);
    for (const k of ['bodyFat', 'weight', 'leanMass', 'chestPinch', 'stomachPinch', 'legPinch']) {
      expect(typeof e[k]).toBe('number');
    }
  });

  test('partial check-in stores only entered fields', async ({ page }) => {
    await openBodyStats(page);

    await page.fill('#bs-date', '2026-06-20');
    await page.fill('#bs-weight', '77.0');
    await page.click('#bs-submit-btn');

    const raw = await page.evaluate(() => localStorage.getItem('bodystats_v1'));
    const e = JSON.parse(raw!)[0];

    expect(e.weight).toBe(77);
    // Omitted fields absent entirely — not null, not 0
    for (const k of ['bodyFat', 'leanMass', 'chestPinch', 'stomachPinch', 'legPinch']) {
      expect(e).not.toHaveProperty(k);
    }
    expect(Object.keys(e).sort()).toEqual(['date', 'id', 'weight']);
  });

  test('logging the same date twice replaces, not duplicates', async ({ page }) => {
    await openBodyStats(page);

    await page.fill('#bs-date', '2026-06-20');
    await page.fill('#bs-weight', '78');
    await page.click('#bs-submit-btn');

    await page.fill('#bs-date', '2026-06-20');
    await page.fill('#bs-weight', '79');
    await page.click('#bs-submit-btn');

    const raw = await page.evaluate(() => localStorage.getItem('bodystats_v1'));
    const entries = JSON.parse(raw!);
    expect(entries).toHaveLength(1);
    expect(entries[0].weight).toBe(79);
  });

  test('edit flow populates the form and updates in place', async ({ page }) => {
    await openFresh(page);

    const seed = [
      { id: 'bs-1', date: '2026-05-01', bodyFat: 20.1, weight: 80 },
      { id: 'bs-2', date: '2026-06-01', weight: 78.5, chestPinch: 9 },
    ];
    await page.evaluate((data) => {
      localStorage.setItem('bodystats_v1', JSON.stringify(data));
    }, seed);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.click('#nav-bodystats');
    await page.waitForTimeout(300);

    // Edit the 2026-06-01 entry (newest first in list, so it's the first Edit button)
    await page.locator('#bs-entry-list button:has-text("Edit")').first().click();

    // Form populated
    await expect(page.locator('#bs-form-title')).toHaveText('Edit check-in');
    await expect(page.locator('#bs-date')).toHaveValue('2026-06-01');
    await expect(page.locator('#bs-weight')).toHaveValue('78.5');
    await expect(page.locator('#bs-chest')).toHaveValue('9');
    await expect(page.locator('#bs-cancel-edit')).toBeVisible();

    // Change weight and save
    await page.fill('#bs-weight', '77.9');
    await page.click('#bs-submit-btn');

    const raw = await page.evaluate(() => localStorage.getItem('bodystats_v1'));
    const entries = JSON.parse(raw!);
    expect(entries).toHaveLength(2); // same length — updated in place
    const edited = entries.find((e: any) => e.id === 'bs-2');
    expect(edited.weight).toBe(77.9);
    expect(edited.chestPinch).toBe(9);
    // Other entry untouched
    const other = entries.find((e: any) => e.id === 'bs-1');
    expect(other).toEqual(seed[0]);
  });

  test('body stats data survives reload', async ({ page }) => {
    await openBodyStats(page);

    await page.fill('#bs-date', '2026-06-20');
    await page.fill('#bs-fat', '19.2');
    await page.fill('#bs-weight', '78.8');
    await page.click('#bs-submit-btn');

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.click('#nav-bodystats');
    await page.waitForTimeout(300);

    const raw = await page.evaluate(() => localStorage.getItem('bodystats_v1'));
    const entries = JSON.parse(raw!);
    expect(entries).toHaveLength(1);
    expect(entries[0].bodyFat).toBe(19.2);
    expect(entries[0].weight).toBe(78.8);
    // Rendered in the entry list
    await expect(page.locator('#bs-entry-list')).toContainText('78.8kg');
  });

  test('logging with no measurements is rejected', async ({ page }) => {
    await openBodyStats(page);

    await page.fill('#bs-date', '2026-06-20');
    // No measurement fields filled
    await page.click('#bs-submit-btn');

    const raw = await page.evaluate(() => localStorage.getItem('bodystats_v1'));
    const entries = raw ? JSON.parse(raw) : [];
    expect(entries).toHaveLength(0);
  });

  test('journal: reflection and next-period goal persist inline', async ({ page }) => {
    await openFresh(page);
    const seed = [{ id: 'bs-j1', date: '2026-06-20', weight: 88.1 }];
    await page.evaluate((d) => { localStorage.setItem('bodystats_v1', JSON.stringify(d)); }, seed);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.click('#nav-bodystats');
    await page.waitForTimeout(300);

    await page.locator('.bs-jc-card textarea').nth(0).fill('Trained 4x a week.');
    await page.locator('.bs-jc-card textarea').nth(0).blur();
    await page.locator('.bs-jc-card textarea').nth(1).fill('Body fat under 18% next time.');
    await page.locator('.bs-jc-card textarea').nth(1).blur();

    const entry = JSON.parse(await page.evaluate(() => localStorage.getItem('bodystats_v1')) as string)[0];
    expect(entry.reflection).toBe('Trained 4x a week.');
    expect(entry.goalNext).toBe('Body fat under 18% next time.');
  });

  test('journal: goal-met badge toggles met/missed and previous goal carries forward', async ({ page }) => {
    await openFresh(page);
    // Older entry sets a goal; newer entry is judged against it
    const seed = [
      { id: 'bs-old', date: '2026-05-16', weight: 89, goalNext: 'Get body fat under 18.5%.' },
      { id: 'bs-new', date: '2026-06-20', weight: 88.1 },
    ];
    await page.evaluate((d) => { localStorage.setItem('bodystats_v1', JSON.stringify(d)); }, seed);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.click('#nav-bodystats');
    await page.waitForTimeout(300);

    // Newest card (first) shows the previous goal text
    const firstCard = page.locator('.bs-jc-card').nth(0);
    await expect(firstCard.locator('.bs-jc-prevgoal')).toContainText('Get body fat under 18.5%.');

    // Mark goal met
    await firstCard.locator('.bs-jc-badge', { hasText: 'Goal met' }).click();
    let newEntry = JSON.parse(await page.evaluate(() => localStorage.getItem('bodystats_v1')) as string).find((e: any) => e.id === 'bs-new');
    expect(newEntry.goalMet).toBe('met');

    // Toggling the same badge again clears it
    await firstCard.locator('.bs-jc-badge', { hasText: 'Goal met' }).click();
    newEntry = JSON.parse(await page.evaluate(() => localStorage.getItem('bodystats_v1')) as string).find((e: any) => e.id === 'bs-new');
    expect(newEntry.goalMet).toBeUndefined();
  });

  test('journal: editing measurements preserves reflection, goal, and met status', async ({ page }) => {
    await openFresh(page);
    const seed = [{ id: 'bs-keep', date: '2026-06-20', weight: 88.1, reflection: 'Kept it tight.', goalNext: 'Hold the line.', goalMet: 'met' }];
    await page.evaluate((d) => { localStorage.setItem('bodystats_v1', JSON.stringify(d)); }, seed);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.click('#nav-bodystats');
    await page.waitForTimeout(300);

    // Edit the measurement via the form
    await page.locator('.bs-jc-card .btn-log-now', { hasText: 'Edit' }).click();
    await page.fill('#bs-weight', '87.5');
    await page.click('#bs-submit-btn');

    const entry = JSON.parse(await page.evaluate(() => localStorage.getItem('bodystats_v1')) as string)[0];
    expect(entry.weight).toBe(87.5);
    // Journal fields survived the measurement edit
    expect(entry.reflection).toBe('Kept it tight.');
    expect(entry.goalNext).toBe('Hold the line.');
    expect(entry.goalMet).toBe('met');
  });

  test('journal: delta colours reflect good/bad direction, not raw sign', async ({ page }) => {
    await openFresh(page);
    // Newer entry: weight down (good→green/up), body fat down (good→up), lean mass down (bad→red/down)
    const seed = [
      { id: 'bs-p', date: '2026-05-16', weight: 89, bodyFat: 20, leanMass: 72 },
      { id: 'bs-c', date: '2026-06-20', weight: 88, bodyFat: 18, leanMass: 71 },
    ];
    await page.evaluate((d) => { localStorage.setItem('bodystats_v1', JSON.stringify(d)); }, seed);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.click('#nav-bodystats');
    await page.waitForTimeout(300);

    // Newest card first; metric order is bodyFat, weight, leanMass
    const deltas = page.locator('.bs-jc-card').nth(0).locator('.bs-jc-mdelta');
    await expect(deltas.nth(0)).toHaveClass(/up/);   // body fat -2.0% → good
    await expect(deltas.nth(1)).toHaveClass(/up/);   // weight -1.0kg → good
    await expect(deltas.nth(2)).toHaveClass(/down/); // lean mass -1.0kg → bad
  });

  test('medals: baseline suppresses pre-baseline history; latest holds current records', async ({ page }) => {
    await openFresh(page);
    // No baseline stored yet → auto-initialises to the latest existing check-in (June)
    const seed = [
      { id: 'bs-may', date: '2026-05-16', bodyFat: 20.1, leanMass: 71.1, chestPinch: 14, stomachPinch: 33, legPinch: 14 },
      { id: 'bs-jun', date: '2026-06-20', bodyFat: 18.1, leanMass: 77.2, chestPinch: 12.3, stomachPinch: 29, legPinch: 11.8 },
    ];
    await page.evaluate((d) => { localStorage.setItem('bodystats_v1', JSON.stringify(d)); }, seed);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.click('#nav-bodystats');
    await page.waitForTimeout(300);

    // Baseline auto-set to June
    expect(await page.evaluate(() => localStorage.getItem('bodystats_records_baseline_v1'))).toBe('2026-06-20');

    // June (newest, first card) holds all 5 records
    const juneCard = page.locator('.bs-jc-card').nth(0);
    await expect(juneCard.locator('.bs-medal')).toHaveCount(5);
    // May (older, second card) is pre-baseline → no medals row
    const mayCard = page.locator('.bs-jc-card').nth(1);
    await expect(mayCard.locator('.bs-medal')).toHaveCount(0);

    // Nothing stored per entry — medals are computed
    const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('bodystats_v1')) as string);
    expect(stored[0]).not.toHaveProperty('medals');
  });

  test('medals: a later check-in earns a record without stripping the earlier holder; ties do not earn', async ({ page }) => {
    await openFresh(page);
    // Baseline fixed at June; July beats June on body fat, ties June on lean mass
    await page.evaluate(() => localStorage.setItem('bodystats_records_baseline_v1', '2026-06-20'));
    const seed = [
      { id: 'bs-may', date: '2026-05-16', bodyFat: 20.1, leanMass: 71.1 },
      { id: 'bs-jun', date: '2026-06-20', bodyFat: 18.1, leanMass: 77.2 },
      { id: 'bs-jul', date: '2026-07-18', bodyFat: 17.0, leanMass: 77.2 },
    ];
    await page.evaluate((d) => { localStorage.setItem('bodystats_v1', JSON.stringify(d)); }, seed);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.click('#nav-bodystats');
    await page.waitForTimeout(300);

    // July (first card): beats June on body fat → "Leanest ever"; ties lean mass → no "Most muscular"
    const julyCard = page.locator('.bs-jc-card').nth(0);
    await expect(julyCard.locator('.bs-medal', { hasText: 'Leanest ever' })).toHaveCount(1);
    await expect(julyCard.locator('.bs-medal', { hasText: 'Most muscular ever' })).toHaveCount(0);

    // June (second card) keeps BOTH its records — a later PR didn't strip them
    const juneCard = page.locator('.bs-jc-card').nth(1);
    await expect(juneCard.locator('.bs-medal', { hasText: 'Leanest ever' })).toHaveCount(1);
    await expect(juneCard.locator('.bs-medal', { hasText: 'Most muscular ever' })).toHaveCount(1);

    // The record-setting value gets the gold tint (July's body fat)
    await expect(julyCard.locator('.bs-jc-mval.gold').first()).toBeVisible();
  });

  test('medals: buildPayload includes the records baseline', async ({ page }) => {
    await openFresh(page);
    await page.evaluate(() => localStorage.setItem('bodystats_records_baseline_v1', '2026-06-20'));
    const payload = JSON.parse(await page.evaluate(() => (window as any).buildPayload()));
    expect(payload.bsRecordsBaseline).toBe('2026-06-20');
  });

});

// ─────────────────────────────────────────────
// MACROS — data integrity
// ─────────────────────────────────────────────
test.describe('Macros — data integrity', () => {

  const QUICK_ITEM = { id: 'mi-q1', name: 'Protein shake', kind: 'quick', calsPerServing: 220, proteinPerServing: 38 };
  const VAR_ITEM = { id: 'mi-v1', name: 'Chicken breast', kind: 'variable', calsPer100: 165, proteinPer100: 31 };

  async function openMacros(page: Page) {
    await openFresh(page);
    await page.click('#nav-macros');
    await page.waitForTimeout(300);
  }

  async function seedCatalogAndOpen(page: Page, catalog: any[]) {
    await openFresh(page);
    await page.evaluate((data) => {
      localStorage.setItem('macros_catalog_v1', JSON.stringify(data));
    }, catalog);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.click('#nav-macros');
    await page.waitForTimeout(300);
  }

  test('quick-add tick creates a log entry for today with a targets snapshot', async ({ page }) => {
    await seedCatalogAndOpen(page, [QUICK_ITEM]);

    await page.locator('#mac-quick-body input[type="checkbox"]').check();

    const appToday = await page.evaluate(() => (window as any).today());
    const raw = await page.evaluate(() => localStorage.getItem('macros_log_v1'));
    expect(raw).not.toBeNull();
    const log = JSON.parse(raw!);

    expect(log).toHaveProperty(appToday);
    const day = log[appToday];

    // Targets snapshot present on the day object
    expect(day.targets).toBeTruthy();
    expect(typeof day.targets.calLow).toBe('number');
    expect(typeof day.targets.calHigh).toBe('number');
    expect(typeof day.targets.protein).toBe('number');

    // Entry correct
    expect(day.entries).toHaveLength(1);
    const e = day.entries[0];
    expect(e.catalogId).toBe('mi-q1');
    expect(e.name).toBe('Protein shake');
    expect(e.cals).toBe(220);
    expect(e.protein).toBe(38);
    expect(e.qtyLabel).toBe('1 serving');
  });

  test('untick removes the entry and deletes the empty day key', async ({ page }) => {
    await seedCatalogAndOpen(page, [QUICK_ITEM]);

    const cb = page.locator('#mac-quick-body input[type="checkbox"]');
    await cb.check();

    const appToday = await page.evaluate(() => (window as any).today());
    let raw = await page.evaluate(() => localStorage.getItem('macros_log_v1'));
    expect(JSON.parse(raw!)).toHaveProperty(appToday);

    await cb.uncheck();

    raw = await page.evaluate(() => localStorage.getItem('macros_log_v1'));
    const log = JSON.parse(raw!);
    expect(log).not.toHaveProperty(appToday);
  });

  test('variable item: entering grams and ticking computes cals and protein from per-100 values', async ({ page }) => {
    await seedCatalogAndOpen(page, [VAR_ITEM]);

    await page.fill('#mac-grams-mi-v1', '250');
    await page.locator('#mac-var-body input[type="checkbox"]').check();

    const appToday = await page.evaluate(() => (window as any).today());
    const raw = await page.evaluate(() => localStorage.getItem('macros_log_v1'));
    const day = JSON.parse(raw!)[appToday];
    expect(day.entries).toHaveLength(1);

    const e = day.entries[0];
    expect(e.grams).toBe(250);
    // cals = round(165 * 250 / 100) = 413; protein = round(31 * 250 / 100 * 10) / 10 = 77.5
    expect(e.cals).toBe(413);
    expect(e.protein).toBe(77.5);
    expect(e.qtyLabel).toBe('250g');
  });

  test('per-day targets snapshot on a past day is immutable when global targets change', async ({ page }) => {
    await openFresh(page);

    const oldSnapshot = { calLow: 2500, calHigh: 2700, protein: 170 };
    const pastLog = {
      '2026-05-01': {
        targets: oldSnapshot,
        entries: [{ id: 'me-1', catalogId: 'mi-q1', name: 'Protein shake', qtyLabel: '1 serving', cals: 220, protein: 38, time: '08:00' }],
      },
    };
    await page.evaluate((data) => {
      localStorage.setItem('macros_log_v1', JSON.stringify(data));
    }, pastLog);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.click('#nav-macros');
    await page.waitForTimeout(300);

    // Change global targets via the targets modal (viewing today, not the past day)
    await page.click('.mac-edit-targets');
    await page.fill('#mac-t-callow', '3000');
    await page.fill('#mac-t-calhigh', '3200');
    await page.fill('#mac-t-protein', '210');
    await page.click('#mac-targets-overlay .btn-checkin');

    // Global targets updated
    const rawTgt = await page.evaluate(() => localStorage.getItem('macros_targets_v1'));
    expect(JSON.parse(rawTgt!)).toEqual({ calLow: 3000, calHigh: 3200, protein: 210 });

    // Past day snapshot untouched
    const rawLog = await page.evaluate(() => localStorage.getItem('macros_log_v1'));
    const log = JSON.parse(rawLog!);
    expect(log['2026-05-01'].targets).toEqual(oldSnapshot);
    expect(log['2026-05-01'].entries).toHaveLength(1);
  });

  test('adding a catalog item via the modal persists to macros_catalog_v1', async ({ page }) => {
    await openMacros(page);

    await page.click('button:has-text("+ Add usual item")');
    await page.fill('#mac-item-name', 'Greek yoghurt');
    await page.fill('#mac-item-cals-serv', '150');
    await page.fill('#mac-item-pro-serv', '17');
    await page.click('#mac-item-save-btn');

    const raw = await page.evaluate(() => localStorage.getItem('macros_catalog_v1'));
    expect(raw).not.toBeNull();
    const catalog = JSON.parse(raw!);
    expect(catalog).toHaveLength(1);

    const item = catalog[0];
    expect(typeof item.id).toBe('string');
    expect(item.name).toBe('Greek yoghurt');
    expect(item.kind).toBe('quick');
    expect(item.calsPerServing).toBe(150);
    expect(item.proteinPerServing).toBe(17);
  });

  test('editing a catalog item updates it; deleting removes it', async ({ page }) => {
    await seedCatalogAndOpen(page, [QUICK_ITEM, VAR_ITEM]);

    // Edit the quick item (pencil only shows on row hover — force the click)
    await page.locator('#mac-quick-body .mac-row-edit').click({ force: true });
    await page.fill('#mac-item-name', 'Protein shake XL');
    await page.fill('#mac-item-cals-serv', '260');
    await page.click('#mac-item-save-btn');

    let raw = await page.evaluate(() => localStorage.getItem('macros_catalog_v1'));
    let catalog = JSON.parse(raw!);
    expect(catalog).toHaveLength(2);
    const edited = catalog.find((i: any) => i.id === 'mi-q1');
    expect(edited.name).toBe('Protein shake XL');
    expect(edited.calsPerServing).toBe(260);
    // Variable item untouched
    expect(catalog.find((i: any) => i.id === 'mi-v1')).toEqual(VAR_ITEM);

    // Delete the quick item
    await page.locator('#mac-quick-body .mac-row-edit').click({ force: true });
    await page.click('#mac-item-delete');

    raw = await page.evaluate(() => localStorage.getItem('macros_catalog_v1'));
    catalog = JSON.parse(raw!);
    expect(catalog).toHaveLength(1);
    expect(catalog[0].id).toBe('mi-v1');
  });

  test('compliance boundaries: 5% tolerance is inclusive at the edges', async ({ page }) => {
    await openMacros(page);

    const results = await page.evaluate(() => {
      const w = window as any;
      const t = { calLow: 2700, calHigh: 2900, protein: 190 };
      const TOL = 0.05;
      return {
        atLowBound: w.macroCalCompliant(t.calLow * (1 - TOL), t),
        belowLowBound: w.macroCalCompliant(t.calLow * (1 - TOL) - 1, t),
        atHighBound: w.macroCalCompliant(t.calHigh * (1 + TOL), t),
        aboveHighBound: w.macroCalCompliant(t.calHigh * (1 + TOL) + 1, t),
        atProteinBound: w.macroProteinCompliant(t.protein * (1 - TOL), t),
        belowProteinBound: w.macroProteinCompliant(t.protein * (1 - TOL) - 0.1, t),
        wellInside: w.macroCalCompliant(2800, t) && w.macroProteinCompliant(200, t),
      };
    });

    expect(results.atLowBound).toBe(true);
    expect(results.belowLowBound).toBe(false);
    expect(results.atHighBound).toBe(true);
    expect(results.aboveHighBound).toBe(false);
    expect(results.atProteinBound).toBe(true);
    expect(results.belowProteinBound).toBe(false);
    expect(results.wellInside).toBe(true);
  });

  test('macros log survives reload without corruption', async ({ page }) => {
    await seedCatalogAndOpen(page, [QUICK_ITEM]);

    await page.locator('#mac-quick-body input[type="checkbox"]').check();

    const rawBefore = await page.evaluate(() => localStorage.getItem('macros_log_v1'));
    const before = JSON.parse(rawBefore!);

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.click('#nav-macros');
    await page.waitForTimeout(300);

    const rawAfter = await page.evaluate(() => localStorage.getItem('macros_log_v1'));
    expect(JSON.parse(rawAfter!)).toEqual(before);

    // Checkbox re-renders as ticked from the persisted log
    await expect(page.locator('#mac-quick-body input[type="checkbox"]')).toBeChecked();
  });

  test('one-off item logs to the day with oneOff flag, null catalogId, and counts toward totals', async ({ page }) => {
    await seedCatalogAndOpen(page, []);

    await page.click('button[onclick="macroOpenOneOff()"]');
    await page.fill('#mac-oneoff-name', 'Cafe banana bread');
    await page.fill('#mac-oneoff-cals', '480');
    await page.fill('#mac-oneoff-pro', '12');
    await page.click('button[onclick="macroSaveOneOff()"]');

    const appToday = await page.evaluate(() => (window as any).today());
    const raw = await page.evaluate(() => localStorage.getItem('macros_log_v1'));
    const day = JSON.parse(raw!)[appToday];
    expect(day.entries).toHaveLength(1);

    const e = day.entries[0];
    expect(e.oneOff).toBe(true);
    expect(e.catalogId).toBeNull();
    expect(e.name).toBe('Cafe banana bread');
    expect(e.cals).toBe(480);
    expect(e.protein).toBe(12);

    // No catalog item was created
    const cat = JSON.parse(await page.evaluate(() => localStorage.getItem('macros_catalog_v1')) as string);
    expect(cat).toHaveLength(0);

    // Snapshot present (first entry of the day)
    expect(day.targets).toBeTruthy();
  });

  test('removing a one-off deletes it and clears the empty day key', async ({ page }) => {
    await seedCatalogAndOpen(page, []);

    await page.click('button[onclick="macroOpenOneOff()"]');
    await page.fill('#mac-oneoff-name', 'Takeaway pad thai');
    await page.fill('#mac-oneoff-cals', '900');
    await page.fill('#mac-oneoff-pro', '30');
    await page.click('button[onclick="macroSaveOneOff()"]');

    const appToday = await page.evaluate(() => (window as any).today());
    let raw = await page.evaluate(() => localStorage.getItem('macros_log_v1'));
    expect(JSON.parse(raw!)).toHaveProperty(appToday);

    await page.click('#mac-oneoff-body .mac-row-edit', { force: true });

    raw = await page.evaluate(() => localStorage.getItem('macros_log_v1'));
    expect(JSON.parse(raw!)).not.toHaveProperty(appToday);
  });

  test('one-off item survives reload', async ({ page }) => {
    await seedCatalogAndOpen(page, []);

    await page.click('button[onclick="macroOpenOneOff()"]');
    await page.fill('#mac-oneoff-name', 'Airport sandwich');
    await page.fill('#mac-oneoff-cals', '550');
    await page.fill('#mac-oneoff-pro', '25');
    await page.click('button[onclick="macroSaveOneOff()"]');

    const before = JSON.parse(await page.evaluate(() => localStorage.getItem('macros_log_v1')) as string);

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.click('#nav-macros');
    await page.waitForTimeout(300);

    const after = JSON.parse(await page.evaluate(() => localStorage.getItem('macros_log_v1')) as string);
    expect(after).toEqual(before);

    // Renders in the one-off list
    await expect(page.locator('#mac-oneoff-body .mac-name')).toHaveText('Airport sandwich');
  });

});

// ─────────────────────────────────────────────
// DRIVE BACKUP — new tabs included in payload
// ─────────────────────────────────────────────
test.describe('Drive backup — new tabs in buildPayload', () => {

  test('buildPayload includes seeded chores', async ({ page }) => {
    await openFresh(page);

    const seed = [{ id: 'c-500', name: 'Backup chore', color: 'mint', lastDone: '2026-06-01', note: 'backup note' }];
    await page.evaluate((data) => {
      localStorage.setItem('chores_v1', JSON.stringify(data));
    }, seed);
    await page.reload();
    await page.waitForLoadState('networkidle');

    const payload = await page.evaluate(() => (window as any).buildPayload());
    const data = JSON.parse(payload);

    expect(data).toHaveProperty('chores');
    expect(data.chores).toHaveLength(1);
    expect(data.chores[0]).toEqual(seed[0]);
  });

  test('buildPayload includes seeded bodyStats', async ({ page }) => {
    await openFresh(page);

    const seed = [
      { id: 'bs-500', date: '2026-06-01', bodyFat: 18.5, weight: 78.2 },
      { id: 'bs-501', date: '2026-06-15', weight: 77.9, legPinch: 10.5 },
    ];
    await page.evaluate((data) => {
      localStorage.setItem('bodystats_v1', JSON.stringify(data));
    }, seed);
    await page.reload();
    await page.waitForLoadState('networkidle');

    const payload = await page.evaluate(() => (window as any).buildPayload());
    const data = JSON.parse(payload);

    expect(data).toHaveProperty('bodyStats');
    expect(data.bodyStats).toHaveLength(2);
    expect(data.bodyStats[0]).toEqual(seed[0]);
    expect(data.bodyStats[1]).toEqual(seed[1]);
  });

  test('buildPayload includes macros targets, catalog, and log', async ({ page }) => {
    await openFresh(page);

    const targets = { calLow: 2600, calHigh: 2800, protein: 185 };
    const catalog = [{ id: 'mi-500', name: 'Backup item', kind: 'quick', calsPerServing: 100, proteinPerServing: 10 }];
    const log = {
      '2026-06-01': {
        targets: { calLow: 2500, calHigh: 2700, protein: 180 },
        entries: [{ id: 'me-500', catalogId: 'mi-500', name: 'Backup item', qtyLabel: '1 serving', cals: 100, protein: 10, time: '12:00' }],
      },
    };
    await page.evaluate(({ t, c, l }) => {
      localStorage.setItem('macros_targets_v1', JSON.stringify(t));
      localStorage.setItem('macros_catalog_v1', JSON.stringify(c));
      localStorage.setItem('macros_log_v1', JSON.stringify(l));
    }, { t: targets, c: catalog, l: log });
    await page.reload();
    await page.waitForLoadState('networkidle');

    const payload = await page.evaluate(() => (window as any).buildPayload());
    const data = JSON.parse(payload);

    expect(data).toHaveProperty('macroTargets');
    expect(data).toHaveProperty('macroCatalog');
    expect(data).toHaveProperty('macroLog');
    expect(data.macroTargets).toEqual(targets);
    expect(data.macroCatalog).toEqual(catalog);
    expect(data.macroLog).toEqual(log);
  });

});
