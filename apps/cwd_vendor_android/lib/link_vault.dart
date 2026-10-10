import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'vendor_link.dart';

class SavedVendorLink {
  const SavedVendorLink(this.link, this.savedAt);
  final VendorLink link;
  final DateTime savedAt;
}

class LinkVault {
  static const String _key = 'cwd_vendor_secure_links_v1';
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  Future<List<SavedVendorLink>> load() async {
    final raw = await _storage.read(key: _key);
    if (raw == null || raw.isEmpty) return [];
    try {
      final parsed = jsonDecode(raw);
      if (parsed is! List) return [];
      final items = <SavedVendorLink>[];
      for (final entry in parsed) {
        if (entry is! Map) continue;
        final link = VendorLink.parse(entry['url']?.toString() ?? '');
        final date = DateTime.tryParse(entry['saved_at']?.toString() ?? '');
        if (link != null && date != null) {
          items.add(SavedVendorLink(link, date));
        }
      }
      items.sort((a, b) => b.savedAt.compareTo(a.savedAt));
      return items.take(20).toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> save(VendorLink link) async {
    final current = await load();
    current.removeWhere((item) => item.link.uri == link.uri);
    current.insert(0, SavedVendorLink(link, DateTime.now()));
    await _persist(current.take(20).toList());
  }

  Future<void> remove(Uri uri) async {
    final current = await load();
    current.removeWhere((item) => item.link.uri == uri);
    await _persist(current);
  }

  Future<void> clear() => _storage.delete(key: _key);

  Future<void> _persist(List<SavedVendorLink> links) {
    return _storage.write(
      key: _key,
      value: jsonEncode(links
          .map((item) => {
                'url': item.link.uri.toString(),
                'saved_at': item.savedAt.toUtc().toIso8601String(),
              })
          .toList()),
    );
  }
}
