import { test, expect } from './studioTest';
import { createDefaultProject } from '../src/lib/projectModel.js';

test('the 9/27 control, Layout identity, and narrow Projects refinements stay usable', async ({ page }) => {
  const longProjectName = 'Moonlit mandala installation with the northern canopy and outer ring';
  const project = createDefaultProject();
  project.id = 'lwproj-long-mobile-name';
  project.name = longProjectName;

  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(savedProject => {
    localStorage.setItem('lw_project_library_v1', JSON.stringify({
      version: 1,
      records: [{
        id: 'long-mobile-record',
        name: savedProject.name,
        createdAt: 1,
        updatedAt: 1,
        projectVersion: savedProject.version,
        project: savedProject,
      }],
    }));
  }, project);
  await page.goto('/#screen=layout', { waitUntil: 'domcontentloaded' });

  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Projects' });
  const projectRow = dialog.getByTestId('browser-project-row');
  const projectName = projectRow.locator(':scope > span');
  await expect(projectName).toHaveText(longProjectName);
  const wrapping = await projectName.evaluate(element => ({
    whiteSpace: getComputedStyle(element).whiteSpace,
    overflowWrap: getComputedStyle(element).overflowWrap,
    scrollsHorizontally: element.scrollWidth > element.clientWidth,
  }));
  expect(wrapping).toEqual({ whiteSpace: 'normal', overflowWrap: 'anywhere', scrollsHorizontally: false });
  const nameBox = await projectName.boundingBox();
  const actionsBox = await projectRow.locator('.projects-row-actions').boundingBox();
  expect(nameBox).not.toBeNull();
  expect(actionsBox).not.toBeNull();
  expect(actionsBox!.y).toBeGreaterThanOrEqual(nameBox!.y + nameBox!.height);
  const deleteButton = projectRow.getByRole('button', { name: `Delete ${longProjectName}` });
  await expect(deleteButton).toBeVisible();
  const deleteStyle = await deleteButton.evaluate(element => ({
    color: getComputedStyle(element).color,
    boxShadow: getComputedStyle(element).boxShadow,
  }));
  expect(deleteStyle.color).not.toBe('');
  expect(deleteStyle.boxShadow).toContain('inset');
  await page.screenshot({ path: '/tmp/lightweaver-projects-390.png', fullPage: true });
  await page.keyboard.press('Escape');

  await page.getByTestId('layout-primitive-picker').getByRole('button', { name: 'Create line' }).click();
  await page.getByTestId('layout-specs-trigger').click();
  const tools = page.getByTestId('advanced-installation-tools');
  if (!await tools.evaluate((element: HTMLDetailsElement) => element.open)) {
    await tools.locator(':scope > summary').click();
  }
  const chipset = page.getByTestId('project-led-chipset');
  const select = chipset.getByTestId('led-chipset-select');
  await expect(select.locator('option:checked')).toHaveText('WS2815 · 12V');
  const hintId = await select.getAttribute('aria-describedby');
  expect(hintId).toBeTruthy();
  const hint = chipset.getByTestId('led-chipset-hint');
  await expect(hint).toContainText('backup');
  await expect(select).toHaveAttribute('aria-describedby', await hint.getAttribute('id'));

  const layoutChrome = await page.evaluate(() => {
    const group = document.querySelector('.la .toolbar .tb-group')!;
    const control = group.querySelector('.tb-btn')!;
    const groupStyle = getComputedStyle(group);
    const controlStyle = getComputedStyle(control);
    return {
      groupBorder: groupStyle.borderTopStyle,
      groupBackground: groupStyle.backgroundColor,
      controlBorderWidth: controlStyle.borderTopWidth,
      controlBorderStyle: controlStyle.borderTopStyle,
      neutralEdgeToken: getComputedStyle(document.documentElement).getPropertyValue('--control-edge').trim(),
    };
  });
  expect(layoutChrome).toMatchObject({
    groupBorder: 'none',
    groupBackground: 'rgba(0, 0, 0, 0)',
    controlBorderWidth: '1px',
    controlBorderStyle: 'solid',
  });
  expect(layoutChrome.neutralEdgeToken).not.toBe('');
  const toolbarControl = page.locator('.la .toolbar .tb-btn:not(:disabled)').first();
  const restingFill = await toolbarControl.evaluate(element => getComputedStyle(element).backgroundColor);
  await toolbarControl.hover();
  const hoverFill = await toolbarControl.evaluate(element => getComputedStyle(element).backgroundColor);
  expect(hoverFill).not.toBe(restingFill);
  await page.evaluate(() => {
    const primary = document.createElement('button');
    primary.className = 'btn primary';
    primary.dataset.testid = 'refinement-primary-control';
    document.body.append(primary);
    const disabled = document.createElement('button');
    disabled.className = 'tb-btn';
    disabled.disabled = true;
    disabled.dataset.testid = 'refinement-disabled-toolbar-control';
    document.body.append(disabled);
  });
  const primary = page.getByTestId('refinement-primary-control');
  const normalPrimary = await primary.evaluate(element => {
    const style = getComputedStyle(element);
    return { borderColor: style.borderColor, color: style.color, background: style.backgroundColor };
  });
  await primary.hover();
  const hoverPrimary = await primary.evaluate(element => ({
    borderColor: getComputedStyle(element).borderColor,
    color: getComputedStyle(element).color,
    background: getComputedStyle(element).backgroundColor,
  }));
  expect(hoverPrimary.borderColor).toBe(normalPrimary.borderColor);
  expect(hoverPrimary.color).toBe(normalPrimary.color);
  expect(hoverPrimary.background).not.toBe(normalPrimary.background);
  await expect(page.getByTestId('refinement-disabled-toolbar-control')).toHaveCSS('opacity', '1');
  const darkSelectedEdge = await page.locator('html').evaluate(element =>
    getComputedStyle(element).getPropertyValue('--control-selected-edge').trim());
  await page.locator('html').evaluate(element => element.setAttribute('data-theme', 'daylight'));
  const daylightTokens = await page.locator('html').evaluate(element => {
    const style = getComputedStyle(element);
    return {
      neutralEdge: style.getPropertyValue('--control-edge').trim(),
      selectedEdge: style.getPropertyValue('--control-selected-edge').trim(),
      focusRing: style.getPropertyValue('--focus-ring').trim(),
    };
  });
  expect(daylightTokens.neutralEdge).not.toBe(layoutChrome.neutralEdgeToken);
  expect(daylightTokens.selectedEdge).not.toBe(darkSelectedEdge);
  expect(daylightTokens.focusRing).not.toBe('');
  await page.locator('html').evaluate(element => element.removeAttribute('data-theme'));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: '/tmp/lightweaver-layout-1440.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/lightweaver-layout-390.png', fullPage: true });
});
