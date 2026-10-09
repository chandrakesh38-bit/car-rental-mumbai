#!/usr/bin/env python3
"""Configure CWD Partner native Android assets and optional signed release."""
from pathlib import Path
import os
import re
import shutil

root = Path(__file__).resolve().parent.parent
manifest_file = root / "android/app/src/main/AndroidManifest.xml"
gradle_file = root / "android/app/build.gradle.kts"
if not manifest_file.is_file() or not gradle_file.is_file():
    raise SystemExit("Run bash scripts/bootstrap.sh to generate the Android scaffold.")

manifest = manifest_file.read_text()
if "android.permission.INTERNET" not in manifest:
    manifest = manifest.replace(
        "<application",
        '<uses-permission android:name="android.permission.INTERNET" />\n'
        '    <uses-permission android:name="android.permission.CAMERA" />\n'
        "    <application",
        1,
    )
manifest = re.sub(
    r'android:label="[^"]*"',
    'android:label="CWD Partner"',
    manifest,
    count=1,
)
if 'android:allowBackup="false"' not in manifest:
    manifest = manifest.replace(
        "<application",
        '<application android:allowBackup="false" android:usesCleartextTraffic="false"',
        1,
    )
manifest_file.write_text(manifest)

gradle = gradle_file.read_text()
release_mode = os.environ.get("CWD_PARTNER_RELEASE_BUILD") == "true"
package_id = (
    "com.carwithdriverindia.partner" if release_mode
    else "com.carwithdriverindia.vendor.testing"
)
gradle = re.sub(
    r'applicationId\s*=\s*"[^"]+"',
    f'applicationId = "{package_id}"',
    gradle,
    count=1,
)
gradle = re.sub(r'minSdk\s*=\s*[^\n]+', 'minSdk = 24', gradle, count=1)
gradle = re.sub(r'targetSdk\s*=\s*[^\n]+', 'targetSdk = 36', gradle, count=1)
gradle = re.sub(r'compileSdk\s*=\s*[^\n]+', 'compileSdk = 36', gradle, count=1)
if f'applicationId = "{package_id}"' not in gradle:
    raise SystemExit("Android applicationId change was not applied. Check Gradle template.")

if release_mode:
    # Persistent, owner-controlled key is injected securely by GitHub Actions.
    # No release key/password should ever be committed to this repository.
    key_path = root / "android/app/cwd-partner-release.jks"
    if not key_path.is_file() or key_path.stat().st_size < 1024:
        raise SystemExit("Release key missing. Refusing unsigned/debug-signed final APK.")
    if not os.environ.get("CWD_PARTNER_KEYSTORE_PASSWORD"):
        raise SystemExit("Release signing password missing. Refusing final APK.")
    signing = """    signingConfigs {
        create("cwdPartnerRelease") {
            storeFile = file("cwd-partner-release.jks")
            storePassword = System.getenv("CWD_PARTNER_KEYSTORE_PASSWORD")
            keyAlias = "cwd-partner"
            keyPassword = System.getenv("CWD_PARTNER_KEYSTORE_PASSWORD")
        }
    }

"""
    anchor = "    buildTypes {"
    debug_key = 'signingConfig = signingConfigs.getByName("debug")'
    if gradle.count(anchor) != 1 or gradle.count(debug_key) != 1:
        raise SystemExit("Unexpected Flutter Gradle release template; refusing to sign.")
    gradle = gradle.replace(anchor, signing + anchor, 1)
    gradle = gradle.replace(
        debug_key,
        'signingConfig = signingConfigs.getByName("cwdPartnerRelease")',
        1,
    )
gradle_file.write_text(gradle)

# Flutter create regenerates MainActivity on every build. Add the short,
# Android-native notification ringtone MethodChannel as a reproducible step.
kotlin_files = list((root / "android/app/src/main/kotlin").rglob("MainActivity.kt"))
if len(kotlin_files) != 1:
    raise SystemExit("Expected one generated Android MainActivity.kt.")
activity_file = kotlin_files[0]
existing = activity_file.read_text()
package = re.search(r"^package\s+([\w.]+)", existing, re.MULTILINE)
if not package:
    raise SystemExit("Unable to determine the generated Kotlin package.")
activity_file.write_text("""package """ + package.group(1) + """

import android.media.AudioManager
import android.media.RingtoneManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "cwd_vendor_feedback"
        ).setMethodCallHandler { call, result ->
            if (call.method != "playNotification") {
                result.notImplemented()
            } else {
                try {
                    val manager = getSystemService(AUDIO_SERVICE) as AudioManager
                    // Respect silent/vibrate mode and Android DND/audio policy.
                    if (manager.ringerMode == AudioManager.RINGER_MODE_NORMAL) {
                        val uri = RingtoneManager.getDefaultUri(
                            RingtoneManager.TYPE_NOTIFICATION
                        )
                        RingtoneManager.getRingtone(applicationContext, uri)?.play()
                    }
                    result.success(null)
                } catch (_: Exception) {
                    result.success(null)
                }
            }
        }
    }
}
""")


# Native Android splash prevents the startup blank/white frame *before*
# Flutter paints the animated city/road scene. Modern Android 12+ chooses a
# centered system icon; older versions use a branded layered background.
res = root / "android/app/src/main/res"

# The launcher icon is an adaptive icon: Android masks/crops its artwork.
# Using it directly as the system splash icon cuts off the CWD wordmark.
# Use the original branded PNG INSIDE a padded drawable instead, leaving
# enough safe area for the Android 12+ system splash circle masking.
brand = root / "assets/images/cwd-logo.png"
if not brand.is_file():
    raise SystemExit("The CWD brand logo is missing; cannot create splash.")
drawable_nodpi = res / "drawable-nodpi"
drawable_nodpi.mkdir(parents=True, exist_ok=True)
shutil.copyfile(brand, drawable_nodpi / "cwd_splash_logo.png")

drawable = res / "drawable"
drawable.mkdir(parents=True, exist_ok=True)
(drawable / "cwd_splash_mark.xml").write_text("""<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:gravity="center"
          android:width="74dp"
          android:height="74dp"
          android:drawable="@drawable/cwd_splash_logo" />
</layer-list>
""")

# Android 7-11: native launch background stays close to Flutter's initial
# City Sky Drive frame, with a compact uncropped badge.
launch_background = """<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item>
        <shape android:shape="rectangle">
            <gradient android:startColor="#073941"
                android:centerColor="#0B4749"
                android:endColor="#062D34"
                android:angle="270" />
        </shape>
    </item>
    <item android:drawable="@drawable/cwd_splash_mark"
          android:gravity="center" />
</layer-list>
"""
for drawable_dir in ("drawable", "drawable-v21"):
    folder = res / drawable_dir
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "launch_background.xml").write_text(launch_background)

# Android 12+: NEVER use @mipmap/ic_launcher as the splash's icon.
# Its adaptive-icon mask is what caused the visibly cropped first-frame
# logo in the owner's recorded Android launch.
values31 = res / "values-v31"
values31.mkdir(parents=True, exist_ok=True)
(values31 / "styles.xml").write_text("""<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="LaunchTheme" parent="@android:style/Theme.Light.NoTitleBar">
        <item name="android:windowSplashScreenBackground">#062D34</item>
        <item name="android:windowSplashScreenAnimatedIcon">@drawable/cwd_splash_mark</item>
        <item name="android:windowSplashScreenIconBackgroundColor">#062D34</item>
        <item name="android:windowBackground">@drawable/launch_background</item>
        <item name="android:statusBarColor">#062D34</item>
        <item name="android:windowLightStatusBar">false</item>
    </style>
    <style name="NormalTheme" parent="@android:style/Theme.Light.NoTitleBar">
        <item name="android:windowBackground">?android:colorBackground</item>
        <item name="android:statusBarColor">#062D34</item>
        <item name="android:windowLightStatusBar">false</item>
    </style>
</resources>
""")

# Keep pre-31 status bar dark and unify launch/Flutter backgrounds.
for values_dir in ("values", "values-night"):
    styles = res / values_dir / "styles.xml"
    if not styles.is_file():
        continue
    text = styles.read_text()
    anchor = '<item name="android:windowBackground">@drawable/launch_background</item>'
    if anchor in text and 'android:statusBarColor' not in text:
        text = text.replace(anchor,
            anchor + '\n        <item name="android:statusBarColor">#064E45</item>'
            + '\n        <item name="android:windowLightStatusBar">false</item>',
            1)
        styles.write_text(text)

print("CWD Partner Android native setup: " + ("SIGNED RELEASE" if release_mode else "TESTING") + " OK")
