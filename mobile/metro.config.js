const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Excluir carpetas android/ios del file watcher para evitar ENOSPC
config.watchFolders = [];
config.resolver.blockList = [
  /android\/.*/,
  /ios\/.*/,
];

module.exports = config;
