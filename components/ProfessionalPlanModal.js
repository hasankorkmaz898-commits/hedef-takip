import { useState, useRef, useEffect, useMemo } from 'react'
import { createClient } from '../lib/supabase'

const DOW_TR   = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt']
const DOW_FULL = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi']

const PRO_TEMPLATES = [{"icon":"🏃","name":"12 Haftalık Maraton Hazırlığı","weekCount":12,"bufferDay":0,"weeks":[{"name":"Baz Antrenman - 1. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["Uzun koşu","Esneme"]},{"dow":2,"enabled":true,"tasks":["Tempo koşusu"]},{"dow":3,"enabled":true,"tasks":["Dinlenme koşusu","Kuvvet"]},{"dow":4,"enabled":true,"tasks":["Interval antrenmanı"]},{"dow":5,"enabled":true,"tasks":["Kısa koşu","Beslenme takibi"]},{"dow":6,"enabled":false,"tasks":[""]}]},{"name":"Baz Antrenman - 2. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["Uzun koşu","Esneme"]},{"dow":2,"enabled":true,"tasks":["Tempo koşusu"]},{"dow":3,"enabled":true,"tasks":["Dinlenme koşusu","Kuvvet"]},{"dow":4,"enabled":true,"tasks":["Interval antrenmanı"]},{"dow":5,"enabled":true,"tasks":["Kısa koşu","Beslenme takibi"]},{"dow":6,"enabled":false,"tasks":[""]}]},{"name":"Baz Antrenman - 3. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["Uzun koşu","Esneme"]},{"dow":2,"enabled":true,"tasks":["Tempo koşusu"]},{"dow":3,"enabled":true,"tasks":["Dinlenme koşusu","Kuvvet"]},{"dow":4,"enabled":true,"tasks":["Interval antrenmanı"]},{"dow":5,"enabled":true,"tasks":["Kısa koşu","Beslenme takibi"]},{"dow":6,"enabled":false,"tasks":[""]}]},{"name":"Baz Antrenman - 4. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["Uzun koşu","Esneme"]},{"dow":2,"enabled":true,"tasks":["Tempo koşusu"]},{"dow":3,"enabled":true,"tasks":["Dinlenme koşusu","Kuvvet"]},{"dow":4,"enabled":true,"tasks":["Interval antrenmanı"]},{"dow":5,"enabled":true,"tasks":["Kısa koşu","Beslenme takibi"]},{"dow":6,"enabled":false,"tasks":[""]}]},{"name":"Tempo Artışı - 1. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["Uzun koşu","Esneme"]},{"dow":2,"enabled":true,"tasks":["Tempo koşusu"]},{"dow":3,"enabled":true,"tasks":["Dinlenme koşusu","Kuvvet"]},{"dow":4,"enabled":true,"tasks":["Interval antrenmanı"]},{"dow":5,"enabled":true,"tasks":["Kısa koşu","Beslenme takibi"]},{"dow":6,"enabled":false,"tasks":[""]}]},{"name":"Tempo Artışı - 2. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["Uzun koşu","Esneme"]},{"dow":2,"enabled":true,"tasks":["Tempo koşusu"]},{"dow":3,"enabled":true,"tasks":["Dinlenme koşusu","Kuvvet"]},{"dow":4,"enabled":true,"tasks":["Interval antrenmanı"]},{"dow":5,"enabled":true,"tasks":["Kısa koşu","Beslenme takibi"]},{"dow":6,"enabled":false,"tasks":[""]}]},{"name":"Tempo Artışı - 3. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["Uzun koşu","Esneme"]},{"dow":2,"enabled":true,"tasks":["Tempo koşusu"]},{"dow":3,"enabled":true,"tasks":["Dinlenme koşusu","Kuvvet"]},{"dow":4,"enabled":true,"tasks":["Interval antrenmanı"]},{"dow":5,"enabled":true,"tasks":["Kısa koşu","Beslenme takibi"]},{"dow":6,"enabled":false,"tasks":[""]}]},{"name":"Tempo Artışı - 4. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["Uzun koşu","Esneme"]},{"dow":2,"enabled":true,"tasks":["Tempo koşusu"]},{"dow":3,"enabled":true,"tasks":["Dinlenme koşusu","Kuvvet"]},{"dow":4,"enabled":true,"tasks":["Interval antrenmanı"]},{"dow":5,"enabled":true,"tasks":["Kısa koşu","Beslenme takibi"]},{"dow":6,"enabled":false,"tasks":[""]}]},{"name":"Yarış Hazırlığı - 1. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["Uzun koşu","Esneme"]},{"dow":2,"enabled":true,"tasks":["Tempo koşusu"]},{"dow":3,"enabled":true,"tasks":["Dinlenme koşusu","Kuvvet"]},{"dow":4,"enabled":true,"tasks":["Interval antrenmanı"]},{"dow":5,"enabled":true,"tasks":["Kısa koşu","Beslenme takibi"]},{"dow":6,"enabled":false,"tasks":[""]}]},{"name":"Yarış Hazırlığı - 2. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["Uzun koşu","Esneme"]},{"dow":2,"enabled":true,"tasks":["Tempo koşusu"]},{"dow":3,"enabled":true,"tasks":["Dinlenme koşusu","Kuvvet"]},{"dow":4,"enabled":true,"tasks":["Interval antrenmanı"]},{"dow":5,"enabled":true,"tasks":["Kısa koşu","Beslenme takibi"]},{"dow":6,"enabled":false,"tasks":[""]}]},{"name":"Yarış Hazırlığı - 3. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["Uzun koşu","Esneme"]},{"dow":2,"enabled":true,"tasks":["Tempo koşusu"]},{"dow":3,"enabled":true,"tasks":["Dinlenme koşusu","Kuvvet"]},{"dow":4,"enabled":true,"tasks":["Interval antrenmanı"]},{"dow":5,"enabled":true,"tasks":["Kısa koşu","Beslenme takibi"]},{"dow":6,"enabled":false,"tasks":[""]}]},{"name":"Yarış Hazırlığı - 4. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["Uzun koşu","Esneme"]},{"dow":2,"enabled":true,"tasks":["Tempo koşusu"]},{"dow":3,"enabled":true,"tasks":["Dinlenme koşusu","Kuvvet"]},{"dow":4,"enabled":true,"tasks":["Interval antrenmanı"]},{"dow":5,"enabled":true,"tasks":["Kısa koşu","Beslenme takibi"]},{"dow":6,"enabled":false,"tasks":[""]}]}]},{"icon":"🗣️","name":"6 Aylık İngilizce Programı","weekCount":24,"bufferDay":0,"weeks":[{"name":"Temel - 1. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["30 dk kelime","10 dk konuşma"]},{"dow":2,"enabled":true,"tasks":["Gramer alıştırmaları"]},{"dow":3,"enabled":true,"tasks":["30 dk kelime","Podcast dinle"]},{"dow":4,"enabled":true,"tasks":["Yazma pratiği"]},{"dow":5,"enabled":true,"tasks":["Kelime tekrar","Haftalık özet"]},{"dow":6,"enabled":true,"tasks":["Film izle (İngilizce)"]}]},{"name":"Temel - 2. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["30 dk kelime","10 dk konuşma"]},{"dow":2,"enabled":true,"tasks":["Gramer alıştırmaları"]},{"dow":3,"enabled":true,"tasks":["30 dk kelime","Podcast dinle"]},{"dow":4,"enabled":true,"tasks":["Yazma pratiği"]},{"dow":5,"enabled":true,"tasks":["Kelime tekrar","Haftalık özet"]},{"dow":6,"enabled":true,"tasks":["Film izle (İngilizce)"]}]},{"name":"Temel - 3. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["30 dk kelime","10 dk konuşma"]},{"dow":2,"enabled":true,"tasks":["Gramer alıştırmaları"]},{"dow":3,"enabled":true,"tasks":["30 dk kelime","Podcast dinle"]},{"dow":4,"enabled":true,"tasks":["Yazma pratiği"]},{"dow":5,"enabled":true,"tasks":["Kelime tekrar","Haftalık özet"]},{"dow":6,"enabled":true,"tasks":["Film izle (İngilizce)"]}]},{"name":"Temel - 4. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["30 dk kelime","10 dk konuşma"]},{"dow":2,"enabled":true,"tasks":["Gramer alıştırmaları"]},{"dow":3,"enabled":true,"tasks":["30 dk kelime","Podcast dinle"]},{"dow":4,"enabled":true,"tasks":["Yazma pratiği"]},{"dow":5,"enabled":true,"tasks":["Kelime tekrar","Haftalık özet"]},{"dow":6,"enabled":true,"tasks":["Film izle (İngilizce)"]}]},{"name":"Temel - 5. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["30 dk kelime","10 dk konuşma"]},{"dow":2,"enabled":true,"tasks":["Gramer alıştırmaları"]},{"dow":3,"enabled":true,"tasks":["30 dk kelime","Podcast dinle"]},{"dow":4,"enabled":true,"tasks":["Yazma pratiği"]},{"dow":5,"enabled":true,"tasks":["Kelime tekrar","Haftalık özet"]},{"dow":6,"enabled":true,"tasks":["Film izle (İngilizce)"]}]},{"name":"Temel - 6. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["30 dk kelime","10 dk konuşma"]},{"dow":2,"enabled":true,"tasks":["Gramer alıştırmaları"]},{"dow":3,"enabled":true,"tasks":["30 dk kelime","Podcast dinle"]},{"dow":4,"enabled":true,"tasks":["Yazma pratiği"]},{"dow":5,"enabled":true,"tasks":["Kelime tekrar","Haftalık özet"]},{"dow":6,"enabled":true,"tasks":["Film izle (İngilizce)"]}]},{"name":"Temel - 7. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["30 dk kelime","10 dk konuşma"]},{"dow":2,"enabled":true,"tasks":["Gramer alıştırmaları"]},{"dow":3,"enabled":true,"tasks":["30 dk kelime","Podcast dinle"]},{"dow":4,"enabled":true,"tasks":["Yazma pratiği"]},{"dow":5,"enabled":true,"tasks":["Kelime tekrar","Haftalık özet"]},{"dow":6,"enabled":true,"tasks":["Film izle (İngilizce)"]}]},{"name":"Temel - 8. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["30 dk kelime","10 dk konuşma"]},{"dow":2,"enabled":true,"tasks":["Gramer alıştırmaları"]},{"dow":3,"enabled":true,"tasks":["30 dk kelime","Podcast dinle"]},{"dow":4,"enabled":true,"tasks":["Yazma pratiği"]},{"dow":5,"enabled":true,"tasks":["Kelime tekrar","Haftalık özet"]},{"dow":6,"enabled":true,"tasks":["Film izle (İngilizce)"]}]},{"name":"Orta - 1. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["30 dk kelime","10 dk konuşma"]},{"dow":2,"enabled":true,"tasks":["Gramer alıştırmaları"]},{"dow":3,"enabled":true,"tasks":["30 dk kelime","Podcast dinle"]},{"dow":4,"enabled":true,"tasks":["Yazma pratiği"]},{"dow":5,"enabled":true,"tasks":["Kelime tekrar","Haftalık özet"]},{"dow":6,"enabled":true,"tasks":["Film izle (İngilizce)"]}]},{"name":"Orta - 2. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["30 dk kelime","10 dk konuşma"]},{"dow":2,"enabled":true,"tasks":["Gramer alıştırmaları"]},{"dow":3,"enabled":true,"tasks":["30 dk kelime","Podcast dinle"]},{"dow":4,"enabled":true,"tasks":["Yazma pratiği"]},{"dow":5,"enabled":true,"tasks":["Kelime tekrar","Haftalık özet"]},{"dow":6,"enabled":true,"tasks":["Film izle (İngilizce)"]}]},{"name":"Orta - 3. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["30 dk kelime","10 dk konuşma"]},{"dow":2,"enabled":true,"tasks":["Gramer alıştırmaları"]},{"dow":3,"enabled":true,"tasks":["30 dk kelime","Podcast dinle"]},{"dow":4,"enabled":true,"tasks":["Yazma pratiği"]},{"dow":5,"enabled":true,"tasks":["Kelime tekrar","Haftalık özet"]},{"dow":6,"enabled":true,"tasks":["Film izle (İngilizce)"]}]},{"name":"Orta - 4. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["30 dk kelime","10 dk konuşma"]},{"dow":2,"enabled":true,"tasks":["Gramer alıştırmaları"]},{"dow":3,"enabled":true,"tasks":["30 dk kelime","Podcast dinle"]},{"dow":4,"enabled":true,"tasks":["Yazma pratiği"]},{"dow":5,"enabled":true,"tasks":["Kelime tekrar","Haftalık özet"]},{"dow":6,"enabled":true,"tasks":["Film izle (İngilizce)"]}]},{"name":"Orta - 5. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["30 dk kelime","10 dk konuşma"]},{"dow":2,"enabled":true,"tasks":["Gramer alıştırmaları"]},{"dow":3,"enabled":true,"tasks":["30 dk kelime","Podcast dinle"]},{"dow":4,"enabled":true,"tasks":["Yazma pratiği"]},{"dow":5,"enabled":true,"tasks":["Kelime tekrar","Haftalık özet"]},{"dow":6,"enabled":true,"tasks":["Film izle (İngilizce)"]}]},{"name":"Orta - 6. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["30 dk kelime","10 dk konuşma"]},{"dow":2,"enabled":true,"tasks":["Gramer alıştırmaları"]},{"dow":3,"enabled":true,"tasks":["30 dk kelime","Podcast dinle"]},{"dow":4,"enabled":true,"tasks":["Yazma pratiği"]},{"dow":5,"enabled":true,"tasks":["Kelime tekrar","Haftalık özet"]},{"dow":6,"enabled":true,"tasks":["Film izle (İngilizce)"]}]},{"name":"Orta - 7. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["30 dk kelime","10 dk konuşma"]},{"dow":2,"enabled":true,"tasks":["Gramer alıştırmaları"]},{"dow":3,"enabled":true,"tasks":["30 dk kelime","Podcast dinle"]},{"dow":4,"enabled":true,"tasks":["Yazma pratiği"]},{"dow":5,"enabled":true,"tasks":["Kelime tekrar","Haftalık özet"]},{"dow":6,"enabled":true,"tasks":["Film izle (İngilizce)"]}]},{"name":"Orta - 8. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["30 dk kelime","10 dk konuşma"]},{"dow":2,"enabled":true,"tasks":["Gramer alıştırmaları"]},{"dow":3,"enabled":true,"tasks":["30 dk kelime","Podcast dinle"]},{"dow":4,"enabled":true,"tasks":["Yazma pratiği"]},{"dow":5,"enabled":true,"tasks":["Kelime tekrar","Haftalık özet"]},{"dow":6,"enabled":true,"tasks":["Film izle (İngilizce)"]}]},{"name":"İleri - 1. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["30 dk kelime","10 dk konuşma"]},{"dow":2,"enabled":true,"tasks":["Gramer alıştırmaları"]},{"dow":3,"enabled":true,"tasks":["30 dk kelime","Podcast dinle"]},{"dow":4,"enabled":true,"tasks":["Yazma pratiği"]},{"dow":5,"enabled":true,"tasks":["Kelime tekrar","Haftalık özet"]},{"dow":6,"enabled":true,"tasks":["Film izle (İngilizce)"]}]},{"name":"İleri - 2. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["30 dk kelime","10 dk konuşma"]},{"dow":2,"enabled":true,"tasks":["Gramer alıştırmaları"]},{"dow":3,"enabled":true,"tasks":["30 dk kelime","Podcast dinle"]},{"dow":4,"enabled":true,"tasks":["Yazma pratiği"]},{"dow":5,"enabled":true,"tasks":["Kelime tekrar","Haftalık özet"]},{"dow":6,"enabled":true,"tasks":["Film izle (İngilizce)"]}]},{"name":"İleri - 3. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["30 dk kelime","10 dk konuşma"]},{"dow":2,"enabled":true,"tasks":["Gramer alıştırmaları"]},{"dow":3,"enabled":true,"tasks":["30 dk kelime","Podcast dinle"]},{"dow":4,"enabled":true,"tasks":["Yazma pratiği"]},{"dow":5,"enabled":true,"tasks":["Kelime tekrar","Haftalık özet"]},{"dow":6,"enabled":true,"tasks":["Film izle (İngilizce)"]}]},{"name":"İleri - 4. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["30 dk kelime","10 dk konuşma"]},{"dow":2,"enabled":true,"tasks":["Gramer alıştırmaları"]},{"dow":3,"enabled":true,"tasks":["30 dk kelime","Podcast dinle"]},{"dow":4,"enabled":true,"tasks":["Yazma pratiği"]},{"dow":5,"enabled":true,"tasks":["Kelime tekrar","Haftalık özet"]},{"dow":6,"enabled":true,"tasks":["Film izle (İngilizce)"]}]},{"name":"İleri - 5. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["30 dk kelime","10 dk konuşma"]},{"dow":2,"enabled":true,"tasks":["Gramer alıştırmaları"]},{"dow":3,"enabled":true,"tasks":["30 dk kelime","Podcast dinle"]},{"dow":4,"enabled":true,"tasks":["Yazma pratiği"]},{"dow":5,"enabled":true,"tasks":["Kelime tekrar","Haftalık özet"]},{"dow":6,"enabled":true,"tasks":["Film izle (İngilizce)"]}]},{"name":"İleri - 6. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["30 dk kelime","10 dk konuşma"]},{"dow":2,"enabled":true,"tasks":["Gramer alıştırmaları"]},{"dow":3,"enabled":true,"tasks":["30 dk kelime","Podcast dinle"]},{"dow":4,"enabled":true,"tasks":["Yazma pratiği"]},{"dow":5,"enabled":true,"tasks":["Kelime tekrar","Haftalık özet"]},{"dow":6,"enabled":true,"tasks":["Film izle (İngilizce)"]}]},{"name":"İleri - 7. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["30 dk kelime","10 dk konuşma"]},{"dow":2,"enabled":true,"tasks":["Gramer alıştırmaları"]},{"dow":3,"enabled":true,"tasks":["30 dk kelime","Podcast dinle"]},{"dow":4,"enabled":true,"tasks":["Yazma pratiği"]},{"dow":5,"enabled":true,"tasks":["Kelime tekrar","Haftalık özet"]},{"dow":6,"enabled":true,"tasks":["Film izle (İngilizce)"]}]},{"name":"İleri - 8. Hafta","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["30 dk kelime","10 dk konuşma"]},{"dow":2,"enabled":true,"tasks":["Gramer alıştırmaları"]},{"dow":3,"enabled":true,"tasks":["30 dk kelime","Podcast dinle"]},{"dow":4,"enabled":true,"tasks":["Yazma pratiği"]},{"dow":5,"enabled":true,"tasks":["Kelime tekrar","Haftalık özet"]},{"dow":6,"enabled":true,"tasks":["Film izle (İngilizce)"]}]}]},{"icon":"💪","name":"4 Haftalık Detoks","weekCount":4,"bufferDay":0,"weeks":[{"name":"Hazırlık Haftası","days":[{"dow":0,"enabled":true,"tasks":["Haftalık hazırlık"]},{"dow":1,"enabled":true,"tasks":["Sabah suyu 1L","Şekersiz beslen","30 dk egzersiz"]},{"dow":2,"enabled":true,"tasks":["Meditasyon 10 dk","Yeşil smoothie"]},{"dow":3,"enabled":true,"tasks":["Sabah suyu","30 dk yürüyüş"]},{"dow":4,"enabled":true,"tasks":["Meditasyon","Erken uyku"]},{"dow":5,"enabled":true,"tasks":["Sabah suyu","Haftalık değerlendirme"]},{"dow":6,"enabled":true,"tasks":["Aktif dinlenme"]}]},{"name":"Yoğunlaşma Haftası","days":[{"dow":0,"enabled":true,"tasks":["Haftalık hazırlık"]},{"dow":1,"enabled":true,"tasks":["Sabah suyu 1L","Şekersiz beslen","30 dk egzersiz"]},{"dow":2,"enabled":true,"tasks":["Meditasyon 10 dk","Yeşil smoothie"]},{"dow":3,"enabled":true,"tasks":["Sabah suyu","30 dk yürüyüş"]},{"dow":4,"enabled":true,"tasks":["Meditasyon","Erken uyku"]},{"dow":5,"enabled":true,"tasks":["Sabah suyu","Haftalık değerlendirme"]},{"dow":6,"enabled":true,"tasks":["Aktif dinlenme"]}]},{"name":"Derin Temizlik Haftası","days":[{"dow":0,"enabled":true,"tasks":["Haftalık hazırlık"]},{"dow":1,"enabled":true,"tasks":["Sabah suyu 1L","Şekersiz beslen","30 dk egzersiz"]},{"dow":2,"enabled":true,"tasks":["Meditasyon 10 dk","Yeşil smoothie"]},{"dow":3,"enabled":true,"tasks":["Sabah suyu","30 dk yürüyüş"]},{"dow":4,"enabled":true,"tasks":["Meditasyon","Erken uyku"]},{"dow":5,"enabled":true,"tasks":["Sabah suyu","Haftalık değerlendirme"]},{"dow":6,"enabled":true,"tasks":["Aktif dinlenme"]}]},{"name":"Pekiştirme Haftası","days":[{"dow":0,"enabled":true,"tasks":["Haftalık hazırlık"]},{"dow":1,"enabled":true,"tasks":["Sabah suyu 1L","Şekersiz beslen","30 dk egzersiz"]},{"dow":2,"enabled":true,"tasks":["Meditasyon 10 dk","Yeşil smoothie"]},{"dow":3,"enabled":true,"tasks":["Sabah suyu","30 dk yürüyüş"]},{"dow":4,"enabled":true,"tasks":["Meditasyon","Erken uyku"]},{"dow":5,"enabled":true,"tasks":["Sabah suyu","Haftalık değerlendirme"]},{"dow":6,"enabled":true,"tasks":["Aktif dinlenme"]}]}]},{"icon":"🧘","name":"8 Haftalık Mindfulness","weekCount":8,"bufferDay":null,"weeks":[{"name":"1. Hafta · Farkındalık","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["Sabah meditasyonu 10 dk","Günlük yaz"]},{"dow":2,"enabled":true,"tasks":["Nefes egzersizi"]},{"dow":3,"enabled":true,"tasks":["Sabah meditasyonu","Şükran listesi"]},{"dow":4,"enabled":true,"tasks":["Yürüyüş meditasyonu"]},{"dow":5,"enabled":true,"tasks":["Sabah meditasyonu","Haftalık özet"]},{"dow":6,"enabled":false,"tasks":[""]}]},{"name":"2. Hafta · Nefes","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["Sabah meditasyonu 10 dk","Günlük yaz"]},{"dow":2,"enabled":true,"tasks":["Nefes egzersizi"]},{"dow":3,"enabled":true,"tasks":["Sabah meditasyonu","Şükran listesi"]},{"dow":4,"enabled":true,"tasks":["Yürüyüş meditasyonu"]},{"dow":5,"enabled":true,"tasks":["Sabah meditasyonu","Haftalık özet"]},{"dow":6,"enabled":false,"tasks":[""]}]},{"name":"3. Hafta · Beden Taraması","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["Sabah meditasyonu 10 dk","Günlük yaz"]},{"dow":2,"enabled":true,"tasks":["Nefes egzersizi"]},{"dow":3,"enabled":true,"tasks":["Sabah meditasyonu","Şükran listesi"]},{"dow":4,"enabled":true,"tasks":["Yürüyüş meditasyonu"]},{"dow":5,"enabled":true,"tasks":["Sabah meditasyonu","Haftalık özet"]},{"dow":6,"enabled":false,"tasks":[""]}]},{"name":"4. Hafta · Duygu Yönetimi","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["Sabah meditasyonu 10 dk","Günlük yaz"]},{"dow":2,"enabled":true,"tasks":["Nefes egzersizi"]},{"dow":3,"enabled":true,"tasks":["Sabah meditasyonu","Şükran listesi"]},{"dow":4,"enabled":true,"tasks":["Yürüyüş meditasyonu"]},{"dow":5,"enabled":true,"tasks":["Sabah meditasyonu","Haftalık özet"]},{"dow":6,"enabled":false,"tasks":[""]}]},{"name":"5. Hafta · Odaklanma","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["Sabah meditasyonu 10 dk","Günlük yaz"]},{"dow":2,"enabled":true,"tasks":["Nefes egzersizi"]},{"dow":3,"enabled":true,"tasks":["Sabah meditasyonu","Şükran listesi"]},{"dow":4,"enabled":true,"tasks":["Yürüyüş meditasyonu"]},{"dow":5,"enabled":true,"tasks":["Sabah meditasyonu","Haftalık özet"]},{"dow":6,"enabled":false,"tasks":[""]}]},{"name":"6. Hafta · Kabul","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["Sabah meditasyonu 10 dk","Günlük yaz"]},{"dow":2,"enabled":true,"tasks":["Nefes egzersizi"]},{"dow":3,"enabled":true,"tasks":["Sabah meditasyonu","Şükran listesi"]},{"dow":4,"enabled":true,"tasks":["Yürüyüş meditasyonu"]},{"dow":5,"enabled":true,"tasks":["Sabah meditasyonu","Haftalık özet"]},{"dow":6,"enabled":false,"tasks":[""]}]},{"name":"7. Hafta · Şükran","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["Sabah meditasyonu 10 dk","Günlük yaz"]},{"dow":2,"enabled":true,"tasks":["Nefes egzersizi"]},{"dow":3,"enabled":true,"tasks":["Sabah meditasyonu","Şükran listesi"]},{"dow":4,"enabled":true,"tasks":["Yürüyüş meditasyonu"]},{"dow":5,"enabled":true,"tasks":["Sabah meditasyonu","Haftalık özet"]},{"dow":6,"enabled":false,"tasks":[""]}]},{"name":"8. Hafta · Entegrasyon","days":[{"dow":0,"enabled":false,"tasks":[""]},{"dow":1,"enabled":true,"tasks":["Sabah meditasyonu 10 dk","Günlük yaz"]},{"dow":2,"enabled":true,"tasks":["Nefes egzersizi"]},{"dow":3,"enabled":true,"tasks":["Sabah meditasyonu","Şükran listesi"]},{"dow":4,"enabled":true,"tasks":["Yürüyüş meditasyonu"]},{"dow":5,"enabled":true,"tasks":["Sabah meditasyonu","Haftalık özet"]},{"dow":6,"enabled":false,"tasks":[""]}]}]}]
function getProTemplates() { return PRO_TEMPLATES }

function buildWeeks(n) {
  return Array.from({length:n}, (_,i) => ({
    name: `${i+1}. Hafta`,
    days: Array.from({length:7}, (_,d) => ({ dow:d, enabled:d>=1&&d<=5, tasks:[''] }))
  }))
}

export default function ProfessionalPlanModal({ user, onClose, onSaved }) {
  const [view,      setView]      = useState('start')
  const [planName,  setPlanName]  = useState('')
  const [weekCount, setWkCount]   = useState(4)
  const [bufferDay, setBufferDay] = useState(null)
  // weeks sadece yapısal bilgiyi tutar (enabled/tasks count)
  // gerçek task metinleri inputRefs'te
  const [weeks,     setWeeks]     = useState(() => buildWeeks(4))
  const [activeWk,  setActiveWk]  = useState(0)
  const [saving,    setSaving]    = useState(false)

  // Her input için ref tut: key = `${wi}-${dow}-${ti}`, weekname = `wkname-${wi}`
  const inputRefs = useRef({})

  const supabase = createClient()

  // Hafta değişince o haftanın input değerlerini ref'lerden oku ve weeks'e yaz
  function flushCurrentWeek() {
    const wi = activeWk
    const nameEl = inputRefs.current[`wkname-${wi}`]
    if (nameEl) {
      setWeeks(p => p.map((w,i) => i===wi ? {...w, name: nameEl.value||w.name} : w))
    }
    setWeeks(p => p.map((w,i) => {
      if (i !== wi) return w
      return {
        ...w,
        days: w.days.map(d => ({
          ...d,
          tasks: d.tasks.map((t,ti) => {
            const el = inputRefs.current[`${wi}-${d.dow}-${ti}`]
            return el ? el.value : t
          })
        }))
      }
    }))
  }

  function switchWeek(newWi) {
    flushCurrentWeek()
    setActiveWk(newWi)
  }

  function applyTemplate(tpl) {
    inputRefs.current = {}
    setPlanName(tpl.name)
    setWkCount(tpl.weekCount)
    setWeeks(tpl.weeks.map(w => ({
      ...w,
      days: Array.from({length:7}, (_,d) => {
        const found = w.days.find(x => x.dow === d)
        return found || { dow:d, enabled:false, tasks:[''] }
      })
    })))
    setBufferDay(tpl.bufferDay ?? null)
    setActiveWk(0)
    setView('weeks')
  }

  function changeWeekCount(n) {
    flushCurrentWeek()
    const count = Math.max(1, Math.min(52, n))
    setWkCount(count)
    setWeeks(prev => {
      if (count > prev.length) {
        const extra = Array.from({length:count-prev.length}, (_,i) => ({
          name:`${prev.length+i+1}. Hafta`,
          days: Array.from({length:7}, (_,d) => ({ dow:d, enabled:d>=1&&d<=5, tasks:[''] }))
        }))
        return [...prev, ...extra]
      }
      return prev.slice(0, count)
    })
  }

  function toggleDay(wi, dow) {
    setWeeks(p => p.map((w,i) => i!==wi ? w : {
      ...w,
      days: w.days.map(d => d.dow===dow ? {...d, enabled:!d.enabled} : d)
    }))
  }

  function addTask(wi, dow) {
    setWeeks(p => p.map((w,i) => i!==wi ? w : {
      ...w,
      days: w.days.map(d => d.dow!==dow ? d : {...d, tasks:[...d.tasks,'']})
    }))
  }

  function removeTask(wi, dow, ti) {
    // Önce ref'ten sil
    delete inputRefs.current[`${wi}-${dow}-${ti}`]
    setWeeks(p => p.map((w,i) => i!==wi ? w : {
      ...w,
      days: w.days.map(d => d.dow!==dow ? d : {
        ...d,
        tasks: d.tasks.length>1 ? d.tasks.filter((_,j)=>j!==ti) : ['']
      })
    }))
  }

  function copyToNext(wi) {
    flushCurrentWeek()
    if (wi >= weeks.length-1) return
    setWeeks(p => p.map((w,i) => i===wi+1 ? {
      ...w,
      days: p[wi].days.map(d => ({...d, tasks:[...d.tasks]}))
    } : w))
  }

  // Kaydederken ref'lerden güncel değerleri topla
  async function handleSave() {
    if (!planName.trim()) { alert('Plan adı gir'); return }
    flushCurrentWeek()

    // Kısa bir tick bekle ki flush tamamlansın
    await new Promise(r => setTimeout(r, 50))

    setSaving(true)
    try {
      // weeks state'ini al, ama input ref'lerinden güncel değerleri kullan
      const finalWeeks = weeks.map((w,wi) => {
        const nameEl = inputRefs.current[`wkname-${wi}`]
        const name   = nameEl ? nameEl.value.trim()||w.name : w.name
        return {
          ...w, name,
          days: w.days.map(d => ({
            ...d,
            tasks: d.tasks.map((t,ti) => {
              const el = inputRefs.current[`${wi}-${d.dow}-${ti}`]
              return el ? el.value.trim() : t.trim()
            })
          }))
        }
      })

      const { data:goal } = await supabase.from('goals').insert({
        name:            planName.trim(),
        total_days:      weekCount * 7,
        start_date:      new Date().toISOString().slice(0,10),
        user_id:         user.id,
        is_professional: true,
        buffer_day:      bufferDay,
      }).select().single()
      if (!goal) throw new Error('Hedef oluşturulamadı')

      const taskRows = []
      finalWeeks.forEach((week, wi) => {
        week.days.forEach(day => {
          if (!day.enabled) return
          day.tasks.filter(t => t).forEach((taskName, ti) => {
            taskRows.push({ goal_id:goal.id, name:taskName, order_index:ti, active_days:[day.dow], week_number:wi+1, week_name:week.name })
          })
        })
        if (bufferDay != null) {
          taskRows.push({ goal_id:goal.id, name:'⚡ Telafi Günü', order_index:99, active_days:[bufferDay], week_number:wi+1, week_name:week.name, is_buffer:true })
        }
      })
      if (taskRows.length) await supabase.from('tasks').insert(taskRows)
      onSaved()
    } catch(e) { alert('Hata: ' + e.message) }
    setSaving(false)
  }

  const wk = weeks[activeWk] || weeks[0] || null
  // Görev sayısını ref'lerden de hesapla
  const totalTasks = weeks.reduce((s,w,wi) =>
    s + w.days.reduce((s2,d) => {
      if (!d.enabled) return s2
      return s2 + d.tasks.filter((t,ti) => {
        const el = inputRefs.current[`${wi}-${d.dow}-${ti}`]
        return el ? el.value.trim() : t.trim()
      }).length
    }, 0)
  , 0)

  if (view === 'start') return (
    <div style={s.overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={s.sheet}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <div>
            <div style={{fontSize:18,fontWeight:800,color:'var(--text)'}}>Profesyonel Plan</div>
            <div style={{fontSize:12,color:'var(--text3)',marginTop:2}}>Haftalık yapılandırılmış hedef sistemi</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'var(--text3)',fontSize:20,cursor:'pointer'}}>✕</button>
        </div>
        <span style={s.label}>Hazır Şablonlar</span>
        <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:20}}>
          {getProTemplates().map((tpl,i) => (
            <button key={i} onClick={()=>applyTemplate(tpl)} style={{display:'flex',alignItems:'center',gap:12,padding:'13px 16px',background:'var(--surface2)',border:'1.5px solid var(--border)',borderRadius:16,cursor:'pointer',textAlign:'left',width:'100%'}}>
              <span style={{fontSize:24,flexShrink:0}}>{tpl.icon}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:'var(--text)'}}>{tpl.name}</div>
                <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>{tpl.weekCount} hafta · {tpl.weeks[0].days.filter(d=>d.enabled).length} gün/hafta</div>
              </div>
              <span style={{color:'var(--accent)',fontSize:16}}>→</span>
            </button>
          ))}
        </div>
        <div style={{height:1,background:'var(--border)',margin:'4px 0 16px'}}/>
        <button onClick={()=>setView('setup')} style={{...s.btn('ghost'),width:'100%',padding:'12px',textAlign:'center'}}>
          + Sıfırdan Oluştur
        </button>
      </div>
    </div>
  )

  if (view === 'setup') return (
    <div style={s.overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={s.sheet}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <div>
            <button onClick={()=>setView('start')} style={{background:'none',border:'none',color:'var(--accent)',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit',padding:0}}>← Şablonlar</button>
            <div style={{fontSize:18,fontWeight:800,color:'var(--text)',marginTop:4}}>Plan Ayarları</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'var(--text3)',fontSize:20,cursor:'pointer'}}>✕</button>
        </div>
        <div style={{background:'var(--surface2)',borderRadius:16,padding:16,marginBottom:14}}>
          <div style={{marginBottom:12}}>
            <span style={s.label}>Plan Adı</span>
            <input value={planName} onChange={e=>setPlanName(e.target.value)} placeholder="örn: 12 Haftalık Fitness Programı" style={s.input}/>
          </div>
          <div>
            <span style={s.label}>Toplam Hafta Sayısı</span>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <button onClick={()=>changeWeekCount(weekCount-1)} style={{...s.btn(),width:36,height:36,padding:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,borderRadius:10}}>−</button>
              <input type="number" min={1} max={52} value={weekCount} onChange={e=>changeWeekCount(parseInt(e.target.value)||1)} style={{...s.input,width:70,textAlign:'center'}}/>
              <button onClick={()=>changeWeekCount(weekCount+1)} style={{...s.btn(),width:36,height:36,padding:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,borderRadius:10}}>+</button>
              <span style={{fontSize:12,color:'var(--text3)'}}>{weekCount*7} gün</span>
            </div>
          </div>
        </div>
        <div style={{background:'rgba(251,191,36,0.07)',border:'1.5px solid rgba(251,191,36,0.25)',borderRadius:16,padding:14,marginBottom:14}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:bufferDay!=null?10:0}}>
            <span style={{fontSize:16}}>⚡</span>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700,color:'var(--mid)'}}>Telafi Günü</div>
              <div style={{fontSize:11,color:'var(--text3)'}}>Her haftaya otomatik 1 telafi günü ekle</div>
            </div>
            <button onClick={()=>setBufferDay(bufferDay!=null?null:0)} style={{padding:'6px 12px',borderRadius:10,border:`1.5px solid ${bufferDay!=null?'rgba(251,191,36,0.5)':'var(--border)'}`,background:bufferDay!=null?'rgba(251,191,36,0.15)':'var(--surface2)',color:bufferDay!=null?'var(--mid)':'var(--text3)',fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
              {bufferDay!=null?'Açık':'Kapalı'}
            </button>
          </div>
          {bufferDay!=null && (
            <div>
              <span style={s.label}>Hangi gün?</span>
              <div style={{display:'flex',gap:5}}>
                {[1,2,3,4,5,6,0].map(dow => (
                  <button key={dow} onClick={()=>setBufferDay(dow)} style={s.dayBtn(bufferDay===dow)}>{DOW_TR[dow]}</button>
                ))}
              </div>
            </div>
          )}
        </div>
        <button onClick={()=>setView('weeks')} disabled={!planName.trim()} style={{...s.btn('primary'),width:'100%',padding:'13px',opacity:planName.trim()?1:0.5}}>
          Haftalara Devam →
        </button>
      </div>
    </div>
  )

  // ── Haftaları düzenle ──
  return (
    <div style={s.overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={s.sheet}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div>
            <button onClick={()=>{flushCurrentWeek();setView('setup')}} style={{background:'none',border:'none',color:'var(--accent)',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit',padding:0}}>← Ayarlar</button>
            <div style={{fontSize:16,fontWeight:800,color:'var(--text)',marginTop:4}}>{planName}</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'var(--text3)',fontSize:20,cursor:'pointer'}}>✕</button>
        </div>

        {/* Hafta sekmeleri */}
        <div style={{display:'flex',gap:6,overflowX:'auto',paddingBottom:8,marginBottom:14,WebkitOverflowScrolling:'touch'}}>
          {weeks.map((w,i) => {
            const isMs = (i+1)%4===0
            return (
              <button key={i} onClick={()=>switchWeek(i)} style={{
                flexShrink:0, padding:'7px 13px', borderRadius:12, cursor:'pointer', fontFamily:'inherit',
                background: i===activeWk?'var(--accent)':'var(--surface2)',
                border: `1.5px solid ${i===activeWk?'var(--accent)':isMs?'rgba(251,191,36,0.4)':'var(--border)'}`,
                color: i===activeWk?'#fff':isMs?'var(--mid)':'var(--text3)',
                fontSize:12, fontWeight:700, position:'relative'
              }}>
                {w.name}
                {isMs&&i!==activeWk&&<span style={{position:'absolute',top:-4,right:-4,fontSize:10}}>🏆</span>}
              </button>
            )
          })}
        </div>

        {/* Aktif hafta */}
        {wk && (
          <div style={{background:'var(--surface2)',borderRadius:18,padding:16,marginBottom:14}}>
            <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:14}}>
              {/* Hafta adı — uncontrolled, ref ile */}
              <input
                key={`wkname-${activeWk}`}
                ref={el => { if(el) inputRefs.current[`wkname-${activeWk}`] = el }}
                defaultValue={wk.name}
                placeholder="Hafta adı"
                style={{...s.input, fontSize:14, fontWeight:700}}
              />
              {activeWk<weeks.length-1 && (
                <button onClick={()=>copyToNext(activeWk)} style={{...s.btn(),padding:'10px 11px',fontSize:11,flexShrink:0,whiteSpace:'nowrap'}}>Kopyala →</button>
              )}
            </div>

            {(activeWk+1)%4===0 && (
              <div style={{background:'rgba(251,191,36,0.07)',border:'1.5px solid rgba(251,191,36,0.25)',borderRadius:12,padding:'8px 12px',marginBottom:12,fontSize:11,color:'var(--mid)',display:'flex',gap:6,alignItems:'center'}}>
                <span>🏆</span> Kilometre taşı haftası
              </div>
            )}

            <span style={s.label}>Aktif günler</span>
            <div style={{display:'flex',gap:5,marginBottom:16}}>
              {[1,2,3,4,5,6,0].map(dow => (
                <button key={dow} onClick={()=>toggleDay(activeWk,dow)} style={s.dayBtn(wk.days.find(d=>d.dow===dow)?.enabled||false)}>{DOW_TR[dow]}</button>
              ))}
            </div>

            {wk.days.filter(d=>d.enabled).length===0 ? (
              <div style={{textAlign:'center',padding:'16px 0',color:'var(--text3)',fontSize:13}}>Hiç aktif gün seçilmedi</div>
            ) : wk.days.filter(d=>d.enabled).map(day => (
              <div key={`${activeWk}-${day.dow}`} style={{marginBottom:14}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:7}}>
                  <span style={{fontSize:12,fontWeight:700,color:'var(--accent2)'}}>{DOW_FULL[day.dow]}</span>
                  <button onClick={()=>addTask(activeWk,day.dow)} style={{background:'none',border:'none',color:'var(--accent)',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>+ Görev ekle</button>
                </div>
                {day.tasks.map((task,ti) => (
                  <div key={`${activeWk}-${day.dow}-${ti}`} style={{display:'flex',gap:7,alignItems:'center',marginBottom:7}}>
                    {/* Tamamen uncontrolled input — ref ile */}
                    <input
                      ref={el => { if(el) inputRefs.current[`${activeWk}-${day.dow}-${ti}`] = el }}
                      defaultValue={task}
                      placeholder={`${DOW_FULL[day.dow]} görevi ${ti+1}`}
                      style={{...s.input, flex:1}}
                    />
                    <button onClick={()=>removeTask(activeWk,day.dow,ti)} style={{background:'none',border:'none',color:'var(--text3)',cursor:'pointer',fontSize:16,padding:'0 4px',flexShrink:0}}>✕</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        <div style={{background:'rgba(124,111,247,0.07)',border:'1.5px solid rgba(124,111,247,0.2)',borderRadius:14,padding:'10px 14px',marginBottom:16,fontSize:12,color:'var(--text2)'}}>
          <b style={{color:'var(--accent)'}}>{weekCount} hafta</b> · <b style={{color:'var(--accent)'}}>{weekCount*7} gün</b>
          {bufferDay!=null && <span style={{color:'var(--mid)'}}> · ⚡ {DOW_TR[bufferDay]} telafi günü</span>}
        </div>

        <div style={{display:'flex',gap:10}}>
          <button onClick={onClose} style={{...s.btn(),flex:'0 0 auto'}}>İptal</button>
          <button onClick={handleSave} disabled={saving||!planName.trim()} style={{...s.btn('primary'),flex:1,opacity:saving||!planName.trim()?0.5:1}}>
            {saving?'Oluşturuluyor...':'🚀 Planı Oluştur'}
          </button>
        </div>
      </div>
    </div>
  )
}
