/**
 * Android hardening for Unscroll (app-level manifest).
 * The Accessibility service and boot receiver are declared in the local
 * module's own manifest (modules/unscroll-blocker) and merged automatically.
 *
 *  - No backups / device-to-device transfer: restoring old data could bring
 *    back an unlocked state, and nothing here needs to leave the phone.
 *  - No cleartext HTTP in any build that ships.
 */
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const EXTRACTION_RULES = `<?xml version="1.0" encoding="utf-8"?>
<!-- Unscroll: exclude everything from cloud backup and device transfer. -->
<data-extraction-rules>
  <cloud-backup>
    <exclude domain="root" />
    <exclude domain="file" />
    <exclude domain="database" />
    <exclude domain="sharedpref" />
    <exclude domain="external" />
  </cloud-backup>
  <device-transfer>
    <exclude domain="root" />
    <exclude domain="file" />
    <exclude domain="database" />
    <exclude domain="sharedpref" />
    <exclude domain="external" />
  </device-transfer>
</data-extraction-rules>
`;

const BACKUP_RULES = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
  <exclude domain="root" path="." />
  <exclude domain="file" path="." />
  <exclude domain="database" path="." />
  <exclude domain="sharedpref" path="." />
  <exclude domain="external" path="." />
</full-backup-content>
`;

function withRulesFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'unscroll_data_extraction_rules.xml'), EXTRACTION_RULES);
      fs.writeFileSync(path.join(dir, 'unscroll_backup_rules.xml'), BACKUP_RULES);
      return cfg;
    },
  ]);
}

function withHardenedManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.$['android:allowBackup'] = 'false';
    app.$['android:fullBackupContent'] = '@xml/unscroll_backup_rules';
    app.$['android:dataExtractionRules'] = '@xml/unscroll_data_extraction_rules';
    app.$['android:usesCleartextTraffic'] = 'false';
    // Ensure tools namespace so release overrides merge cleanly.
    cfg.modResults.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    const replace = new Set((app.$['tools:replace'] || '').split(',').filter(Boolean));
    ['android:allowBackup', 'android:fullBackupContent', 'android:dataExtractionRules'].forEach((a) => replace.add(a));
    app.$['tools:replace'] = Array.from(replace).join(',');
    return cfg;
  });
}

/** Optional: enable the Settings guard (NOT allowed on Google Play; see unscroll_config.xml). */
function withSettingsGuard(config, enabled) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res/values');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'unscroll_config.xml'),
        `<resources>\n  <bool name="unscroll_settings_guard">${enabled ? 'true' : 'false'}</bool>\n</resources>\n`,
      );
      return cfg;
    },
  ]);
}

module.exports = function withUnscrollAndroid(config, options = {}) {
  return withSettingsGuard(withHardenedManifest(withRulesFiles(config)), options.settingsGuard === true);
};
