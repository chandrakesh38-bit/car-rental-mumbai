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
    'android:label="CWD Vendor TEST"',
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

print("CWD vendor staging Android config and notification sound: OK")
