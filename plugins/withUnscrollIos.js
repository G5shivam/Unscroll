/**
 * iOS configuration for Unscroll.
 *  - Family Controls entitlement on the app (extensions get theirs from targets/).
 *  - App Transport Security stays at its secure default (no arbitrary loads).
 */
const { withEntitlementsPlist, withInfoPlist } = require('@expo/config-plugins');

module.exports = function withUnscrollIos(config) {
  config = withEntitlementsPlist(config, (cfg) => {
    cfg.modResults['com.apple.developer.family-controls'] = true;
    return cfg;
  });
  config = withInfoPlist(config, (cfg) => {
    const ats = cfg.modResults.NSAppTransportSecurity;
    if (ats && typeof ats === 'object') {
      delete ats.NSAllowsArbitraryLoads;
      delete ats.NSAllowsArbitraryLoadsInWebContent;
      // Local networking is only needed to reach the dev server.
      const release = process.env.EAS_BUILD_PROFILE === 'production' || process.env.UNSCROLL_RELEASE === '1';
      if (release) delete ats.NSAllowsLocalNetworking;
    }
    return cfg;
  });
  return config;
};
