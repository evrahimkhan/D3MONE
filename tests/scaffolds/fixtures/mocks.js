/**
 * @file mocks.js
 * @description Shared mocks and fixtures for security hardening tests.
 */

const jest = require('jest');

// Database Mock Factory
const createDbMock = () => ({
    maindb: {
        get: jest.fn().mockReturnThis(),
        find: jest.fn().mockReturnThis(),
        push: jest.fn().mockReturnThis(),
        assign: jest.fn().mockReturnThis(),
        write: jest.fn().mockReturnThis(),
        value: jest.fn(),
        remove: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis()
    },
    clientdb: jest.fn().mockImplementation(() => ({
        get: jest.fn().mockReturnThis(),
        find: jest.fn().mockReturnThis(),
        push: jest.fn().mockReturnThis(),
        assign: jest.fn().mockReturnThis(),
        write: jest.fn().mockReturnThis(),
        value: jest.fn(),
        remove: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis()
    }))
});

// Socket Mock Factory
const createSocketMock = () => ({
    on: jest.fn(),
    emit: jest.fn(),
    once: jest.fn(),
    close: jest.fn()
});

module.exports = {
    createDbMock,
    createSocketMock
};
