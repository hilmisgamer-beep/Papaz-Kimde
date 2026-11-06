# 🃏 Papaz Kimde (Papaz Kaçtı)

Çok oyunculu, gerçek zamanlı **Papaz Kimde** kart oyunu. Herkes kendi telefonundan, paylaşılan link ile oynar.

## 🎮 Oyun Kuralları

- Destede **49 kart** vardır (52 karttan **3 Kral çıkarılır**, sadece **1 Kral = Papaz** kalır)
- Kartlar oyunculara eşit dağıtılır, **çiftler otomatik atılır**
- Sırayla **sağındaki oyuncudan 1 kart çekersin** (gizli)
- Elini ilk bitiren oyuncu **kazanır**
- Sonda **Papaz (Kral) kartı elinde kalan** oyuncu **kaybeder**

## 🕹️ Nasıl Oynanır

1. **Oda Kur** → İsmini gir, oda oluştur → **6 haneli oda kodu** al
2. **Linki paylaş** → `https://<site>/r/<ODA_KODU>` (veya oyun sonunda "Linki Kopyala")
3. Arkadaşlar linke tıklar, isim girer, **oda kodunu** yazarak katılır
4. Herkes **Hazır Ol** → Oda sahibi **"Oyunu Başlat"** der
5. Sırası gelen oyuncu **"Kart Çek"** butonuna basar
6. Oyun bitince sonuç ekranı: kazananlar ve **Papaz'ın kaldığı oyuncu** gösterilir

## 🛠️ Teknoloji

- **Backend**: Node.js + Express + Socket.IO (WebSocket, gerçek zamanlı)
- **Frontend**: Vanilla JS, mobil-uyumlu, PWA (ana ekrana eklenebilir)
- **Oda sistemi**: 6 haneli kod, herkes kendi cihazından katılır

## 🚀 Çalıştırma (Lokal)

```bash
npm install
npm start
# http://localhost:3000
```

## 🧪 Testler

```bash
npm test
```
3 oyunculu uçtan uca test: oda kurma, katılma, hazır olma, oyun başlatma,
kart çekme turları, el gizliliği kontrolü ve Papaz'ın tek elde kalması doğrulanır.

## ☁️ Deploy

- **Render**: `render.yaml` otomatik yapılandırmayı içerir (Build: `npm install`, Start: `npm start`)
- **Railway**: `railway.json` otomatik yapılandırmayı içerir
- Health check: `/health`

## 📁 Proje Yapısı

```
papaz-kimde/
├── server.js          # Express + Socket.IO sunucu ve oyun motoru
├── render.yaml        # Render deploy config
├── railway.json       # Railway deploy config
├── test-game.js       # Uçtan uca oyun testi
└── public/
    ├── index.html     # Lobby + Bekleme + Oyun ekranları
    ├── style.css      # Tema, animasyonlar, mobil uyum
    ├── app.js         # İstemci oyun mantığı
    ├── manifest.json  # PWA manifest
    └── sw.js          # Service worker (offline cache)
```
