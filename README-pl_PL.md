# Youtube Substriptions Dashboard

[English](README.md) | [Polski](README-pl_PL.md)

Rozszerzenie Manifest V3 dla Google Chrome i Microsoft Edge. Udostępnia czytelny, przechowywany lokalnie pulpit ostatnich filmów z wybranych kanałów YouTube, bez konieczności używania klucza YouTube API ani konta Google.

## Funkcje

- Dodawanie kanałów przez pełny adres YouTube, `@nazwę` lub identyfikator zaczynający się od `UC`.
- Pobieranie ostatnich publikacji z publicznych kanałów RSS YouTube.
- Konfigurowalny zakres historii od 1 do 365 dni.
- Organizowanie kanałów w zagnieżdżonych kategoriach i grupowanie pulpitu według kategorii.
- Filtrowanie według kategorii razem ze wszystkimi jej podkategoriami.
- Wyszukiwanie po nazwie kanału lub tytule filmu.
- Wyróżnianie filmów opublikowanych dzisiaj i ukrywanie pojedynczych filmów.
- Opcjonalne ukrywanie kanałów bez widocznych filmów.
- Wybór jasnego albo ciemnego motywu.
- Ręczne lub automatyczne odświeżanie kanałów i wyświetlanie postępu aktualizacji.
- Import i eksport ustawień oraz lokalnego cache do pliku JSON.
- Lokalne przechowywanie wszystkich danych aplikacji w `chrome.storage.local`.

## Instalacja w Chrome

1. Otwórz `chrome://extensions`.
2. Włącz **Tryb dewelopera**.
3. Wybierz **Załaduj rozpakowane**.
4. Wskaż katalog `YoutubeSubscriptionsDashboard`.
5. Kliknij ikonę rozszerzenia, aby otworzyć pulpit.

## Instalacja w Microsoft Edge

1. Otwórz `edge://extensions`.
2. Włącz **Tryb dewelopera**.
3. Wybierz **Załaduj rozpakowane**.
4. Wskaż katalog `YoutubeSubscriptionsDashboard`.
5. Kliknij ikonę rozszerzenia, aby otworzyć pulpit.

## Używanie

Otwórz ustawienia rozszerzenia, aby dodać kategorie i kanały. Kanał można podać na przykład jako:

```text
https://www.youtube.com/@kanal/videos
@kanal
UCxxxxxxxxxxxxxxxxxxxxxx
```

Na pulpicie można przeglądać filmy, filtrować kategorie, wyszukiwać, ukrywać pojedyncze pozycje i odświeżać dane kanałów. Ustawienia udostępniają także tworzenie i przywracanie kopii JSON. Import po potwierdzeniu zastępuje bieżące dane i sprawdza wybrany plik przed jego zapisaniem.

## Ograniczenie RSS

Kanał RSS YouTube zawiera tylko ograniczoną liczbę najnowszych publikacji. Rozszerzenie zachowuje wcześniej pobrane filmy w lokalnym cache, dopóki mieszczą się w skonfigurowanym zakresie historii. Przy pierwszym dodaniu kanału rozszerzenie nie może odtworzyć starszych publikacji, których nie ma już w aktualnym kanale RSS.

## Dane i prywatność

Rozszerzenie nie loguje się do Google, nie odczytuje historii przeglądarki ani historii oglądania w YouTube i nie wysyła danych do własnego serwera. Łączy się z YouTube w celu rozpoznawania kanałów i pobierania publicznych kanałów RSS. Ustawienia, kategorie, kanały, cache filmów oraz informacje o ukrytych filmach pozostają w profilu przeglądarki, chyba że użytkownik sam wyeksportuje je do pliku JSON.

## Informacje o projekcie

- Wersja: `1.0.0.0`
- Autor: Kamil Karpiński
- Licencja: [GNU General Public License v3.0](LICENSE)
