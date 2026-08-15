import '../api/dio_client.dart';

class AdsService {
  AdsService._();

  static final AdsService instance = AdsService._();

  /// Loads active ads visible to the public, optionally filtered by [category]/[city].
  Future<List<Map<String, dynamic>>> publicAds({
    String? category,
    String? city,
    String? country,
  }) async {
    final response = await ApiClient.instance.dio.get(
      '/ads/public/',
      queryParameters: {
        if (category != null && category.isNotEmpty) 'category': category,
        if (city != null && city.isNotEmpty) 'city': city,
        if (country != null && country.isNotEmpty) 'country': country,
      },
    );

    final raw = response.data;
    final list = raw is List
        ? raw
        : raw is Map && raw['results'] is List
            ? raw['results'] as List
            : <dynamic>[];

    return list
        .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e as Map))
        .toList();
  }
}
