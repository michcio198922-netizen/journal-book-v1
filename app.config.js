const versionName = process.env.BUILD_VERSION_NAME || '1.0.0';
const versionCode = Number(process.env.BUILD_VERSION_CODE || '1');

module.exports = {
  expo: {
    name: 'Mapa Książki',
    slug: 'mapa-ksiazki',
    version: versionName,
    orientation: 'portrait',
    userInterfaceStyle: 'dark',
    icon: './assets/icon.png',
    splash: { image: './assets/splash.png', resizeMode: 'contain', backgroundColor: '#0B0A08' },
    android: {
      package: 'pl.reading.mapaksiazki',
      versionCode,
      adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#0B0A08' }
    },
    plugins: [
      ['expo-image-picker', { photosPermission: 'Mapa Książki potrzebuje dostępu do zdjęć, aby dodawać okładki i zdjęcia stron.' }],
      './plugins/withReleaseSigning'
    ]
  }
};
