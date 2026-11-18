import pino from 'pino';

const isProd = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: isProd ? 'info' : 'debug',
});

export const httpLogger = {
  write: (message) => logger.info(message.trim()),
};
