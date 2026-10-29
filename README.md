# Ziyu · Chinese Character Match

[English](https://zuti666.github.io/ChineseCharacterMatch-web/?lang=en) · [Español](https://zuti666.github.io/ChineseCharacterMatch-web/?lang=es)

Connect a picture, a teaching sketch, and a modern Chinese character. The prototype includes matching rounds, a character atlas, favorites, local progress, and English, Spanish, and Chinese explanations.

## Mobile website and app

The responsive website supports touch navigation and adding to the home screen in supporting browsers. Wait for the offline-ready notice while online; then matching, the atlas, and guest records can work offline. Browser storage may be cleared by the user or device. System Mandarin voices depend on the device.

Visit the [app support and download page](https://zuti666.github.io/ChineseCharacterMatch-web/?page=app&lang=en) for the approved Android debug APK, current version, minimum Android version, file size, and SHA-256. The APK download requires a connection and is excluded from the PWA cache. The native Android app uses separate local storage and still needs device validation.

This GitHub Pages site saves guest records in the current browser. The [cloud account website](https://chinesecharactermatch.onrender.com/?lang=en) provides the separately hosted account service and its trial notice.

## Published contents

`site/` is the public website payload; `.github/workflows/pages.yml` deploys it to GitHub Pages. The payload includes the production 13-character library, its 26 selected pictures, PWA resources, release metadata, and the one approved Android trial package.

Original PPT files, the private review batch, Python backend, user databases, account records, development files, and signing keys remain outside this public repository. Teaching sketches are not authenticated archaeological specimens; source and review notes appear in the app.

The public files are generated from the private source project. Make changes in that source and sync them through the existing publishing workflow.

静态构建来源版本：`7d53597f99f51f487d81c1cc611e270bbaf704d3`。
