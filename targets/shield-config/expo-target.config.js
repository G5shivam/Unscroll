/** Custom block screen shown when the official Instagram app is opened. */
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'shield-config',
  name: 'ShieldConfiguration',
  bundleIdentifier: '.ShieldConfiguration',
  deploymentTarget: '16.4',
  entitlements: { 'com.apple.developer.family-controls': true },
};
