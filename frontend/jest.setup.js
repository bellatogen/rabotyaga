import '@testing-library/jest-dom';

// jsdom не даёт ряд глобалов, нужных react-dom/server для smoke-рендера.
// Полифиллим из стандартных модулей Node.
import { MessageChannel } from 'worker_threads';
import { TextEncoder, TextDecoder } from 'util';
if (typeof global.MessageChannel === 'undefined') global.MessageChannel = MessageChannel;
if (typeof global.TextEncoder === 'undefined') global.TextEncoder = TextEncoder;
if (typeof global.TextDecoder === 'undefined') global.TextDecoder = TextDecoder;
