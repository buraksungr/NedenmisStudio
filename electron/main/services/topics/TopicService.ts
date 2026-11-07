import { id } from '../../../../shared/utils.js';
import type { TopicSuggestion } from '../../../../shared/types.js';

const TOPICS: Array<Omit<TopicSuggestion, 'id'>> = [
  { title: 'Gökyüzü neden mavi görünür?', category: 'Bilim', hook: 'Güneş ışığı aslında beyazsa, neden her yer mavi?', score: 96, reason: 'Güçlü merak, görsel saçılım animasyonu ve kısa açıklama potansiyeli.' },
  { title: 'Uçaklar gökyüzünde neden beyaz iz bırakır?', category: 'Gündelik Gizemler', hook: 'O beyaz çizgiler duman değilse, ne?', score: 93, reason: 'Tanıdık bir olayı yoğunlaşma fiziğiyle açıklar.' },
  { title: 'Zaman neden hızlı geçiyormuş gibi hissederiz?', category: 'Psikoloji', hook: 'Beyniniz zamanı bir saat gibi ölçmüyor.', score: 95, reason: 'Kişisel deneyim ile beyin görselleştirmesini birleştirir.' },
  { title: 'Ay neden sürekli aynı yüzünü gösterir?', category: 'Uzay', hook: 'Ay bize sırtını hiç dönmüyor. Bu bir tesadüf mü?', score: 94, reason: 'Kütle çekim kilidi yörünge animasyonuna çok uygun.' },
  { title: 'Kediler neden sürtünür?', category: 'Hayvanlar', hook: 'Size sürtünen kedi yalnızca sevgi göstermiyor olabilir.', score: 91, reason: 'Geniş izleyici ilgisi ve koku işaretleme davranışı.' },
  { title: 'Buz neden suda yüzer?', category: 'Bilim', hook: 'Katı bir madde, sıvısından nasıl daha hafif olabilir?', score: 94, reason: 'Moleküler yapı kolayca hareketli diyagrama dönüşür.' },
  { title: 'Deja vu sırasında beynimizde ne olur?', category: 'İnsan Vücudu', hook: 'Bu anı daha önce yaşamadıysanız, beyniniz neden ısrarcı?', score: 95, reason: 'Yüksek merak ve bellek süreçlerini görselleştirme imkânı.' },
  { title: 'Aynada neden sağ ve sol ters döner?', category: 'Gündelik Gizemler', hook: 'Peki ayna neden üst ve altı ters çevirmiyor?', score: 89, reason: 'Yanıltıcı soru ve basit optik diyagramı.' },
  { title: 'Deniz suyu neden tuzludur?', category: 'Coğrafya', hook: 'Okyanuslara her gün tatlı su akıyor. Peki tuz nereden geliyor?', score: 90, reason: 'Su döngüsü ve jeoloji ile güçlü görsel anlatım.' },
  { title: 'Uyurken neden düşüyormuş gibi oluruz?', category: 'İnsan Vücudu', hook: 'Tam uykuya dalarken bedeniniz neden ani bir uyarı verir?', score: 94, reason: 'Yaygın deneyim, sinir sistemi ve kısa açıklama.' },
  { title: 'Karıncalar yollarını nasıl bulur?', category: 'Hayvanlar', hook: 'Karıncaların haritası gözlerinde değil, burunlarında.', score: 92, reason: 'Feromon izleri hareketli diyagram için ideal.' },
  { title: 'Kara delikte zaman gerçekten yavaşlar mı?', category: 'Uzay', hook: 'Bir saat, kara deliğe yaklaşınca ne görürüz?', score: 97, reason: 'Yüksek izlenme potansiyeli ve etkileyici uzay animasyonları.' },
  { title: 'Neden esneriz ve esneme bulaşıcı mıdır?', category: 'Psikoloji', hook: 'Bu cümleyi okurken esnemeniz mümkün.', score: 93, reason: 'Anında etkileşim kuran açılış ve sosyal davranış.' },
  { title: 'Parmak uçlarımız suda neden buruşur?', category: 'İnsan Vücudu', hook: 'Sanıldığı gibi suyu emdiğimiz için değil.', score: 94, reason: 'Beklenmedik sinir sistemi yanıtı.' },
  { title: 'Bitkiler gece ne yapar?', category: 'Doğa', hook: 'Güneş batınca bitkiler düğmeye basılmış gibi kapanmaz.', score: 88, reason: 'Sirkadiyen ritim ve zaman atlamalı görsel anlatım.' },
  { title: 'Şimşek mi önce oluşur, gök gürültüsü mü?', category: 'Doğa', hook: 'Aslında ikisi aynı anda başlar; bize ulaşmaları farklıdır.', score: 91, reason: 'Işık ve ses hızı karşılaştırması net biçimde gösterilebilir.' },
  { title: 'Yapay zekâ bir metni nasıl tahmin eder?', category: 'Teknoloji', hook: 'Yapay zekâ bir sonraki kelimeyi gerçekten biliyor mu?', score: 93, reason: 'Güncel ilgi ve token diyagramlarıyla açıklanabilir.' },
  { title: 'Telefon ekranı dokunuşumuzu nasıl algılar?', category: 'Teknoloji', hook: 'Ekrana dokunduğunuzda parmağınız küçük bir elektrik devresini değiştirir.', score: 90, reason: 'Gündelik teknoloji ve kesit animasyonu.' },
  { title: 'Antik Roma betonu neden hâlâ ayakta?', category: 'Tarih', hook: 'Bazı modern betonlardan daha dayanıklı olmasının sırrı ne?', score: 92, reason: 'Tarih ve malzeme bilimini birleştirir.' },
  { title: 'Kutup ayılarının derisi neden siyahtır?', category: 'Hayvanlar', hook: 'Beyaz görünen kürkün altında beklenmedik bir renk var.', score: 94, reason: 'Şaşırtıcı bilgi ve katmanlı görsel anlatım.' },
  { title: 'Dünya dönüyorsa neden hissetmiyoruz?', category: 'Uzay', hook: 'Saatte yaklaşık 1670 kilometre hızla hareket ederken neden durgunuz?', score: 95, reason: 'Ölçek ve eylemsizlik ile güçlü açıklama.' },
  { title: 'Gözümüzün kör noktasını nasıl bulabiliriz?', category: 'İnsan Vücudu', hook: 'Şu an görüşünüzde küçük bir boşluk var; beyniniz onu dolduruyor.', score: 96, reason: 'İzleyicinin katılabildiği mini deney.' },
  { title: 'Mum alevi uzayda nasıl görünür?', category: 'Bilim', hook: 'Yerçekimi olmayınca alevin tanıdık şekli kaybolur.', score: 93, reason: 'Mikro yerçekimi deneyleri ve dikkat çekici görüntüler.' },
  { title: 'Neden bazı şarkılar dilimize takılır?', category: 'Psikoloji', hook: 'Beyniniz o melodiyi neden tekrar tekrar çalıyor?', score: 91, reason: 'Yaygın deneyim ve müzik-bellek bağı.' },
  { title: 'Ateş böcekleri nasıl ışık üretir?', category: 'Hayvanlar', hook: 'Neredeyse hiç ısı üretmeden ışık yapmanın yolu.', score: 92, reason: 'Biyolüminesans kimyası ve güçlü gece görselleri.' },
  { title: 'Derin denizde basınç canlıları neden ezmez?', category: 'Coğrafya', hook: 'Üzerlerinde tonlarca su varken nasıl hayatta kalıyorlar?', score: 90, reason: 'Basınç diyagramları ve derin deniz atmosferi.' },
  { title: 'Hafızamız her hatırladığımızda değişir mi?', category: 'Psikoloji', hook: 'Bir anıyı açmak, onu aynen geri kaydetmek anlamına gelmeyebilir.', score: 94, reason: 'Yeniden yapılandırma kavramı ve güçlü metaforlar.' },
  { title: 'Yıldızlar neden göz kırpıyor gibi görünür?', category: 'Uzay', hook: 'Yıldızlar aslında yanıp sönmüyor; aradaki atmosfer var.', score: 92, reason: 'Atmosferik türbülansın kolay animasyonu.' },
  { title: 'Soğan doğrarken neden ağlarız?', category: 'Gündelik Gizemler', hook: 'Soğanın savunması, gözünüzde küçük bir kimyasal alarm başlatır.', score: 94, reason: 'Herkesin yaşadığı olay ve moleküler anlatım.' },
  { title: 'Ses neden suda farklı duyulur?', category: 'Bilim', hook: 'Aynı ses, hava yerine suya girince nasıl değişir?', score: 87, reason: 'Dalgaların farklı ortamlardaki davranışı görselleştirilebilir.' },
];

export class TopicService {
  discover(category?: string): TopicSuggestion[] {
    const source = category && category !== 'Otomatik' ? TOPICS.filter((topic) => topic.category === category) : TOPICS;
    const daySeed = Math.floor(Date.now() / 86400000);
    return source.map((topic, index) => ({ ...topic, id: id('topic'), score: Math.min(99, topic.score + ((daySeed + index * 7) % 4) - 1) }))
      .sort((a, b) => b.score - a.score).slice(0, 8);
  }
  categories(): string[] { return [...new Set(TOPICS.map((topic) => topic.category))]; }
}
