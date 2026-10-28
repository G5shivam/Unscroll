/** Handles the buttons on the shield. It can only close the shield, never lift it. */
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'shield-action',
  name: 'ShieldAction',
  bundleIdentifier: '.ShieldAction',
  deploymentTarget: '16.4',
  entitlements: { 'com.apple.developer.family-controls': true },
};
