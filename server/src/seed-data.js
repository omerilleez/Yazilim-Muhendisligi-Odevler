// Demo verisi: tamamen kurgusal kişiler (adres/telefon/e-posta gerçek değildir).
export const DEMO_PASSWORD = 'demo1234';

// Üç sosyal topluluk: A (ayse…), B (burak…), C (kerem…) — C küçük bir azınlık topluluğu.
export const USERS = [
  { nickname: 'ayse', first_name: 'Ayşe', last_name: 'Yılmaz', birth_date: '1988-04-12', city: 'İstanbul', district: 'Kadıköy', address: 'Caferağa Mah. Örnek Sk. No:12 D:3', phone: '0555 010 0101', bio: 'Eğitim bilimci, kütüphane gönüllüsü.' },
  { nickname: 'mehmet', first_name: 'Mehmet', last_name: 'Demir', birth_date: '1979-09-30', city: 'İstanbul', district: 'Üsküdar', address: 'Altunizade Mah. Deneme Cad. No:5', phone: '0555 010 0102', bio: 'Kamu yönetimi uzmanı.' },
  { nickname: 'zeynep', first_name: 'Zeynep', last_name: 'Kaya', birth_date: '1985-01-22', city: 'Ankara', district: 'Çankaya', address: 'Kızılay Mah. Örnek Blv. No:44 D:8', phone: '0555 010 0103', bio: 'Avukat, veri koruma hukuku.' },
  { nickname: 'can', first_name: 'Can', last_name: 'Öztürk', birth_date: '1999-06-15', city: 'İzmir', district: 'Bornova', address: 'Kazımdirik Mah. Kampüs Sk. No:9', phone: '0555 010 0104', bio: 'Bilgisayar mühendisliği öğrencisi.' },
  { nickname: 'elif', first_name: 'Elif', last_name: 'Şahin', birth_date: '2001-11-03', city: 'İstanbul', district: 'Beşiktaş', address: 'Yıldız Mah. Deneme Sk. No:21', phone: '0555 010 0105', bio: 'Beslenme ve diyetetik öğrencisi.' },
  { nickname: 'burak', first_name: 'Burak', last_name: 'Arslan', birth_date: '1992-03-08', city: 'Bursa', district: 'Nilüfer', address: 'Görükle Mah. Örnek Cad. No:17', phone: '0555 010 0106', bio: 'İktisatçı.' },
  { nickname: 'deniz', first_name: 'Deniz', last_name: 'Aydın', birth_date: '1990-07-19', city: 'Eskişehir', district: 'Tepebaşı', address: 'Batıkent Mah. Deneme Blv. No:3', phone: '0555 010 0107', bio: 'Şehir plancısı, ulaşım uzmanı.' },
  { nickname: 'selin', first_name: 'Selin', last_name: 'Koç', birth_date: '1996-02-27', city: 'Antalya', district: 'Konyaaltı', address: 'Liman Mah. Örnek Sk. No:30', phone: '0555 010 0108', bio: 'Çevre mühendisi.' },
  { nickname: 'emre', first_name: 'Emre', last_name: 'Çelik', birth_date: '1983-12-01', city: 'Ankara', district: 'Yenimahalle', address: 'Batıkent Mah. Deneme Cad. No:11', phone: '0555 010 0109', bio: 'Halk sağlığı uzmanı, hekim.' },
  { nickname: 'ece', first_name: 'Ece', last_name: 'Yıldız', birth_date: '2000-05-05', city: 'İzmir', district: 'Karşıyaka', address: 'Bostanlı Mah. Örnek Sk. No:7', phone: '0555 010 0110', bio: 'Mimarlık öğrencisi.' },
  { nickname: 'kerem', first_name: 'Kerem', last_name: 'Aksoy', birth_date: '1994-08-14', city: 'Konya', district: 'Selçuklu', address: 'Bosna Hersek Mah. Deneme Sk. No:2', phone: '0555 010 0111', bio: 'Mali müşavir.' },
  { nickname: 'nil', first_name: 'Nil', last_name: 'Erdem', birth_date: '1997-10-10', city: 'Konya', district: 'Meram', address: 'Yaka Mah. Örnek Cad. No:15', phone: '0555 010 0112', bio: 'Yemekhane çalışanları temsilcisi.' },
  { nickname: 'ozan', first_name: 'Ozan', last_name: 'Kurt', birth_date: '1995-04-25', city: 'Trabzon', district: 'Ortahisar', address: 'Kalkınma Mah. Deneme Sk. No:6', phone: '0555 010 0113', bio: 'Orman mühendisi.' },
  { nickname: 'irem', first_name: 'İrem', last_name: 'Polat', birth_date: '1998-01-18', city: 'Samsun', district: 'Atakum', address: 'Körfez Mah. Örnek Sk. No:19', phone: '0555 010 0114', bio: 'Veri bilimi meraklısı.' },
];

export const GROUPS = {
  A: ['ayse', 'mehmet', 'zeynep', 'can', 'elif'],
  B: ['burak', 'deniz', 'selin', 'emre', 'ece'],
  C: ['kerem', 'nil', 'ozan', 'irem'],
};

// Topluluklar arası birkaç köprü
export const BRIDGES = [
  ['can', 'burak', 'takip'],
  ['elif', 'deniz', 'takip'],
  ['deniz', 'elif', 'takip'],
  ['ozan', 'selin', 'takip'],
];
