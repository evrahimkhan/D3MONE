/**
 * @file auth.test.js
 * @description API tests for authentication guard and login endpoint, focusing on security hardening.
 */

const request = require('supertest');
const express = require('express');
const crypto = require('crypto');
const path = require('path');

// --- Mocking Dependencies ---

const mockDb = {
    maindb: {
        get: jest.fn().mockReturnThis(),
        value: jest.fn(),
        assign: jest.fn().mockReturnThis(),
        write: jest.fn()
    }
};

const mockLogManager = {
    log: jest.fn()
};

const mockClientManager = {
    getClientListOnline: jest.fn().mockReturnValue([]),
    getClientListOffline: jest.fn().mockReturnValue([]),
    getClientDataByPage: jest.fn(),
    sendCommand: jest.fn(),
    setGpsPollSpeed: jest.fn()
};

const mockApkBuilder = {
    patchAPK: jest.fn(),
    buildAPK: jest.fn()
};

// Setup Globals required by expressRoutes.js
global.CONST = {
    control_port: 1234,
    web_port: 8080,
    logTypes: { success: { name: 'SUCCESS' }, error: { name: 'ERROR' } }
};
global.db = mockDb;
global.logManager = mockLogManager;
global.clientManager = mockClientManager;
global.apkBuilder = mockApkBuilder;
global.app = express();

// Load routes after globals are set
const routes = require('../../includes/expressRoutes');
global.app.set('view engine', 'ejs');
global.app.set('views', path.join(__dirname, '../../assets/views'));
global.app.use('/', routes);

describe('Authentication & Auth Guard (Hardening)', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('isAllowed Middleware', () => {
        
        test('Scenario: Missing cookie - should redirect to /login', async () => {
            mockDb.maindb.value.mockReturnValue('valid_token_in_db');

            const response = await request(global.app).get('/');
            
            expect(response.status).toBe(302);
            expect(response.header.location).toBe('/login');
        });

        test('Scenario: Empty DB token bypass - should redirect if DB token is empty string', async () => {
            mockDb.maindb.value.mockReturnValue('');

            const response = await request(global.app)
                .get('/')
                .set('Cookie', ['loginToken=any_token']);
            
            expect(response.status).toBe(302);
            expect(response.header.location).toBe('/login');
        });

        test('Scenario: Invalid token - should clear cookie and redirect', async () => {
            mockDb.maindb.value.mockReturnValue('valid_token');

            const response = await request(global.app)
                .get('/')
                .set('Cookie', ['loginToken=wrong_token']);
            
            expect(response.status).toBe(302);
            expect(response.header.location).toBe('/login');
            
            // Verification of cookie clearing
            const setCookie = response.header['set-cookie'] || [];
            expect(setCookie.some(c => c.includes('token=;'))).toBe(true);
        });

        test('Scenario: Valid token - should allow access (200 OK)', async () => {
            mockDb.maindb.value.mockReturnValue('valid_token');

            const response = await request(global.app)
                .get('/')
                .set('Cookie', ['loginToken=valid_token']);
            
            expect(response.status).toBe(200);
        });
    });

    describe('POST /login', () => {

        test('Scenario: Partial data POST - missing password', async () => {
            const response = await request(global.app)
                .post('/login')
                .send({ username: 'admin' });
            
            expect(response.status).toBe(302);
            expect(response.header.location).toBe('/login?e=missingData');
        });

        test('Scenario: Invalid credentials', async () => {
            const password = 'real_password';
            const hashedPw = crypto.createHash('md5').update(password).digest("hex");

            mockDb.maindb.value
                .mockReturnValueOnce('admin')    // rUsername
                .mockReturnValueOnce(hashedPw); // rPassword

            const response = await request(global.app)
                .post('/login')
                .send({ username: 'admin', password: 'wrong_password' });
            
            expect(response.status).toBe(302);
            expect(response.header.location).toBe('/login?e=badLogin');
        });

        test('Scenario: Successful login - session creation and token set', async () => {
            const username = 'admin';
            const password = 'password123';
            const hashedPw = crypto.createHash('md5').update(password).digest("hex");

            mockDb.maindb.value
                .mockReturnValueOnce(username)
                .mockReturnValueOnce(hashedPw);

            const response = await request(global.app)
                .post('/login')
                .send({ username, password });
            
            expect(response.status).toBe(302);
            expect(response.header.location).toBe('/');
            
            const setCookie = response.header['set-cookie'][0];
            expect(setCookie).toMatch(/loginToken=[a-f0-9]{32}/);

            expect(mockDb.maindb.assign).toHaveBeenCalledWith(expect.objectContaining({
                loginToken: expect.any(String)
            }));
            expect(mockDb.maindb.write).toHaveBeenCalled();
        });
    });
});
