const Clients = require('../../includes/clientManager');
const CONST = require('../../includes/const');
const fs = require('fs');
const path = require('path');

// Mock dependencies
jest.mock('fs');
jest.mock('../../includes/logManager', () => ({
    log: jest.fn()
}));

describe('clientManager Security Hardening Tests', () => {
    let clients;
    let mockDb;
    let mockMainDb;
    let mockClientDbInstance;

    beforeEach(() => {
        mockMainDb = {
            get: jest.fn().mockReturnThis(),
            find: jest.fn().mockReturnThis(),
            push: jest.fn().mockReturnThis(),
            assign: jest.fn().mockReturnThis(),
            write: jest.fn().mockReturnThis(),
            value: jest.fn(),
            remove: jest.fn().mockReturnThis()
        };

        mockClientDbInstance = {
            get: jest.fn().mockReturnThis(),
            find: jest.fn().mockReturnThis(),
            push: jest.fn().mockReturnThis(),
            assign: jest.fn().mockReturnThis(),
            write: jest.fn().mockReturnThis(),
            value: jest.fn(),
            remove: jest.fn().mockReturnThis(),
            set: jest.fn().mockReturnThis()
        };

        mockDb = {
            maindb: mockMainDb,
            clientdb: jest.fn().mockImplementation(() => mockClientDbInstance)
        };

        clients = new Clients(mockDb);
    });

    describe('checkCorrectParams', () => {
        test('should return error if payload is missing', (done) => {
            clients.checkCorrectParams('0xSM', null, (error) => {
                expect(error).toBe('Command Payload Missing');
                done();
            });
        });

        test('should return error if mic command missing sec parameter', (done) => {
            clients.checkCorrectParams(CONST.messageKeys.mic, {}, (error) => {
                expect(error).toBe('Mic Missing `sec` Parameter');
                done();
            });
        });

        test('should return error if gotPermission command missing permission parameter', (done) => {
            clients.checkCorrectParams(CONST.messageKeys.gotPermission, {}, (error) => {
                expect(error).toBe('GotPerm Missing `permission` Parameter');
                done();
            });
        });

        test('should return error if sms command missing action parameter', (done) => {
            clients.checkCorrectParams(CONST.messageKeys.sms, {}, (error) => {
                expect(error).toBe('SMS Missing `action` Parameter');
                done();
            });
        });

        test('should return error for unknown command ID', (done) => {
            clients.checkCorrectParams('INVALID_ID', {}, (error) => {
                expect(error).toBe('Command ID Not Found');
                done();
            });
        });
    });

    describe('clientDisconnect Cleanup', () => {
        test('should remove client resources on disconnect to prevent memory leaks', () => {
            const clientID = 'test-client-123';
            
            // Setup mock state
            clients.clientConnections[clientID] = { on: jest.fn() };
            clients.clientDatabases[clientID] = mockClientDbInstance;
            clients.gpsPollers[clientID] = setInterval(() => {}, 1000);
            
            // Mock DB response for isOnline update
            mockMainDb.find.mockReturnValue({
                assign: jest.fn().mockReturnThis(),
                write: jest.fn()
            });

            clients.clientDisconnect(clientID);

            expect(clients.clientConnections[clientID]).toBeUndefined();
            expect(clients.clientDatabases[clientID]).toBeUndefined();
            expect(clients.gpsPollers[clientID]).toBeUndefined();
        });
    });

    describe('Path Construction Logic', () => {
        test('should handle file extensions correctly in mic recording', (done) => {
            const clientID = 'test-client';
            const mockSocket = {
                on: jest.fn((event, callback) => {
                    if (event === CONST.messageKeys.mic) {
                        mockSocket.micCallback = callback;
                    }
                })
            };
            clients.clientConnections[clientID] = mockSocket;
            clients.setupListeners(clientID);

            const testFiles = [
                { name: 'audio.mp3', expectedExt: '.mp3' },
                { name: 'no-extension', expectedExt: '.bin' }, // Defaulted to .bin in final hardening
                { name: '.hidden', expectedExt: '.hidden' },
                { name: 'complex.name.with.dots.wav', expectedExt: '.wav' }
            ];

            fs.writeFile.mockImplementation((filePath, buffer, cb) => {
                cb(null);
            });

            testFiles.forEach(({ name, expectedExt }) => {
                mockSocket.micCallback({
                    file: true,
                    name: name,
                    buffer: Buffer.from('test')
                });

                const lastCallArgs = fs.writeFile.mock.calls[fs.writeFile.mock.calls.length - 1];
                const filePath = lastCallArgs[0];
                expect(filePath.endsWith(expectedExt)).toBe(true);
            });
            done();
        });
    });
});
