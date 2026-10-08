#!/usr/bin/env python3
"""Apply internal/testing-only Android configuration to generated Flutter files."""
from pathlib import Path
import re

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
gradle = re.sub(
    r'applicationId\s*=\s*"[^"]+"',
    'applicationId = "com.carwithdriverindia.vendor.testing"',
    gradle,
    count=1,
)
gradle = re.sub(r'minSdk\s*=\s*[^\n]+', 'minSdk = 24', gradle, count=1)
gradle = re.sub(r'targetSdk\s*=\s*[^\n]+', 'targetSdk = 36', gradle, count=1)
gradle = re.sub(r'compileSdk\s*=\s*[^\n]+', 'compileSdk = 36', gradle, count=1)
if 'applicationId = "com.carwithdriverindia.vendor.testing"' not in gradle:
    raise SystemExit("Android applicationId change was not applied. Check Gradle template.")
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
launch_background = """<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item>
        <shape android:shape="rectangle">
            <gradient android:startColor="#064E45"
                android:centerColor="#07565B"
                android:endColor="#071D2B"
                android:angle="270" />
        </shape>
    </item>
    <item android:gravity="center" android:width="124dp"
          android:height="124dp">
        <shape android:shape="oval">
            <solid android:color="#075D62"/>
            <stroke android:width="2dp" android:color="#65DCCC" />
        </shape>
    </item>
    <item android:drawable="@mipmap/ic_launcher"
          android:gravity="center" android:width="98dp"
          android:height="98dp"/>
</layer-list>
"""
for drawable in ("drawable", "drawable-v21"):
    folder = res / drawable
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "launch_background.xml").write_text(launch_background)

# Android 12/API 31+ system splash attributes. Match dark background and
# use the actual CWD launcher icon; no network loading and no white flash.
values31 = res / "values-v31"
values31.mkdir(parents=True, exist_ok=True)
(values31 / "styles.xml").write_text("""<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="LaunchTheme" parent="@android:style/Theme.Light.NoTitleBar">
        <item name="android:windowSplashScreenBackground">#064E45</item>
        <item name="android:windowSplashScreenAnimatedIcon">@mipmap/ic_launcher</item>
        <item name="android:windowSplashScreenIconBackgroundColor">#075D62</item>
        <item name="android:windowBackground">@drawable/launch_background</item>
        <item name="android:statusBarColor">#064E45</item>
        <item name="android:windowLightStatusBar">false</item>
    </style>
    <style name="NormalTheme" parent="@android:style/Theme.Light.NoTitleBar">
        <item name="android:windowBackground">?android:colorBackground</item>
        <item name="android:statusBarColor">#064E45</item>
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

print("CWD Partner native splash, app label and notification sound: OK")
