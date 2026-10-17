const { withAppBuildGradle } = require('@expo/config-plugins');

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, config => {
    let contents = config.modResults.contents;

    if (!contents.includes('bookMapRelease')) {
      contents = contents.replace(
        /signingConfigs\s*\{/,
        `signingConfigs {
        bookMapRelease {
            storeFile file("bookmap-release.jks")
            storePassword System.getenv("BOOKMAP_KEYSTORE_PASSWORD") ?: ""
            keyAlias "bookmap"
            keyPassword System.getenv("BOOKMAP_KEYSTORE_PASSWORD") ?: ""
        }`
      );
    }

    const releaseStart = contents.indexOf('release {');
    if (releaseStart !== -1) {
      const tail = contents.slice(releaseStart);
      const replacedTail = tail.replace(
        /signingConfig\s+signingConfigs\.debug/,
        'signingConfig signingConfigs.bookMapRelease'
      );
      contents = contents.slice(0, releaseStart) + replacedTail;
    }

    config.modResults.contents = contents;
    return config;
  });
};
