import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const origin = 'http://127.0.0.1:8790';
const sessions = new WeakMap();
function recording(seconds = 36) {
  const rate = 8000, samples = rate * seconds, bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) bytes.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 220 / rate) * (1000 + 900 * Math.sin(i / rate))), 44 + i * 2);
  return bytes;
}
async function post(request, path, data) {
  const response = await request.post(path, { headers: { origin, cookie: sessions.get(request) || '' }, data });
  if (path === '/api/admin-login' && response.ok()) sessions.set(request, response.headers()['set-cookie'].split(';')[0]);
  return response;
}

test('a songwriter publishes, guests share and comment, and approval protects the public journal', async ({ request, page, browser }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  expect((await request.get('/api/devotionals')).status()).toBe(200);
  expect((await post(request, '/api/admin-entry-create', {})).status()).toBe(401);
  expect((await request.post('/api/admin-login', { headers: { origin: 'https://attacker.example' }, data: { password: 'test-password-only' } })).status()).toBe(403);
  expect((await post(request, '/api/admin-login', { password: 'wrong' })).status()).toBe(401);
  const login = await post(request, '/api/admin-login', { password: 'test-password-only' });
  expect(login.status()).toBe(200);
  expect(login.headers()['set-cookie']).toContain('HttpOnly; Secure; SameSite=Lax');
  expect((await request.post('/api/upload-audio?filename=fake.mp3', { headers: { origin, cookie: sessions.get(request), 'content-type': 'audio/mpeg' }, data: 'Not an MP3 file' })).status()).toBe(415);
  const upload = await request.post('/api/upload-audio?filename=Morning%20Mercies.wav&entryDate=2026-10-03', { headers: { origin, cookie: sessions.get(request), 'content-type': 'audio/wav' }, data: recording() });
  expect(upload.status()).toBe(200);
  const media = await upload.json();
  const id = randomUUID();
  const entry = { id, title: 'Morning Mercies', entry_date: '2026-10-03', scripture: 'C major | 100 BPM', lyrics: 'Verse 1\nA new mercy with the morning light.', notes: 'A small melody from the kitchen table.', audio_url: media.publicUrl, art_url: null };
  expect((await post(request, '/api/admin-entry-create', { ...entry, audio_url: 'javascript:alert(1)' })).status()).toBe(400);
  const saved = await post(request, '/api/admin-entry-create', entry);
  expect(saved.status()).toBe(200);
  expect((await saved.json()).entry.notes).toBe(entry.notes);
  expect((await post(request, '/api/admin-entry-create', entry)).status()).toBe(200);
  expect((await (await request.get('/api/devotionals')).json()).filter(song => song.id === id)).toHaveLength(1);

  await page.goto('/?song=' + id);
  await expect(page.locator('#pTitle')).toHaveText('Morning Mercies');
  await expect(page.locator('#songNoteText')).toHaveText(entry.notes);
  await expect(page.locator('#tTot')).toHaveText('0:36');
  const seek = page.getByRole('slider', { name: 'Song playback position' });
  await seek.focus(); await page.keyboard.press('End');
  await expect(seek).toHaveAttribute('aria-valuenow', '36.00');
  await expect(page.locator('#tonearmArm')).toHaveAttribute('style', /36.00deg/);
  await page.getByTitle('Rewind 15 seconds').click();
  await expect(seek).toHaveAttribute('aria-valuenow', '21.00');
  await seek.focus(); await page.keyboard.press('Home');
  await expect(page.locator('#tonearmArm')).toHaveAttribute('style', /9.00deg/);
  await page.getByTitle('Open lyrics in a modal').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();

  await page.getByRole('button', { name: 'Add a listening note' }).click();
  await seek.focus(); await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: 'Use current moment' }).click();
  await expect(page.locator('#feedbackTime')).toHaveText('0:05');
  await page.getByLabel('Your name').fill('Listener');
  await page.getByLabel('Your listening note').fill('The melody here feels hopeful.');
  await page.getByRole('button', { name: 'Send to the songwriter' }).click();
  await expect(page.locator('#feedbackStatus')).toContainText('not public yet');
  const publicPending = await request.get('/api/feedback?entryId=' + id);
  expect((await publicPending.json()).feedback).toHaveLength(0);
  const queue = (await (await request.get('/api/admin-feedback', { headers: { cookie: sessions.get(request) } })).json()).feedback;
  expect(queue).toHaveLength(1);
  expect(queue[0].timestamp_seconds).toBe(5);
  const moderator = await browser.newContext();
  const moderatorPage = await moderator.newPage();
  await moderatorPage.goto('/');
  await moderatorPage.getByRole('button', { name: 'Songwriter login' }).click();
  await moderatorPage.getByLabel('Password', { exact: true }).fill('test-password-only');
  await moderatorPage.getByRole('button', { name: 'Enter the writing room' }).click();
  await expect(moderatorPage.locator('#moderationList')).toContainText('Awaiting approval');
  await moderatorPage.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(moderatorPage.locator('#moderationList')).toContainText('Published');
  await moderator.close();
  await page.reload();
  await expect(page.locator('#feedbackList')).toContainText('The melody here feels hopeful.');
  await page.getByRole('button', { name: 'Jump to 0:05' }).click();
  await expect(seek).toHaveAttribute('aria-valuenow', '5.00');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy song link' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(origin + '/?song=' + id);
  await page.getByLabel('Find a song').fill('nothing-matches');
  await expect(page.locator('#archiveGrid')).toContainText('No songs match');
  await page.getByLabel('Find a song').fill('');

  await page.getByRole('button', { name: 'Songwriter login' }).click();
  await page.getByLabel('Password', { exact: true }).fill('test-password-only');
  await page.getByRole('button', { name: 'Enter the writing room' }).click();
  await expect(page.locator('#view-admin-upload')).toBeVisible();
  await page.locator('#adminEntryList').getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Notes').fill('An edited note from the songwriter.');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.locator('#upStatus')).toBeEmpty();
  await expect(page.locator('#view-admin-upload')).toBeVisible();
  await page.getByRole('button', { name: 'Song library' }).click();
  await expect(page.locator('#songNoteText')).toHaveText('An edited note from the songwriter.');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.locator('#view-archive').evaluate(element => getComputedStyle(element).opacity)).toBe('1');
  await page.locator('header').scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.archive-botanical')).toBeVisible();
  expect((await page.locator('.archive-botanical').boundingBox()).width).toBeGreaterThanOrEqual(220);
  await page.screenshot({ path: 'test-results/mobile-journal.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/desktop-journal.png', fullPage: true });

  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto('/?song=' + id);
  await expect(guestPage.locator('#pTitle')).toHaveText('Morning Mercies');
  expect((await guest.request.get('/api/admin-feedback')).status()).toBe(401);
  await guest.close();

  await page.getByRole('button', { name: 'Writing room' }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#moderationList').getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.locator('#moderationList')).toContainText('All quiet here');
  await page.locator('#adminEntryList').getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, Continue' }).click();
  await page.getByRole('button', { name: 'Delete Forever' }).click();
  await expect(page.locator('#adminEntryList')).toContainText('No published entries yet');
  expect((await (await request.get('/api/devotionals')).json())).toHaveLength(0);
  await post(request, '/api/admin-maintenance', {});
  await expect.poll(async () => (await request.get(new URL(media.publicUrl).pathname)).status()).toBe(404);
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('button', { name: 'Songwriter login' })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('feedback throttling and missing-song states are explicit', async ({ request, page }) => {
  const id = randomUUID();
  const login = await post(request, '/api/admin-login', { password: 'test-password-only' });
  expect(login.status()).toBe(200);
  const payload = { id, title: 'Another melody', entry_date: '2026-10-03', lyrics: '', notes: '', scripture: '', audio_url: null, art_url: null };
  expect((await post(request, '/api/admin-entry-create', payload)).status()).toBe(200);
  const statuses = [];
  for (let i = 0; i < 6; i++) statuses.push((await post(request, '/api/feedback', { entry_id: id, comment: 'A listening note.', timestamp_seconds: 0 })).status());
  expect(statuses).toContain(429);
  await page.goto('/?song=' + randomUUID());
  await expect(page.locator('#toast')).toContainText('no longer available');
  await expect(page.locator('#playerStatus')).toContainText('No recording');
  await page.route('**/api/devotionals', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"archive-unavailable"}' }));
  await page.reload();
  await expect(page.locator('#archiveGrid')).toContainText('could not be reached');
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
});

test('a failed publish keeps the form and reuses uploads on retry, including Unicode filenames', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Songwriter login' }).click();
  await page.getByLabel('Password', { exact: true }).fill('test-password-only');
  await page.getByRole('button', { name: 'Enter the writing room' }).click();
  await page.getByLabel('Song Title', { exact: true }).fill('Quiet Mercy');
  await page.getByLabel('Entry Date').fill('2026-10-03');
  await page.getByLabel('Lyrics', { exact: true }).fill('Verse 1\nA quiet mercy is here.');
  await page.getByLabel('MP3 / Audio File', { exact: true }).setInputFiles({ name: 'Mercy’s 🎵.wav', mimeType: 'audio/wav', buffer: recording() });
  let audioUploads = 0;
  page.on('request', req => { if (req.url().includes('/api/upload-audio')) audioUploads++; });
  await page.route('**/api/admin-entry-create', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"service-unavailable"}' }));
  await page.getByRole('button', { name: 'Publish Song', exact: true }).click();
  await expect(page.locator('#upStatus')).toContainText('Your form is still here');
  await expect(page.getByLabel('Song Title', { exact: true })).toHaveValue('Quiet Mercy');
  await page.unroute('**/api/admin-entry-create');
  await page.getByRole('button', { name: 'Publish Song', exact: true }).click();
  await expect(page.getByLabel('Song Title', { exact: true })).toBeEmpty();
  await expect(page.locator('#adminEntryList')).toContainText('Quiet Mercy');
  expect(audioUploads).toBe(1);
  const entries = await (await request.get('/api/devotionals')).json();
  expect(entries.filter(entry => entry.title === 'Quiet Mercy')).toHaveLength(1);
});

test('the painted journal preserves substantial artwork and usable layouts on narrow screens', async ({ page, request }) => {
  expect((await post(request, '/api/admin-login', { password: 'test-password-only' })).status()).toBe(200);
  const upload = await request.post('/api/upload-audio?filename=Painted%20Melodies.wav', { headers: { origin, cookie: sessions.get(request), 'content-type': 'audio/wav' }, data: recording() });
  expect(upload.status()).toBe(200);
  expect((await post(request, '/api/admin-entry-create', { id: randomUUID(), title: 'Painted Melodies', entry_date: '2026-10-04', lyrics: 'A melody on a new page.', audio_url: (await upload.json()).publicUrl })).status()).toBe(200);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const mount = page.locator('.tonearm-pivot');
  await expect(mount).toHaveCSS('background-image', /painted-pivot\.svg/);
  await expect(mount).toHaveCSS('width', '12px');
  await expect(mount).toHaveCSS('height', '12px');
  await expect(mount).toHaveCSS('top', '3px');
  await expect(mount).toHaveCSS('right', '6px');
  await expect(page.locator('#tonearmArm')).toHaveCSS('transform-origin', '2px 6px');
  await page.locator('.tt-scene').screenshot({ path: 'test-results/hand-painted-player.png' });
  await page.screenshot({ path: 'test-results/watercolor-journal-desktop.png' });
  await page.setViewportSize({ width: 320, height: 800 });
  await expect(page.locator('.intro-margin img')).toBeVisible();
  expect((await page.locator('.intro-margin img').boundingBox()).width).toBeGreaterThanOrEqual(250);
  expect((await page.locator('.archive-botanical').boundingBox()).width).toBeGreaterThanOrEqual(220);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const controls = await page.locator('.transport-row button').evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, height: rect.height };
  }));
  expect(controls.every(rect => rect.left >= 0 && rect.right <= 320 && rect.height >= 40)).toBe(true);

  await page.getByRole('button', { name: 'Add a listening note' }).click();
  await expect(page.getByLabel('Your listening note')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Lyrics ↗' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect((await page.getByRole('dialog').boundingBox()).width).toBeLessThanOrEqual(320);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Songwriter login' }).click();
  await expect(page.locator('.gate-botanical')).toBeVisible();
  await page.getByLabel('Password', { exact: true }).fill('test-password-only');
  await page.getByRole('button', { name: 'Enter the writing room' }).click();
  await expect(page.locator('.writing-botanical')).toBeVisible();
  await expect.poll(() => page.locator('#view-admin-upload').evaluate(element => getComputedStyle(element).opacity)).toBe('1');
  await expect(page.locator('#toast')).not.toHaveClass(/show/);
  expect((await page.locator('.writing-botanical').boundingBox()).width).toBeGreaterThanOrEqual(250);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('header').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/watercolor-writing-room-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.screenshot({ path: 'test-results/mobile-writing-room.png', fullPage: true });
  await page.getByRole('button', { name: 'Song library' }).click();
  await expect.poll(() => page.locator('#view-archive').evaluate(element => getComputedStyle(element).opacity)).toBe('1');
  await page.locator('header').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/mobile-watercolor-journal.png', fullPage: true });
});

test('songbook selection, hover and keyboard focus use distinct petal-blue highlights', async ({ request, page }) => {
  expect((await post(request, '/api/admin-login', { password: 'test-password-only' })).status()).toBe(200);
  const firstId = randomUUID(), secondId = randomUUID();
  for (const [id, title] of [[firstId, 'A New Mercy'], [secondId, 'Still and Quiet']]) {
    expect((await post(request, '/api/admin-entry-create', { id, title, entry_date: '2026-10-04', scripture: 'C major | 100 BPM', lyrics: '' })).status()).toBe(200);
  }
  await page.goto('/?song=' + firstId);
  const selected = page.locator('#card-' + firstId), other = page.locator('#card-' + secondId);
  await expect(selected).toHaveClass(/now-playing/);
  await expect(selected).toHaveCSS('background-color', 'rgb(215, 230, 239)');
  await expect(selected.locator('.a-play')).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(selected.locator('.a-status')).toHaveCSS('background-color', 'rgb(204, 223, 233)');
  await expect(selected.locator('.a-status')).toHaveCSS('color', 'rgb(63, 98, 119)');
  await selected.hover();
  await expect(selected).toHaveCSS('background-color', 'rgb(215, 230, 239)');
  await other.hover();
  await expect(other).toHaveCSS('background-color', 'rgb(234, 241, 245)');
  await expect(other.locator('.a-play')).toHaveCSS('color', 'rgb(63, 98, 119)');
  await page.locator('#archiveGrid').screenshot({ path: 'test-results/petal-blue-songbook.png' });
  await page.getByLabel('Find a song').hover();
  await selected.focus();
  await page.keyboard.press('ArrowDown');
  await other.focus();
  await expect(other).toHaveCSS('background-color', 'rgb(234, 241, 245)');
  await expect(other).toHaveCSS('outline-color', 'rgb(63, 98, 119)');
  await other.press('Enter');
  await expect(other).toHaveClass(/now-playing/);
  await expect(selected).not.toHaveClass(/now-playing/);
  await expect(page.locator('#pTitle')).toHaveText('Still and Quiet');
});
