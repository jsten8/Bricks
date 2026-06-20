import { test, expect, Page } from '@playwright/test';
import path from 'path';

const FILE = 'file://' + path.resolve(__dirname, '../bricks.html');

async function openFresh(page: Page) {
  await page.goto(FILE);
  // Clear localStorage so each test starts clean
  await page.evaluate(() => {
    localStorage.removeItem('bricks_log_v1');
    localStorage.removeItem('bricks_projects_v1');
    localStorage.removeItem('bricks_last_export');
    localStorage.removeItem('bricks_drive_file_id');
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
}

test.describe('Bricks app', () => {

  test('page loads without JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await openFresh(page);
    // Filter out expected network errors (Google APIs won't load in file:// context)
    const realErrors = errors.filter(e =>
      !e.includes('google') && !e.includes('gsi') && !e.includes('accounts')
    );
    expect(realErrors).toHaveLength(0);
  });

  test('log a brick — entry appears in history table', async ({ page }) => {
    await openFresh(page);

    // Fill date
    await page.fill('#input-date', '2026-06-20');
    // Project already selected (first option)
    await page.fill('#input-bricks', '2');
    await page.fill('#input-note', 'Test session');
    await page.click('.btn-log');

    // Toast should appear
    await expect(page.locator('#toast')).toContainText('logged');

    // Entry appears in table
    const tbody = page.locator('#log-body');
    await expect(tbody).toContainText('2026-06-20');
    await expect(tbody).toContainText('Test session');
    await expect(tbody).toContainText('2');
  });

  test('stats update after logging a brick', async ({ page }) => {
    await openFresh(page);

    await page.fill('#input-date', '2026-06-20');
    await page.fill('#input-bricks', '3');
    await page.click('.btn-log');

    await expect(page.locator('#stat-total')).toHaveText('3');
    await expect(page.locator('#stat-today')).toHaveText('3');
  });

  test('today summary updates when brick is logged for today', async ({ page }) => {
    await openFresh(page);

    const todayStr = new Date().toISOString().split('T')[0];
    await page.fill('#input-date', todayStr);
    await page.fill('#input-bricks', '1');
    await page.click('.btn-log');

    const summaryItems = page.locator('#today-summary-items');
    await expect(summaryItems).not.toContainText('Nothing logged yet');
    await expect(summaryItems).toContainText('1b');
  });

  test('edit a brick — change bricks value and save', async ({ page }) => {
    await openFresh(page);

    await page.fill('#input-date', '2026-06-20');
    await page.fill('#input-bricks', '1');
    await page.fill('#input-note', 'Original');
    await page.click('.btn-log');

    // Click edit button (pencil)
    await page.click('.btn-edit');

    // Change bricks value in edit row
    const editBricks = page.locator('[id^="edit-bricks-"]');
    await editBricks.fill('4');

    await page.click('.btn-save');

    await expect(page.locator('#toast')).toContainText('updated');
    await expect(page.locator('#log-body')).toContainText('4');
    await expect(page.locator('#stat-total')).toHaveText('4');
  });

  test('delete a brick — entry removed and stats update', async ({ page }) => {
    await openFresh(page);

    await page.fill('#input-date', '2026-06-20');
    await page.fill('#input-bricks', '2');
    await page.click('.btn-log');

    await expect(page.locator('#stat-total')).toHaveText('2');

    await page.click('.btn-delete');

    await expect(page.locator('#stat-total')).toHaveText('0');
    await expect(page.locator('#log-body')).toContainText('No bricks logged yet');
  });

  test('add a new project — appears in dropdown and project list', async ({ page }) => {
    await openFresh(page);

    // Open manage panel
    await page.click('.btn-manage-toggle');
    await expect(page.locator('#manage-projects-panel')).toBeVisible();

    await page.fill('#new-project-name', 'My New Project');
    await page.click('.manage-projects-panel .btn-log');

    await expect(page.locator('#toast')).toContainText('My New Project');

    // Appears in project select dropdown
    const options = page.locator('#input-project option');
    await expect(options.filter({ hasText: 'My New Project' })).toHaveCount(1);

    // Appears in project list
    await expect(page.locator('#project-list')).toContainText('My New Project');
  });

  test('delete a project with no entries — removed from list', async ({ page }) => {
    await openFresh(page);

    // Add a project first
    await page.click('.btn-manage-toggle');
    await page.fill('#new-project-name', 'Temp Project');
    await page.click('.manage-projects-panel .btn-log');

    // Delete it
    const deleteBtn = page.locator('#project-list .btn-delete-project').last();
    await deleteBtn.click();

    await expect(page.locator('#project-list')).not.toContainText('Temp Project');
    const options = page.locator('#input-project option');
    await expect(options.filter({ hasText: 'Temp Project' })).toHaveCount(0);
  });

  test('cannot delete a project that has entries — toast shows error', async ({ page }) => {
    await openFresh(page);

    // Log a brick under the first (default) project
    await page.fill('#input-date', '2026-06-20');
    await page.fill('#input-bricks', '1');
    // First project is pre-selected
    await page.click('.btn-log');

    // Open manage, try to delete that project
    await page.click('.btn-manage-toggle');
    const firstDeleteBtn = page.locator('#project-list .btn-delete-project').first();
    await firstDeleteBtn.click();

    await expect(page.locator('#toast')).toContainText("Can't delete");
  });

  test('chart canvas is present and has non-zero dimensions', async ({ page }) => {
    await openFresh(page);

    const canvas = page.locator('#chart-timeline');
    await expect(canvas).toBeVisible();

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });

  test('chart type toggle switches between donut and bar', async ({ page }) => {
    await openFresh(page);

    // Click Donut toggle for "By project — all time"
    await page.click('#toggle-projects-donut');
    await expect(page.locator('#toggle-projects-donut')).toHaveClass(/active/);
    await expect(page.locator('#toggle-projects-bar')).not.toHaveClass(/active/);

    // Switch back to Bar
    await page.click('#toggle-projects-bar');
    await expect(page.locator('#toggle-projects-bar')).toHaveClass(/active/);
    await expect(page.locator('#toggle-projects-donut')).not.toHaveClass(/active/);
  });

  test('localStorage key bricks_log_v1 persists after page reload', async ({ page }) => {
    await openFresh(page);

    await page.fill('#input-date', '2026-06-20');
    await page.fill('#input-bricks', '2');
    await page.fill('#input-note', 'Persist test');
    await page.click('.btn-log');

    await page.reload();
    await page.waitForLoadState('networkidle');

    const stored = await page.evaluate(() => localStorage.getItem('bricks_log_v1'));
    expect(stored).not.toBeNull();
    const entries = JSON.parse(stored!);
    expect(entries.length).toBe(1);
    expect(entries[0].note).toBe('Persist test');

    // Also visible in UI
    await expect(page.locator('#log-body')).toContainText('Persist test');
  });

  test('localStorage key bricks_projects_v1 persists after page reload', async ({ page }) => {
    await openFresh(page);

    await page.click('.btn-manage-toggle');
    await page.fill('#new-project-name', 'Persist Project');
    await page.click('.manage-projects-panel .btn-log');

    await page.reload();
    await page.waitForLoadState('networkidle');

    const stored = await page.evaluate(() => localStorage.getItem('bricks_projects_v1'));
    expect(stored).not.toBeNull();
    const projects = JSON.parse(stored!);
    expect(Object.keys(projects)).toContain('Persist Project');
  });

  test('this month stat only counts current month entries', async ({ page }) => {
    await openFresh(page);

    const thisMonth = new Date().toISOString().slice(0, 7);
    const lastMonth = new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().slice(0, 7);

    await page.fill('#input-date', `${thisMonth}-01`);
    await page.fill('#input-bricks', '3');
    await page.click('.btn-log');

    await page.fill('#input-date', `${lastMonth}-01`);
    await page.fill('#input-bricks', '5');
    await page.click('.btn-log');

    await expect(page.locator('#stat-total')).toHaveText('8');
    await expect(page.locator('#stat-month')).toHaveText('3');
  });

});
