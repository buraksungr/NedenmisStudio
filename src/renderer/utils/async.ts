/**
 * "Yangın-ve-unut" çağrıları için güvenli sarmalayıcı.
 *
 * `useStudio().run()` hatayı kullanıcıya BİR bildirim olarak gösterir ve
 * hatayı çağırana fırlatır (çağıran zincirleme yapmak isteyebilir).
 * Buna karşılık `void fn()` biçimindeki çağrılarda fırlatılan hata
 * yakalanmadığı için "işlenmemiş promise reddi" olarak raporlanır ve
 * Chromium dışı ortamlarda ikinci bir bildirim doğurabilir.
 *
 * Bu sarmalayıcı, reddi yutar. Bildirim zaten `run()` içinde üretildiği
 * için hiçbir bilgi kaybolmaz; yalnızca reddin dışarı sızması engellenir.
 */
export function fireAndForget(operation: () => Promise<unknown>): void {
  void operation().catch(() => undefined);
}
