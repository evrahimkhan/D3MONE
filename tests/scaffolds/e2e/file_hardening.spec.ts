import { test, expect } from '@playwright/test';
import io from 'socket.io-client';

/**
 * E2E tests for L3MON security hardening patches.
 * Focuses on file upload sanitization, resource exhaustion, and UI consistency.
 */
test.describe('Security Hardening E2E Tests', () => {

    test.beforeEach(async ({ page }) => {
        // Login to admin panel
        await page.goto('/login');
        await page.fill('input[name="username"]', 'admin');
        await page.fill('input[name="password"]', 'password'); // Default password
        await page.click('button[type="submit"]');
        await expect(page).toHaveURL('/');
    });

    test('Target 1: Malicious File Upload (Sanitization/Path Traversal)', async ({ page }) => {
        const deviceID = 'test-device-traversal';
        
        // 1. Connect Mock Device via Socket.io to the control port
        const socket = io('http://localhost:22565', {
            query: {
                id: deviceID,
                model: 'MockDevice',
                manf: 'MockManf',
                release: '10'
            }
        });

        // 2. Navigate to Files page
        await page.goto(`/manage/${deviceID}/files`);

        // 3. Setup mock response for traversal attempt
        socket.on('order', (data) => {
            if (data.type === '0xFI' && data.action === 'dl') {
                // Simulate a malicious device trying to overwrite root files
                socket.emit('0xFI', {
                    type: 'download',
                    name: '../../root.js',
                    buffer: Buffer.from('console.log("traversed")')
                });
            }
        });

        // 4. Trigger File Download from UI
        // Select first file's download button (has download icon)
        await page.locator('table tbody tr').first().locator('button:has(i.download)').click();

        // 5. Verify Graceful Handling
        // Check for success notification in snackbar
        await expect(page.locator('.snackbar')).toBeVisible();
        await expect(page.locator('.snackbar')).toContainText('Downloading File');

        // 6. Verify safe storage in Downloads page
        await page.goto(`/manage/${deviceID}/downloads`);
        // The original name should be stored in the DB, but server-side path should be hashed
        const downloadRow = page.locator('table tbody tr').filter({ hasText: '../../root.js' });
        await expect(downloadRow).toBeVisible();
        
        socket.close();
    });

    test('Target 2: Large File Upload (Resource Exhaustion)', async ({ page }) => {
        const deviceID = 'test-device-exhaust';
        const socket = io('http://localhost:22565', { query: { id: deviceID } });

        await page.goto(`/manage/${deviceID}/files`);

        socket.on('order', (data) => {
            if (data.type === '0xFI' && data.action === 'dl') {
                // Send 200MB buffer - Should exceed 100MB limit
                const largeBuffer = Buffer.alloc(200 * 1024 * 1024);
                socket.emit('0xFI', {
                    type: 'download',
                    name: 'too-large.dat',
                    buffer: largeBuffer
                });
            }
        });

        await page.locator('table tbody tr').first().locator('button:has(i.download)').click();

        // Verify that the file does NOT appear in downloads (rejected by server)
        await page.goto(`/manage/${deviceID}/downloads`);
        await expect(page.locator('table tbody')).not.toContainText('too-large.dat');
        
        socket.close();
    });

    test('Target 3: Multi-WiFi Update UI (Replace not Merge)', async ({ page }) => {
        const deviceID = 'test-device-wifi';
        const socket = io('http://localhost:22565', { query: { id: deviceID } });

        await page.goto(`/manage/${deviceID}/wifi`);

        // First Update: 2 networks
        socket.once('order', (data) => {
            if (data.type === '0xWI') {
                socket.emit('0xWI', {
                    networks: [
                        { SSID: 'Wifi1', BSSID: 'AA:BB:CC:11:22:33' },
                        { SSID: 'Wifi2', BSSID: 'AA:BB:CC:44:55:66' }
                    ]
                });
            }
        });

        await page.click('button:has-text(\"Update\")');
        // Wait for page reload triggered by main.js
        await page.waitForNavigation(); 

        // Verify 2 rows in Current table
        const currentTable = page.locator('h3:has-text(\"Current\") + table');
        await expect(currentTable.locator('tbody tr')).toHaveCount(2);

        // Second Update: 3 different networks
        socket.once('order', (data) => {
            if (data.type === '0xWI') {
                socket.emit('0xWI', {
                    networks: [
                        { SSID: 'Wifi3', BSSID: '11:22:33:AA:BB:CC' },
                        { SSID: 'Wifi4', BSSID: '44:55:66:AA:BB:CC' },
                        { SSID: 'Wifi5', BSSID: '77:88:99:AA:BB:CC' }
                    ]
                });
            }
        });

        await page.click('button:has-text(\"Update\")');
        await page.waitForNavigation();

        // Verify exactly 3 rows (indicating replacement, not merge)
        await expect(currentTable.locator('tbody tr')).toHaveCount(3);
        await expect(currentTable).toContainText('Wifi3');
        await expect(currentTable).not.toContainText('Wifi1');

        socket.close();
    });
});
