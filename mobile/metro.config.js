const path = require('path');

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const escapePathForRegex = (filePath) =>
  filePath
    .split(path.sep)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[/\\\\]');

// Excluir carpetas android/ios del file watcher para evitar ENOSPC
config.watchFolders = [];
config.resolver.blockList = [
  new RegExp(`${escapePathForRegex(path.join(__dirname, 'android'))}[/\\\\].*`),
  new RegExp(`${escapePathForRegex(path.join(__dirname, 'ios'))}[/\\\\].*`),
];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('@/')) {
    return context.resolveRequest(
      context,
      path.join(__dirname, 'src', moduleName.slice(2)),
      platform,
    );
  }

  return context.resolveRequest(context, moduleName, platform);
};

const enhanceMiddleware = config.server?.enhanceMiddleware;
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware, server) => {
    const enhancedMiddleware = enhanceMiddleware
      ? enhanceMiddleware(middleware, server)
      : middleware;

    return (req, res, next) => {
      if (req.url?.split('?')[0] === '/status') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('packager-status:running');
        return;
      }

      return enhancedMiddleware(req, res, next);
    };
  },
};

module.exports = config;
