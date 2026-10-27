const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Monorepo: code shared with the web app lives in <repo>/shared. Metro only
// watches the project root by default, so add it explicitly.
config.watchFolders = [
  ...(config.watchFolders ?? []),
  path.resolve(__dirname, '../shared'),
  // PDF layout code shared with the web and the parse-rental-pdf function (WP26).
  path.resolve(__dirname, '../supabase/functions/_shared/pdf'),
];

module.exports = withNativeWind(config, { input: './global.css' });
