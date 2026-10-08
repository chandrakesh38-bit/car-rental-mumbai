import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// User-controlled UI feedback. No vendor or customer information is used.
class VendorFeedback {
  VendorFeedback._();
  static const _store = FlutterSecureStorage();
  static const _soundPref = 'cwd_vendor_sound_enabled_v1';
  static final ValueNotifier<bool> soundEnabled = ValueNotifier<bool>(true);

  static Future<void> initialize() async {
    try {
      soundEnabled.value = await _store.read(key: _soundPref) != 'false';
    } catch (_) {
      soundEnabled.value = true;
    }
  }

  static Future<void> setSoundEnabled(bool enabled) async {
    soundEnabled.value = enabled;
    try {
      await _store.write(key: _soundPref, value: enabled.toString());
    } catch (_) {
      // Keep the current session's toggle even if the device blocks storage.
    }
  }

  static void click() {
    if (soundEnabled.value) {
      unawaited(SystemSound.play(SystemSoundType.click));
    }
    unawaited(HapticFeedback.selectionClick());
  }

  static void accepted() {
    if (soundEnabled.value) {
      unawaited(SystemSound.play(SystemSoundType.alert));
    }
    unawaited(HapticFeedback.mediumImpact());
  }

  static void newBooking() {
    if (soundEnabled.value) {
      unawaited(SystemSound.play(SystemSoundType.alert));
    }
    unawaited(HapticFeedback.mediumImpact());
  }
}
