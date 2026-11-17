import { expect, test, type Page } from '@playwright/test';

const userMessages = (page: Page) => page.getByRole('article', { name: 'Your message', exact: true });
const assistantMessages = (page: Page) => page.getByRole('article', { name: 'AdaptiveAI response', exact: true });
const demoRoute = '**/api/v1/demo/chat';

async function sendMessage(page: Page, content: string) {
  await page.getByRole('textbox', { name: 'Message AdaptiveAI' }).fill(content);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
}

async function overrideScenario(page: Page, scenario: 'error' | 'slow') {
  // Keep development controls out of the interface while exercising the real
  // Worker's deterministic failure and delay behavior through the test transport.
  await page.route(demoRoute, async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    await route.continue({ postData: JSON.stringify({ ...body, scenario }) });
  });
}

test('a message reaches the real Worker and displays its labeled mock response', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByText('Demo replies · Chats clear on refresh.', { exact: true })).toBeVisible();
  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/v1/demo/chat') && response.request().method() === 'POST');
  await sendMessage(page, 'How does memory work?');
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const body = await response.json() as { mode: string; model: string; message: { content: string } };
  expect(body.mode).toBe('mock');
  expect(body.model).toBe('adaptiveai-mock-v1');
  await expect(userMessages(page)).toHaveCount(1);
  await expect(assistantMessages(page)).toHaveCount(1);
  await expect(assistantMessages(page)).toContainText(body.message.content);
  await expect(page.getByRole('status').filter({ hasText: 'AdaptiveAI replied.' })).toHaveCount(1);
  await expect(page.getByRole('textbox', { name: 'Message AdaptiveAI' })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Stop response', exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('conversation.png'), fullPage: true, animations: 'disabled' });
});

test('a failed response retries the existing turn without duplicating the message', async ({ page }) => {
  await page.goto('/');
  await overrideScenario(page, 'error');
  await sendMessage(page, 'Explain the architecture');
  await expect(page.getByRole('button', { name: 'Retry response', exact: true })).toBeVisible();
  await expect(userMessages(page)).toHaveCount(1);
  await expect(assistantMessages(page)).toHaveCount(0);

  await page.unroute(demoRoute);
  const retry = page.getByRole('button', { name: 'Retry response', exact: true });
  await retry.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Message AdaptiveAI' })).toBeFocused();
  await expect(assistantMessages(page)).toHaveCount(1);
  await expect(userMessages(page)).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Retry response', exact: true })).toHaveCount(0);
});

test('stopping a slow request aborts its fetch and permits a clean retry', async ({ page }) => {
  await page.goto('/');
  await overrideScenario(page, 'slow');
  const requestPromise = page.waitForRequest((request) =>
    request.url().endsWith('/api/v1/demo/chat') && request.method() === 'POST');
  await sendMessage(page, 'Explain evaluation');
  const request = await requestPromise;
  const failurePromise = page.waitForEvent('requestfailed', (failedRequest) => failedRequest === request);
  await page.getByRole('button', { name: 'Stop response', exact: true }).click();
  await failurePromise;
  await expect(page.getByRole('button', { name: 'Retry response', exact: true })).toBeVisible();
  await expect(assistantMessages(page)).toHaveCount(0);

  await page.unroute(demoRoute);
  await page.getByRole('button', { name: 'Retry response', exact: true }).click();
  await expect(assistantMessages(page)).toHaveCount(1);
  await expect(userMessages(page)).toHaveCount(1);
});

test('session conversations stay separate and disappear after reload', async ({ page }) => {
  await page.goto('/');
  await sendMessage(page, 'Explain memory');
  await expect(assistantMessages(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'New chat', exact: true }).first().click();
  await expect(userMessages(page)).toHaveCount(0);
  await sendMessage(page, 'Hello');
  await expect(assistantMessages(page)).toHaveCount(1);

  await page.getByRole('button', { name: 'Open sidebar', exact: true }).click();
  await page.getByRole('button', { name: 'Open conversation: Explain memory', exact: true }).click();
  await expect(userMessages(page)).toHaveCount(1);
  await expect(userMessages(page)).toContainText('Explain memory');
  await expect(userMessages(page)).not.toContainText('Hello');

  await page.reload();
  await expect(userMessages(page)).toHaveCount(0);
  await expect(assistantMessages(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Open sidebar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open conversation: Explain memory', exact: true })).toHaveCount(0);
});

test('message HTML is rendered as text and cannot run a script', async ({ page }) => {
  let dialogCount = 0;
  page.on('dialog', async (dialog) => {
    dialogCount += 1;
    await dialog.dismiss();
  });
  await page.goto('/');
  const content = '<img src=x onerror=alert(1)> Hello';
  await sendMessage(page, content);
  await expect(assistantMessages(page)).toHaveCount(1);
  await expect(userMessages(page)).toContainText(content);
  await expect(userMessages(page).locator('img')).toHaveCount(0);
  expect(dialogCount).toBe(0);
});

test('Shift+Enter keeps a line break and Enter sends one complete message', async ({ page }) => {
  await page.goto('/');
  const composer = page.getByRole('textbox', { name: 'Message AdaptiveAI' });
  await composer.fill('Hello');
  await composer.press('Shift+Enter');
  await composer.pressSequentially('Explain memory');
  await expect(composer).toHaveValue('Hello\nExplain memory');
  await expect(userMessages(page)).toHaveCount(0);
  await composer.press('Enter');
  await expect(assistantMessages(page)).toHaveCount(1);
  await expect(userMessages(page)).toHaveCount(1);
  await expect(userMessages(page)).toContainText('Hello\nExplain memory');
});

test('a keyboard starter returns focus to the composer after its button disappears', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Memory', exact: true }).focus();
  await page.keyboard.press('Enter');
  const composer = page.getByRole('textbox', { name: 'Message AdaptiveAI' });
  await expect(composer).toBeFocused();
  await expect(userMessages(page)).toHaveCount(1);
  await expect(assistantMessages(page)).toHaveCount(1);
  await expect(composer).toBeFocused();
});

test('a late response from a cancelled conversation cannot enter the new chat', async ({ page }) => {
  // Deliberately emulate a transport that finishes despite abort, exercising
  // the UI's request-identity guard independently of browser fetch cancellation.
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    const harness = window as Window & { releaseDelayedDemo?: () => void };
    let holdFirstReply = true;
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith('/api/v1/demo/chat') && holdFirstReply) {
        holdFirstReply = false;
        const options = { ...init };
        delete options.signal;
        const response = await nativeFetch(input, options);
        await new Promise<void>((resolve) => { harness.releaseDelayedDemo = resolve; });
        return response;
      }
      return nativeFetch(input, init);
    };
  });
  await page.goto('/');
  await sendMessage(page, 'Explain memory');
  await page.waitForFunction(() => typeof (window as Window & { releaseDelayedDemo?: () => void }).releaseDelayedDemo === 'function');
  await page.getByRole('button', { name: 'New chat', exact: true }).first().click();
  await sendMessage(page, 'Explain the architecture');
  await expect(assistantMessages(page)).toHaveCount(1);
  await expect(assistantMessages(page)).toContainText('planned stack');
  await page.evaluate(async () => {
    (window as Window & { releaseDelayedDemo?: () => void }).releaseDelayedDemo?.();
    // Allow the released promise and React state updates to cross a paint.
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await expect(assistantMessages(page)).toHaveCount(1);
  await expect(userMessages(page)).toContainText('Explain the architecture');
  await expect(assistantMessages(page)).toContainText('planned stack');
  await page.getByRole('button', { name: 'Open sidebar', exact: true }).click();
  await page.getByRole('button', { name: 'Open conversation: Explain memory', exact: true }).click();
  await expect(assistantMessages(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retry response', exact: true })).toBeVisible();
});

test('reduced motion keeps the composer and dialogs usable without horizontal overflow', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const composer = page.getByRole('textbox', { name: 'Message AdaptiveAI' });
  await expect(composer).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('welcome.png'), fullPage: true, animations: 'disabled' });
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
  await composer.fill('   ');
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Open sidebar', exact: true }).click();
  const history = page.getByRole('dialog', { name: 'Conversations', exact: true });
  await expect(history).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(history).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  await sendMessage(page, 'Hello');
  await expect(assistantMessages(page)).toHaveCount(1);
});
