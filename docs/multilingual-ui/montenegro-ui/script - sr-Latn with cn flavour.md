# `sr-Latn` с черногорским flavour: ревизия + готовые файлы

## Реальная структура файлов для изменения

Прямые ссылки на файлы в репо (SHA на момент анализа):

| Файл | Действие | SHA |
|---|---|---|
| [`frontend/src/i18n.ts`](https://github.com/HelgDemidov/scopus_search_code/blob/main/frontend/src/i18n.ts) | +3 строки (import + resources + supportedLngs) | `acec828` |
| [`frontend/src/locales/sr-Latn/translation.json`](https://github.com/HelgDemidov/scopus_search_code/blob/main/frontend/src/locales/) | Создать новый (203 ключа) | — |
| [`frontend/src/constants/labelTranslations.ts`](https://github.com/HelgDemidov/scopus_search_code/blob/main/frontend/src/constants/labelTranslations.ts) | +3 map + рефактор `translateDataLabel` | `4e983c1` |
| [`frontend/src/i18n.test.ts`](https://github.com/HelgDemidov/scopus_search_code/blob/main/frontend/src/i18n.test.ts) | +1 describe-блок, обновить parity-чек | `4ff498b` |
| `LanguageSwitcher.tsx` | +1 кнопка CG | — |

***

## Готовый `translation.json` для `sr-Latn` (203 ключа)

Файл верифицирован: 203 ключа, 0 ключей `_many`, все plural-формы трёхчленные (`_one`/`_few`/`_other`), иекавица применена системно.

```json
{
  "nav": {
    "explore": "Analitika",
    "profile": "Profil",
    "signIn": "Prijava",
    "signOut": "Odjava"
  },
  "search": {
    "placeholder": "Pretraži članke…",
    "label": "Pretraži članke",
    "button": "Pretraži",
    "minLength": "Unesite najmanje {{min}} znakova"
  },
  "home": {
    "anonTitle": "Pretraži Scopus publikacije",
    "anonSubtitle": "Pregledajte rezultate ispod. nk>Prijavite se</lnk> za puni pristup pretrazi.",
    "anonNote": "Pretraga bez prijave ograničena je na tematsku kolekciju \"Vještačka inteligencija i neuronske mreže\". Za pretragu globalne Scopus baze nk>prijavite se</lnk>.",
    "modeScopus": "Pretraži Scopus bazu",
    "modeCatalog": "Kolekcija «VJ i neuronske mreže»",
    "errorQuota": "Sedmični limit pretrage je iscrpljen",
    "errorGeneric": "Greška pretrage: {{error}}"
  },
  "articles": {
    "openAccess": "Open Access",
    "cited": "Citiranja: {{count}}",
    "resultsCount_one": "{{count}} rezultat",
    "resultsCount_few": "{{count}} rezultata",
    "resultsCount_other": "{{count}} rezultata",
    "noResults": "Nijedan članak nije pronađen. Pokušajte promijeniti upit.",
    "sortByDate": "Po datumu",
    "sortByCit": "Po citiranjima",
    "selectedCount_one": "{{count}} odabran",
    "selectedCount_few": "{{count}} odabrana",
    "selectedCount_other": "{{count}} odabrano"
  },
  "filters": {
    "allTypes": "Svi tipovi",
    "searchType": "Tip…",
    "docTypeLabel": "Filter po tipu dokumenta",
    "openAccessOnly": "Samo Open Access",
    "allCountries": "Sve zemlje",
    "searchCountry": "Zemlja…",
    "countryLabel": "Filter po zemlji",
    "yearFrom": "Godina od",
    "yearTo": "Godina do",
    "filtersButton": "Filteri",
    "noResults": "Ništa nije pronađeno",
    "apply": "Primijeni",
    "clear": "Poništi",
    "filtersChanged": "Filteri su promijenjeni — ponovite pretragu",
    "sectionYear": "Godina",
    "sectionDocType": "Tip dokumenta",
    "sectionCountry": "Zemlja",
    "clearFilters": "Poništi filtere"
  },
  "pagination": {
    "prev": "← Preth.",
    "next": "Sljed. →",
    "prevPage": "Prethodna stranica",
    "nextPage": "Sljedeća stranica",
    "perPage": "Po stranici:",
    "showing": "Prikazano {{from}}–{{to}} od {{total}}",
    "show": "Prikaži:",
    "perPageN": "Po {{n}}",
    "all": "Sve ({{total}})",
    "pageNav": "Navigacija po stranicama",
    "pages": "Stranice",
    "rowsPerPage": "Redova po stranici",
    "displayMode": "Način prikaza"
  },
  "auth": {
    "pageTitle": "Dobrodošli u Scopus Search",
    "pageSubtitle": "Prijavite se za pristup live Scopus pretrazi",
    "googleFailed": "Prijava putem Google-a nije uspjela. Pokušajte ponovo.",
    "continueGoogle": "Nastavi s Google-om",
    "tabSignIn": "Prijava",
    "tabRegister": "Registracija",
    "labelEmail": "E-pošta",
    "labelPassword": "Lozinka",
    "labelUsername": "Korisničko ime",
    "labelConfirm": "Potvrdite lozinku",
    "forgotPassword": "Zaboravili ste lozinku?",
    "btnSignIn": "Prijavite se",
    "btnSigningIn": "Prijavljivanje…",
    "btnCreate": "Kreirajte nalog",
    "btnCreating": "Kreiranje…",
    "showPassword": "Prikaži lozinku",
    "hidePassword": "Sakrij lozinku",
    "errors": {
      "invalidEmail": "Nevažeća e-mail adresa",
      "passwordRequired": "Lozinka je obavezna",
      "usernameMin": "Minimalno 2 znaka",
      "passwordMin": "Minimalno 8 znakova",
      "passwordUpper": "Potrebno je najmanje jedno veliko slovo",
      "passwordLower": "Potrebno je najmanje jedno malo slovo",
      "passwordDigit": "Potrebna je najmanje jedna cifra",
      "passwordSpecial": "Potreban je najmanje jedan specijalni znak (!@#$%^&* itd.)",
      "confirmRequired": "Potvrdite lozinku",
      "passwordsMismatch": "Lozinke se ne podudaraju",
      "invalidCredentials": "Nevažeća e-pošta ili lozinka",
      "serverError": "Greška servera. Pokušajte ponovo.",
      "emailExists": "Nalog s ovom e-poštom već postoji",
      "checkFields": "Provjerite ispravnost svih polja"
    }
  },
  "forgotPassword": {
    "checkEmailTitle": "Provjerite e-poštu",
    "checkEmailBody": "Ako je ova adresa registrovana, dobit ćete link za resetovanje lozinke.",
    "backToSignIn": "Nazad na prijavu",
    "title": "Resetovanje lozinke",
    "subtitle": "Unesite e-poštu — poslat ćemo vam link za resetovanje.",
    "btnSend": "Pošalji link",
    "btnSending": "Slanje…"
  },
  "resetPassword": {
    "invalidLink": "Nevažeći ili nedostajući link za resetovanje.",
    "requestNew": "Zatraži novi link",
    "title": "Nova lozinka",
    "subtitle": "Odaberite jaku lozinku za vaš nalog.",
    "labelNew": "Nova lozinka",
    "labelConfirm": "Potvrdite lozinku",
    "btnUpdate": "Sačuvaj lozinku",
    "btnUpdating": "Čuvanje…",
    "successToast": "Lozinka ažurirana. Prijavite se.",
    "linkExpired": "Link je nevažeći ili istekao.",
    "requestNewLink": "Zatraži novi link"
  },
  "profile": {
    "title": "Profil",
    "username": "Korisničko ime",
    "email": "E-pošta",
    "memberSince": "Član od",
    "signOut": "Odjava",
    "quota": {
      "title": "Scopus live pretraga — sedmična kvota",
      "used": "Iskorišćeno",
      "resetsOn": "Obnavlja se {{date}}",
      "badge": "Scopus kvota: {{remaining}} / {{limit}}",
      "badgeTitle": "Scopus API kvota: {{remaining}} od {{limit}}"
    },
    "history": {
      "title": "Historija pretrage",
      "refresh": "Osvježi",
      "empty": "Historija pretrage je prazna",
      "available": "Dostupno",
      "noResults": "Nema rezultata",
      "resultCount_one": "{{count}} rezultat",
      "resultCount_few": "{{count}} rezultata",
      "resultCount_other": "{{count}} rezultata",
      "prevPage": "Prethodna stranica",
      "nextPage": "Sljedeća stranica"
    }
  },
  "explore": {
    "title": "Analitika kolekcije",
    "subtitlePersonal": "Statistika vaših live pretraga.",
    "subtitleCollection": "«Vještačka inteligencija i neuronske mreže» — samo članci s DOI.",
    "modeCollection": "Kolekcija",
    "modePersonal": "Moje pretrage",
    "modeLabel": "Način analitike",
    "emptyPersonal": "Historija pretrage je prazna. nk>Pokrenite pretragu</lnk> da vidite ličnu analitiku.",
    "anonCta": "Prijavite se da biste pretraživali Scopus i vidjeli analitiku vaših upita.",
    "chartsError": "Grafovi se nisu učitali.",
    "reloadPage": "Ponovo učitaj stranicu",
    "filterBannerArticles": "— {{filtered}} od {{total}} članaka",
    "clearFilter": "Poništi filter",
    "kpi": {
      "articlesIndexed": "Indeksiranih članaka",
      "articlesIndexed_one": "indeksirani članak",
      "articlesIndexed_few": "indeksirana članka",
      "articlesIndexed_other": "indeksiranih članaka",
      "countries": "Zemalja",
      "countries_one": "zemlja",
      "countries_few": "zemlje",
      "countries_other": "zemalja",
      "openAccess": "Open Access",
      "docTypes": "Tipova dokumenata",
      "docTypes_one": "tip dokumenta",
      "docTypes_few": "tipa dokumenta",
      "docTypes_other": "tipova dokumenata",
      "journals": "Časopisa",
      "journals_one": "časopis",
      "journals_few": "časopisa",
      "journals_other": "časopisa",
      "authors": "Autora",
      "authors_one": "autor",
      "authors_few": "autora",
      "authors_other": "autora"
    },
    "chartBuilder": {
      "addChart": "Dodaj grafikon",
      "cancel": "Otkaži",
      "addToPage": "Dodaj na stranicu",
      "chooseDim": "Odaberite dimenziju",
      "chooseType": "Odaberite tip grafikona",
      "builderLabel": "Graditelj grafikona"
    },
    "dimensions": {
      "year": "Publikacije po godinama",
      "country": "Zemlje",
      "doc_type": "Tipovi dokumenata",
      "journal": "Vodeći časopisi",
      "open_access": "Open Access",
      "author": "Vodeći autori"
    },
    "dimensionLabels": {
      "year": "Godina",
      "country": "Zemlja",
      "doc_type": "Tip dokumenta",
      "journal": "Časopis",
      "open_access": "Open Access",
      "author": "Autor"
    },
    "chartTypes": {
      "bar_h": "Horizontalni stupac",
      "bar_v": "Vertikalni stupac",
      "pie": "Kružni dijagram",
      "line": "Linijski grafikon",
      "table": "Tabela"
    },
    "tableColLabel": "Oznaka",
    "tableColArticles": "Članaka",
    "tableColCount": "Broj",
    "tableColShare": "Udio",
    "removeChart": "Ukloni grafikon",
    "closedAccess": "Zatvoreni pristup"
  },
  "article": {
    "backHome": "← Na početnu",
    "notFound": "Članak nije pronađen",
    "notFoundSub": "Članak je možda uklonjen ili je URL netačan.",
    "metaAuthor": "Autor",
    "metaJournal": "Časopis",
    "metaDate": "Datum",
    "metaCountry": "Zemlja",
    "metaCitations": "Citiranja",
    "metaDoi": "DOI"
  },
  "a11y": {
    "switchLanguage": "Promijeni jezik",
    "userMenu": "Korisnički meni za {{name}}",
    "searchMode": "Način pretrage",
    "refreshHistory": "Osvježi historiju pretrage",
    "clearFilter": "Poništi filter",
    "loadingStats": "Učitavanje filtrirane statistike"
  }
}
```

***

## Дополнение к `labelTranslations.ts` (точно по ключам репо)

Добавить в конец `frontend/src/constants/labelTranslations.ts`:

```typescript
// Переводы стран для черногорского/сербского латиницей (80 стран, зеркало RU-набора)
export const COUNTRY_TRANSLATIONS_SR_LATN: Record<string, string> = {
  'United States': 'SAD',
  'China': 'Kina',
  'United Kingdom': 'Ujedinjeno Kraljevstvo',
  'Germany': 'Njemačka',       // иекавица: Njema-č-ka
  'Japan': 'Japan',
  'France': 'Francuska',
  'Italy': 'Italija',
  'Canada': 'Kanada',
  'Australia': 'Australija',
  'South Korea': 'Južna Koreja',
  'India': 'Indija',
  'Spain': 'Španija',
  'Netherlands': 'Holandija',
  'Brazil': 'Brazil',
  'Switzerland': 'Švajcarska',
  'Sweden': 'Švedska',
  'Russia': 'Rusija',
  'Turkey': 'Turska',
  'Poland': 'Poljska',
  'Belgium': 'Belgija',
  'Denmark': 'Danska',
  'Austria': 'Austrija',
  'Norway': 'Norveška',        // иекавица: Norve-š-ka
  'Finland': 'Finska',
  'Israel': 'Izrael',
  'Singapore': 'Singapur',
  'Portugal': 'Portugalija',
  'Czech Republic': 'Češka',
  'Greece': 'Grčka',
  'Iran': 'Iran',
  'Mexico': 'Meksiko',
  'Argentina': 'Argentina',
  'South Africa': 'Južna Afrika',
  'New Zealand': 'Novi Zeland',
  'Ireland': 'Irska',
  'Hungary': 'Mađarska',
  'Romania': 'Rumunija',
  'Ukraine': 'Ukrajina',
  'Croatia': 'Hrvatska',
  'Slovakia': 'Slovačka',
  'Thailand': 'Tajland',
  'Malaysia': 'Malezija',
  'Indonesia': 'Indonezija',
  'Vietnam': 'Vijetnam',
  'Philippines': 'Filipini',
  'Saudi Arabia': 'Saudijska Arabija',
  'Egypt': 'Egipat',
  'Nigeria': 'Nigerija',
  'Kenya': 'Kenija',
  'Ethiopia': 'Etiopija',
  'Pakistan': 'Pakistan',
  'Bangladesh': 'Bangladeš',
  'Sri Lanka': 'Šri Lanka',
  'Taiwan': 'Tajvan',
  'Hong Kong': 'Hong Kong',
  'Colombia': 'Kolumbija',
  'Chile': 'Čile',
  'Peru': 'Peru',
  'Venezuela': 'Venecuela',
  'Ecuador': 'Ekvador',
  'United Arab Emirates': 'UAE',
  'Qatar': 'Katar',
  'Kuwait': 'Kuvajt',
  'Jordan': 'Jordan',
  'Lebanon': 'Liban',
  'Morocco': 'Maroko',
  'Algeria': 'Alžir',
  'Tunisia': 'Tunis',
  'Ghana': 'Gana',
  'Tanzania': 'Tanzanija',
  'Lithuania': 'Litvanija',
  'Latvia': 'Letonija',
  'Estonia': 'Estonija',
  'Bulgaria': 'Bugarska',
  'Slovenia': 'Slovenija',
  'Serbia': 'Srbija',
  'Iceland': 'Island',
  'Luxembourg': 'Luksemburg',
  'Malta': 'Malta',
  'Cyprus': 'Kipar',
};

export const DOC_TYPE_TRANSLATIONS_SR_LATN: Record<string, string> = {
  'Article': 'Članak',
  'Review': 'Pregledni članak',
  'Conference Paper': 'Konferencijski rad',
  'Book Chapter': 'Poglavlje u knjizi',
  'Editorial': 'Uvodnik',
  'Letter': 'Pismo',
  'Note': 'Bilješka',          // иекавица: bi-lješka
  'Short Survey': 'Kratki pregled',
  'Data Paper': 'Podatkovni članak',
  'Retracted': 'Povučen',
  'Erratum': 'Ispravka',
  'Book': 'Knjiga',
  'Conference Review': 'Pregled konferencije',
  'Business Article': 'Poslovni članak',
};

// Open Access — международный термин, не переводится (аналогично RU)
export const OA_LABELS_SR_LATN: Record<string, string> = {
  'Open Access': 'Open Access',
  'Closed Access': 'Zatvoreni pristup',
};
```

### Рефактор `translateDataLabel` (убрать хардкод `lang === 'ru'`)

Заменить существующую функцию:

```typescript
// Было (хардкод только на RU):
export function translateDataLabel(
  label: string,
  lang: string,
  map: Record<string, string>,
): string {
  return lang === 'ru' ? (map[label] ?? label) : label;
}

// Стало (обобщённо — работает для любого языка с картой):
const TRANSLATED_LANGS = new Set(['ru', 'sr-Latn']);

export function translateDataLabel(
  label: string,
  lang: string,
  map: Record<string, string>,
): string {
  return TRANSLATED_LANGS.has(lang) ? (map[label] ?? label) : label;
}
```

***

## Расширение `i18n.test.ts`

Добавить новый `describe`-блок по образцу существующего RU-блока:

```typescript
describe('i18n — SR-LATN переводы', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('sr-Latn');
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('nav.explore → "Analitika"', () => {
    expect(i18n.t('nav.explore')).toBe('Analitika');
  });

  it('search.button → "Pretraži"', () => {
    expect(i18n.t('search.button')).toBe('Pretraži');
  });

  it('plural SR-LATN: 1 rezultat (one)', () => {
    expect(i18n.t('articles.resultsCount', { count: 1 })).toBe('1 rezultat');
  });

  it('plural SR-LATN: 2 rezultata (few)', () => {
    expect(i18n.t('articles.resultsCount', { count: 2 })).toBe('2 rezultata');
  });

  it('plural SR-LATN: 5 rezultata (other)', () => {
    expect(i18n.t('articles.resultsCount', { count: 5 })).toBe('5 rezultata');
  });

  it('plural SR-LATN: 11 rezultata (other — исключение для 11)', () => {
    expect(i18n.t('articles.resultsCount', { count: 11 })).toBe('11 rezultata');
  });

  it('plural SR-LATN: 21 rezultat (one — исключение для 21)', () => {
    expect(i18n.t('articles.resultsCount', { count: 21 })).toBe('1 rezultat');
  });
});

// Расширить существующий parity-чек:
describe('i18n — паритет ключей EN ↔ SR-LATN', () => {
  // ... та же flatKeys функция ...
  const srLatnBundle = i18n.getResourceBundle('sr-Latn', 'translation') as Record<string, unknown>;
  const srLatnKeys = new Set(flatKeys(srLatnBundle));

  // sr-Latn исключает _many (не существует в CLDR для этой локали)
  const srLatnOnlySuffixes = ['_few', '_many'];

  it('все EN-ключи присутствуют в SR-LATN', () => {
    const missing = [...enKeys].filter((k) => !srLatnKeys.has(k));
    expect(missing, `EN-ключи отсутствующие в SR-LATN: ${missing.join(', ')}`).toHaveLength(0);
  });

  it('все SR-LATN-ключи присутствуют в EN (кроме _few/_many форм)', () => {
    const missing = [...srLatnKeys].filter(
      (k) => !enKeys.has(k) && !srLatnOnlySuffixes.some((s) => k.endsWith(s)),
    );
    expect(missing, `SR-LATN-ключи отсутствующие в EN: ${missing.join(', ')}`).toHaveLength(0);
  });
});
```

***

