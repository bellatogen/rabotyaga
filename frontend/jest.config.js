export default {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    // Статические ассеты → заглушка, иначе jest парсит бинарник как JS.
    '\\.(png|jpe?g|gif|svg|webp|avif|ico)$': '<rootDir>/__mocks__/fileMock.js',
    // services/api.js использует import.meta.env (Vite) → мок-заглушка для тестов.
    '(^|/)services/api(\\.js)?$': '<rootDir>/__mocks__/apiMock.js',
  },
  transform: {
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
  testMatch: ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
  collectCoverageFrom: [
    'src/**/*.{js,jsx}',
    '!src/main.jsx',
    '!src/**/*.d.ts',
  ],
};
