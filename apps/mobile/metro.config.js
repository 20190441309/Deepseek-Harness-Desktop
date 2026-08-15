const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [
  path.resolve(__dirname, '../../packages/protocol'),
];
config.resolver.extraNodeModules = {
  tweetnacl: path.resolve(__dirname, 'node_modules/tweetnacl'),
};
module.exports = config;
