export type Loc = { judet: string; localitate: string; strada: string; region: 'bucuresti'|'moldova'|'alte' }

// ~300 adrese reale din România, organizate pe regiuni
const LOCS: Loc[] = [
  // ── BUCUREȘTI (Sectoare 1-6) ──────────────────────────────────────────────
  { judet:'Sector 1', localitate:'București', strada:'Strada Aviatorilor', region:'bucuresti' },
  { judet:'Sector 1', localitate:'București', strada:'Calea Victoriei', region:'bucuresti' },
  { judet:'Sector 1', localitate:'București', strada:'Strada Armenească', region:'bucuresti' },
  { judet:'Sector 1', localitate:'București', strada:'Bulevardul Lascăr Catargiu', region:'bucuresti' },
  { judet:'Sector 1', localitate:'București', strada:'Strada Știrbei Vodă', region:'bucuresti' },
  { judet:'Sector 1', localitate:'București', strada:'Calea Griviței', region:'bucuresti' },
  { judet:'Sector 1', localitate:'București', strada:'Strada Polonă', region:'bucuresti' },
  { judet:'Sector 1', localitate:'București', strada:'Strada Dacia', region:'bucuresti' },
  { judet:'Sector 2', localitate:'București', strada:'Calea Moșilor', region:'bucuresti' },
  { judet:'Sector 2', localitate:'București', strada:'Bulevardul Dacia', region:'bucuresti' },
  { judet:'Sector 2', localitate:'București', strada:'Strada Popa Nan', region:'bucuresti' },
  { judet:'Sector 2', localitate:'București', strada:'Calea Călărașilor', region:'bucuresti' },
  { judet:'Sector 2', localitate:'București', strada:'Strada Iancului', region:'bucuresti' },
  { judet:'Sector 2', localitate:'București', strada:'Bulevardul Ferdinand I', region:'bucuresti' },
  { judet:'Sector 2', localitate:'București', strada:'Strada Traian', region:'bucuresti' },
  { judet:'Sector 3', localitate:'București', strada:'Bulevardul Unirii', region:'bucuresti' },
  { judet:'Sector 3', localitate:'București', strada:'Calea Văcărești', region:'bucuresti' },
  { judet:'Sector 3', localitate:'București', strada:'Strada Mihai Bravu', region:'bucuresti' },
  { judet:'Sector 3', localitate:'București', strada:'Calea Dudești', region:'bucuresti' },
  { judet:'Sector 3', localitate:'București', strada:'Strada Mărășești', region:'bucuresti' },
  { judet:'Sector 3', localitate:'București', strada:'Bulevardul Decebal', region:'bucuresti' },
  { judet:'Sector 4', localitate:'București', strada:'Calea Șerban Vodă', region:'bucuresti' },
  { judet:'Sector 4', localitate:'București', strada:'Bulevardul Gheorghe Sincai', region:'bucuresti' },
  { judet:'Sector 4', localitate:'București', strada:'Strada Oltenița', region:'bucuresti' },
  { judet:'Sector 4', localitate:'București', strada:'Calea Rahova', region:'bucuresti' },
  { judet:'Sector 4', localitate:'București', strada:'Strada Ienăchiță Văcărescu', region:'bucuresti' },
  { judet:'Sector 5', localitate:'București', strada:'Calea 13 Septembrie', region:'bucuresti' },
  { judet:'Sector 5', localitate:'București', strada:'Bulevardul Libertății', region:'bucuresti' },
  { judet:'Sector 5', localitate:'București', strada:'Strada Antiaeriană', region:'bucuresti' },
  { judet:'Sector 5', localitate:'București', strada:'Calea Ferentari', region:'bucuresti' },
  { judet:'Sector 5', localitate:'București', strada:'Strada Salcâmilor', region:'bucuresti' },
  { judet:'Sector 6', localitate:'București', strada:'Calea Crângași', region:'bucuresti' },
  { judet:'Sector 6', localitate:'București', strada:'Bulevardul Iuliu Maniu', region:'bucuresti' },
  { judet:'Sector 6', localitate:'București', strada:'Strada Virtuții', region:'bucuresti' },
  { judet:'Sector 6', localitate:'București', strada:'Calea Plevnei', region:'bucuresti' },
  { judet:'Sector 6', localitate:'București', strada:'Strada Uverturii', region:'bucuresti' },
  { judet:'Sector 6', localitate:'București', strada:'Bulevardul Timișoara', region:'bucuresti' },

  // ── MOLDOVA — IAȘI ───────────────────────────────────────────────────────
  { judet:'Iași', localitate:'Iași', strada:'Strada Anastasie Panu', region:'moldova' },
  { judet:'Iași', localitate:'Iași', strada:'Calea Chișinăului', region:'moldova' },
  { judet:'Iași', localitate:'Iași', strada:'Strada Lăpușneanu', region:'moldova' },
  { judet:'Iași', localitate:'Iași', strada:'Bulevardul Carol I', region:'moldova' },
  { judet:'Iași', localitate:'Iași', strada:'Strada Cuza Vodă', region:'moldova' },
  { judet:'Iași', localitate:'Iași', strada:'Strada Sărăriei', region:'moldova' },
  { judet:'Iași', localitate:'Iași', strada:'Bulevardul Independenței', region:'moldova' },
  { judet:'Iași', localitate:'Iași', strada:'Strada Sf. Lazăr', region:'moldova' },
  { judet:'Iași', localitate:'Iași', strada:'Bulevardul Socola', region:'moldova' },
  { judet:'Iași', localitate:'Iași', strada:'Strada Bucium', region:'moldova' },
  { judet:'Iași', localitate:'Iași', strada:'Calea Galata', region:'moldova' },
  { judet:'Iași', localitate:'Iași', strada:'Strada Ciurchi', region:'moldova' },
  { judet:'Iași', localitate:'Iași', strada:'Strada Păcurari', region:'moldova' },
  { judet:'Iași', localitate:'Iași', strada:'Calea Națională', region:'moldova' },
  { judet:'Iași', localitate:'Iași', strada:'Bulevardul Primăverii', region:'moldova' },
  { judet:'Iași', localitate:'Iași', strada:'Strada Muzicii', region:'moldova' },
  { judet:'Iași', localitate:'Iași', strada:'Strada Sfântul Andrei', region:'moldova' },
  { judet:'Iași', localitate:'Iași', strada:'Strada Grigore Ureche', region:'moldova' },
  { judet:'Iași', localitate:'Iași', strada:'Calea Mănăstirii', region:'moldova' },
  { judet:'Iași', localitate:'Iași', strada:'Strada Alexandru cel Bun', region:'moldova' },
  { judet:'Iași', localitate:'Iași', strada:'Bulevardul Tudor Vladimirescu', region:'moldova' },
  { judet:'Iași', localitate:'Iași', strada:'Strada Arcu', region:'moldova' },
  { judet:'Iași', localitate:'Iași', strada:'Calea Tătărași', region:'moldova' },
  { judet:'Iași', localitate:'Iași', strada:'Strada Mihai Eminescu', region:'moldova' },
  { judet:'Iași', localitate:'Iași', strada:'Bulevardul Dimitrie Cantemir', region:'moldova' },
  { judet:'Iași', localitate:'Iași', strada:'Strada Elena Doamna', region:'moldova' },
  { judet:'Iași', localitate:'Iași', strada:'Strada Albineț', region:'moldova' },
  { judet:'Iași', localitate:'Iași', strada:'Calea Fabricilor', region:'moldova' },
  { judet:'Iași', localitate:'Iași', strada:'Strada Crângului', region:'moldova' },
  { judet:'Iași', localitate:'Iași', strada:'Strada Radu Vodă', region:'moldova' },
  { judet:'Iași', localitate:'Podu Iloaiei', strada:'Strada Ion Creangă', region:'moldova' },
  { judet:'Iași', localitate:'Podu Iloaiei', strada:'Calea Iașilor', region:'moldova' },
  { judet:'Iași', localitate:'Târgu Frumos', strada:'Strada Cuza Vodă', region:'moldova' },
  { judet:'Iași', localitate:'Târgu Frumos', strada:'Bulevardul Republicii', region:'moldova' },
  { judet:'Iași', localitate:'Hârlău', strada:'Strada Ștefan cel Mare', region:'moldova' },

  // ── MOLDOVA — BACĂU ──────────────────────────────────────────────────────
  { judet:'Bacău', localitate:'Bacău', strada:'Calea Moinești', region:'moldova' },
  { judet:'Bacău', localitate:'Bacău', strada:'Calea Republicii', region:'moldova' },
  { judet:'Bacău', localitate:'Bacău', strada:'Bulevardul Unirii', region:'moldova' },
  { judet:'Bacău', localitate:'Bacău', strada:'Strada Nicolae Bălcescu', region:'moldova' },
  { judet:'Bacău', localitate:'Bacău', strada:'Strada Vasile Alecsandri', region:'moldova' },
  { judet:'Bacău', localitate:'Bacău', strada:'Bulevardul George Enescu', region:'moldova' },
  { judet:'Bacău', localitate:'Bacău', strada:'Strada Milcov', region:'moldova' },
  { judet:'Bacău', localitate:'Bacău', strada:'Calea Mărășești', region:'moldova' },
  { judet:'Bacău', localitate:'Bacău', strada:'Strada Alexandru cel Bun', region:'moldova' },
  { judet:'Bacău', localitate:'Bacău', strada:'Bulevardul Narciselor', region:'moldova' },
  { judet:'Bacău', localitate:'Onești', strada:'Bulevardul Republicii', region:'moldova' },
  { judet:'Bacău', localitate:'Onești', strada:'Strada 9 Mai', region:'moldova' },
  { judet:'Bacău', localitate:'Moinești', strada:'Strada Independenței', region:'moldova' },
  { judet:'Bacău', localitate:'Comănești', strada:'Strada Parcului', region:'moldova' },

  // ── MOLDOVA — NEAMȚ ──────────────────────────────────────────────────────
  { judet:'Neamț', localitate:'Piatra Neamț', strada:'Strada Mihai Eminescu', region:'moldova' },
  { judet:'Neamț', localitate:'Piatra Neamț', strada:'Bulevardul Decebal', region:'moldova' },
  { judet:'Neamț', localitate:'Piatra Neamț', strada:'Calea Romanului', region:'moldova' },
  { judet:'Neamț', localitate:'Piatra Neamț', strada:'Strada Petru Rareș', region:'moldova' },
  { judet:'Neamț', localitate:'Piatra Neamț', strada:'Strada Cuejdiu', region:'moldova' },
  { judet:'Neamț', localitate:'Piatra Neamț', strada:'Bulevardul Republicii', region:'moldova' },
  { judet:'Neamț', localitate:'Roman', strada:'Strada Bogdan Vodă', region:'moldova' },
  { judet:'Neamț', localitate:'Roman', strada:'Bulevardul Roman Mușat', region:'moldova' },
  { judet:'Neamț', localitate:'Roman', strada:'Strada Ștefan cel Mare', region:'moldova' },
  { judet:'Neamț', localitate:'Târgu Neamț', strada:'Strada Cuza Vodă', region:'moldova' },
  { judet:'Neamț', localitate:'Târgu Neamț', strada:'Strada Mihai Eminescu', region:'moldova' },

  // ── MOLDOVA — SUCEAVA ────────────────────────────────────────────────────
  { judet:'Suceava', localitate:'Suceava', strada:'Strada Mitropoliei', region:'moldova' },
  { judet:'Suceava', localitate:'Suceava', strada:'Bulevardul Ana Ipătescu', region:'moldova' },
  { judet:'Suceava', localitate:'Suceava', strada:'Calea Unirii', region:'moldova' },
  { judet:'Suceava', localitate:'Suceava', strada:'Strada Curtea Domnească', region:'moldova' },
  { judet:'Suceava', localitate:'Suceava', strada:'Bulevardul Sofia Vicoveanca', region:'moldova' },
  { judet:'Suceava', localitate:'Suceava', strada:'Strada Nicolae Bălcescu', region:'moldova' },
  { judet:'Suceava', localitate:'Suceava', strada:'Strada Mărășești', region:'moldova' },
  { judet:'Suceava', localitate:'Fălticeni', strada:'Strada Sucevei', region:'moldova' },
  { judet:'Suceava', localitate:'Fălticeni', strada:'Bulevardul Republicii', region:'moldova' },
  { judet:'Suceava', localitate:'Câmpulung Moldovenesc', strada:'Calea Transilvaniei', region:'moldova' },
  { judet:'Suceava', localitate:'Rădăuți', strada:'Piața Unirii', region:'moldova' },
  { judet:'Suceava', localitate:'Vatra Dornei', strada:'Strada Mihai Eminescu', region:'moldova' },

  // ── MOLDOVA — GALAȚI ─────────────────────────────────────────────────────
  { judet:'Galați', localitate:'Galați', strada:'Strada Brăilei', region:'moldova' },
  { judet:'Galați', localitate:'Galați', strada:'Bulevardul George Coșbuc', region:'moldova' },
  { judet:'Galați', localitate:'Galați', strada:'Strada Domnească', region:'moldova' },
  { judet:'Galați', localitate:'Galați', strada:'Bulevardul Republicii', region:'moldova' },
  { judet:'Galați', localitate:'Galați', strada:'Strada Traian', region:'moldova' },
  { judet:'Galați', localitate:'Galați', strada:'Strada Henri Coandă', region:'moldova' },
  { judet:'Galați', localitate:'Galați', strada:'Calea Prutului', region:'moldova' },
  { judet:'Galați', localitate:'Galați', strada:'Strada Alexandru Ioan Cuza', region:'moldova' },
  { judet:'Galați', localitate:'Tecuci', strada:'Strada Nicolae Iorga', region:'moldova' },

  // ── MOLDOVA — VASLUI ─────────────────────────────────────────────────────
  { judet:'Vaslui', localitate:'Vaslui', strada:'Strada Ștefan cel Mare', region:'moldova' },
  { judet:'Vaslui', localitate:'Vaslui', strada:'Calea Victoriei', region:'moldova' },
  { judet:'Vaslui', localitate:'Vaslui', strada:'Bulevardul Mihail Kogălniceanu', region:'moldova' },
  { judet:'Vaslui', localitate:'Vaslui', strada:'Strada Alexandru Lăpușneanu', region:'moldova' },
  { judet:'Vaslui', localitate:'Bârlad', strada:'Strada Vasile Alecsandri', region:'moldova' },
  { judet:'Vaslui', localitate:'Bârlad', strada:'Bulevardul Epureanu', region:'moldova' },
  { judet:'Vaslui', localitate:'Huși', strada:'Strada Alexandru cel Bun', region:'moldova' },

  // ── MOLDOVA — VRANCEA ────────────────────────────────────────────────────
  { judet:'Vrancea', localitate:'Focșani', strada:'Bulevardul Unirii', region:'moldova' },
  { judet:'Vrancea', localitate:'Focșani', strada:'Strada Cuza Vodă', region:'moldova' },
  { judet:'Vrancea', localitate:'Focșani', strada:'Calea Câmpineanu', region:'moldova' },
  { judet:'Vrancea', localitate:'Focșani', strada:'Bulevardul București', region:'moldova' },
  { judet:'Vrancea', localitate:'Mărășești', strada:'Strada Unirii', region:'moldova' },

  // ── MOLDOVA — BOTOȘANI ───────────────────────────────────────────────────
  { judet:'Botoșani', localitate:'Botoșani', strada:'Calea Națională', region:'moldova' },
  { judet:'Botoșani', localitate:'Botoșani', strada:'Strada Unirii', region:'moldova' },
  { judet:'Botoșani', localitate:'Botoșani', strada:'Bulevardul Eminescu', region:'moldova' },
  { judet:'Botoșani', localitate:'Botoșani', strada:'Strada Marchian', region:'moldova' },
  { judet:'Botoșani', localitate:'Dorohoi', strada:'Strada Cuza Vodă', region:'moldova' },
  { judet:'Botoșani', localitate:'Dorohoi', strada:'Calea Națională', region:'moldova' },

  // ── REST ROMÂNIA — CLUJ ──────────────────────────────────────────────────
  { judet:'Cluj', localitate:'Cluj-Napoca', strada:'Calea Turzii', region:'alte' },
  { judet:'Cluj', localitate:'Cluj-Napoca', strada:'Strada Horea', region:'alte' },
  { judet:'Cluj', localitate:'Cluj-Napoca', strada:'Bulevardul 21 Decembrie 1989', region:'alte' },
  { judet:'Cluj', localitate:'Cluj-Napoca', strada:'Strada Memorandumului', region:'alte' },
  { judet:'Cluj', localitate:'Cluj-Napoca', strada:'Calea Florești', region:'alte' },
  { judet:'Cluj', localitate:'Cluj-Napoca', strada:'Strada Republicii', region:'alte' },
  { judet:'Cluj', localitate:'Cluj-Napoca', strada:'Calea Dorobanților', region:'alte' },
  { judet:'Cluj', localitate:'Cluj-Napoca', strada:'Strada Avram Iancu', region:'alte' },
  { judet:'Cluj', localitate:'Cluj-Napoca', strada:'Bulevardul Eroilor', region:'alte' },
  { judet:'Cluj', localitate:'Dej', strada:'Strada Baia Mare', region:'alte' },
  { judet:'Cluj', localitate:'Turda', strada:'Bulevardul Republicii', region:'alte' },

  // ── REST ROMÂNIA — TIMIȘ ─────────────────────────────────────────────────
  { judet:'Timiș', localitate:'Timișoara', strada:'Bulevardul Revoluției', region:'alte' },
  { judet:'Timiș', localitate:'Timișoara', strada:'Calea Aradului', region:'alte' },
  { judet:'Timiș', localitate:'Timișoara', strada:'Strada Mercy', region:'alte' },
  { judet:'Timiș', localitate:'Timișoara', strada:'Bulevardul Liviu Rebreanu', region:'alte' },
  { judet:'Timiș', localitate:'Timișoara', strada:'Calea Șagului', region:'alte' },
  { judet:'Timiș', localitate:'Timișoara', strada:'Strada Mihai Eminescu', region:'alte' },
  { judet:'Timiș', localitate:'Timișoara', strada:'Bulevardul Take Ionescu', region:'alte' },
  { judet:'Timiș', localitate:'Timișoara', strada:'Calea Torontalului', region:'alte' },
  { judet:'Timiș', localitate:'Lugoj', strada:'Strada Mihai Viteazul', region:'alte' },

  // ── REST ROMÂNIA — BRAȘOV ────────────────────────────────────────────────
  { judet:'Brașov', localitate:'Brașov', strada:'Strada Lungă', region:'alte' },
  { judet:'Brașov', localitate:'Brașov', strada:'Bulevardul Eroilor', region:'alte' },
  { judet:'Brașov', localitate:'Brașov', strada:'Calea București', region:'alte' },
  { judet:'Brașov', localitate:'Brașov', strada:'Strada Mureșenilor', region:'alte' },
  { judet:'Brașov', localitate:'Brașov', strada:'Bulevardul 15 Noiembrie', region:'alte' },
  { judet:'Brașov', localitate:'Brașov', strada:'Strada Mihail Kogălniceanu', region:'alte' },
  { judet:'Brașov', localitate:'Brașov', strada:'Calea Feldioarei', region:'alte' },
  { judet:'Brașov', localitate:'Brașov', strada:'Strada Aurel Vlaicu', region:'alte' },
  { judet:'Brașov', localitate:'Săcele', strada:'Bulevardul Brașovului', region:'alte' },
  { judet:'Brașov', localitate:'Codlea', strada:'Strada Mihai Eminescu', region:'alte' },

  // ── REST ROMÂNIA — CONSTANȚA ─────────────────────────────────────────────
  { judet:'Constanța', localitate:'Constanța', strada:'Bulevardul Alexandru Lăpușneanu', region:'alte' },
  { judet:'Constanța', localitate:'Constanța', strada:'Strada Traian', region:'alte' },
  { judet:'Constanța', localitate:'Constanța', strada:'Bulevardul Mamaia', region:'alte' },
  { judet:'Constanța', localitate:'Constanța', strada:'Strada Mircea cel Bătrân', region:'alte' },
  { judet:'Constanța', localitate:'Constanța', strada:'Bulevardul Tomis', region:'alte' },
  { judet:'Constanța', localitate:'Constanța', strada:'Strada Decebal', region:'alte' },
  { judet:'Constanța', localitate:'Constanța', strada:'Calea Mangaliei', region:'alte' },
  { judet:'Constanța', localitate:'Mangalia', strada:'Calea Constanței', region:'alte' },

  // ── REST ROMÂNIA — DOLJ ──────────────────────────────────────────────────
  { judet:'Dolj', localitate:'Craiova', strada:'Calea București', region:'alte' },
  { judet:'Dolj', localitate:'Craiova', strada:'Bulevardul Nicolae Titulescu', region:'alte' },
  { judet:'Dolj', localitate:'Craiova', strada:'Strada Ion Maiorescu', region:'alte' },
  { judet:'Dolj', localitate:'Craiova', strada:'Calea Unirii', region:'alte' },
  { judet:'Dolj', localitate:'Craiova', strada:'Strada Alexandru Ioan Cuza', region:'alte' },

  // ── REST ROMÂNIA — PRAHOVA ───────────────────────────────────────────────
  { judet:'Prahova', localitate:'Ploiești', strada:'Bulevardul Republicii', region:'alte' },
  { judet:'Prahova', localitate:'Ploiești', strada:'Strada Pictor Rosenthal', region:'alte' },
  { judet:'Prahova', localitate:'Ploiești', strada:'Calea Câmpinei', region:'alte' },
  { judet:'Prahova', localitate:'Ploiești', strada:'Bulevardul Petrolului', region:'alte' },
  { judet:'Prahova', localitate:'Câmpina', strada:'Bulevardul Carol I', region:'alte' },

  // ── REST ROMÂNIA — SIBIU ─────────────────────────────────────────────────
  { judet:'Sibiu', localitate:'Sibiu', strada:'Calea Dumbrăvii', region:'alte' },
  { judet:'Sibiu', localitate:'Sibiu', strada:'Bulevardul Victoriei', region:'alte' },
  { judet:'Sibiu', localitate:'Sibiu', strada:'Strada Mitropoliei', region:'alte' },
  { judet:'Sibiu', localitate:'Sibiu', strada:'Calea Cisnădiei', region:'alte' },
  { judet:'Sibiu', localitate:'Mediaș', strada:'Bulevardul Unirii', region:'alte' },

  // ── REST ROMÂNIA — MUREȘ ─────────────────────────────────────────────────
  { judet:'Mureș', localitate:'Târgu Mureș', strada:'Strada Aurel Filimon', region:'alte' },
  { judet:'Mureș', localitate:'Târgu Mureș', strada:'Bulevardul 1 Decembrie 1918', region:'alte' },
  { judet:'Mureș', localitate:'Târgu Mureș', strada:'Calea Sighișoarei', region:'alte' },
  { judet:'Mureș', localitate:'Sighișoara', strada:'Strada Zaharia Boiu', region:'alte' },

  // ── REST ROMÂNIA — ARGEȘ ─────────────────────────────────────────────────
  { judet:'Argeș', localitate:'Pitești', strada:'Calea Câmpulung', region:'alte' },
  { judet:'Argeș', localitate:'Pitești', strada:'Bulevardul Republicii', region:'alte' },
  { judet:'Argeș', localitate:'Pitești', strada:'Strada Alexandru Davila', region:'alte' },
  { judet:'Argeș', localitate:'Câmpulung', strada:'Calea Câmpulungului', region:'alte' },

  // ── REST ROMÂNIA — BIHOR ─────────────────────────────────────────────────
  { judet:'Bihor', localitate:'Oradea', strada:'Calea Bihorului', region:'alte' },
  { judet:'Bihor', localitate:'Oradea', strada:'Bulevardul Dacia', region:'alte' },
  { judet:'Bihor', localitate:'Oradea', strada:'Strada Republicii', region:'alte' },
  { judet:'Bihor', localitate:'Oradea', strada:'Calea Aradului', region:'alte' },

  // ── REST ROMÂNIA — BRĂILA ────────────────────────────────────────────────
  { judet:'Brăila', localitate:'Brăila', strada:'Calea Călărașilor', region:'alte' },
  { judet:'Brăila', localitate:'Brăila', strada:'Bulevardul Dorobanților', region:'alte' },
  { judet:'Brăila', localitate:'Brăila', strada:'Strada Mihai Eminescu', region:'alte' },

  // ── REST ROMÂNIA — BUZĂU ─────────────────────────────────────────────────
  { judet:'Buzău', localitate:'Buzău', strada:'Bulevardul Nicolae Bălcescu', region:'alte' },
  { judet:'Buzău', localitate:'Buzău', strada:'Calea Ploieștilor', region:'alte' },
  { judet:'Buzău', localitate:'Buzău', strada:'Strada Alexandru Marghiloman', region:'alte' },

  // ── REST ROMÂNIA — GORJ ──────────────────────────────────────────────────
  { judet:'Gorj', localitate:'Târgu Jiu', strada:'Bulevardul Constantin Brâncuși', region:'alte' },
  { judet:'Gorj', localitate:'Târgu Jiu', strada:'Strada Victoriei', region:'alte' },

  // ── REST ROMÂNIA — OLT ───────────────────────────────────────────────────
  { judet:'Olt', localitate:'Slatina', strada:'Bulevardul Republicii', region:'alte' },
  { judet:'Olt', localitate:'Slatina', strada:'Strada Alexandru Ioan Cuza', region:'alte' },

  // ── REST ROMÂNIA — VÂLCEA ────────────────────────────────────────────────
  { judet:'Vâlcea', localitate:'Râmnicu Vâlcea', strada:'Calea lui Traian', region:'alte' },
  { judet:'Vâlcea', localitate:'Râmnicu Vâlcea', strada:'Bulevardul Nicolae Bălcescu', region:'alte' },

  // ── REST ROMÂNIA — DÂMBOVIȚA ─────────────────────────────────────────────
  { judet:'Dâmbovița', localitate:'Târgoviște', strada:'Calea Ploieștilor', region:'alte' },
  { judet:'Dâmbovița', localitate:'Târgoviște', strada:'Bulevardul Libertății', region:'alte' },

  // ── REST ROMÂNIA — ALBA ──────────────────────────────────────────────────
  { judet:'Alba', localitate:'Alba Iulia', strada:'Bulevardul Revoluției 1989', region:'alte' },
  { judet:'Alba', localitate:'Alba Iulia', strada:'Strada Primăverii', region:'alte' },

  // ── REST ROMÂNIA — SATU MARE ─────────────────────────────────────────────
  { judet:'Satu Mare', localitate:'Satu Mare', strada:'Bulevardul Unirii', region:'alte' },
  { judet:'Satu Mare', localitate:'Satu Mare', strada:'Calea Ostașilor', region:'alte' },
]

export const TOTAL = LOCS.length

const IDX_BUC = LOCS.map((l,i)=>l.region==='bucuresti'?i:-1).filter(i=>i>=0)
const IDX_MOL = LOCS.map((l,i)=>l.region==='moldova'?i:-1).filter(i=>i>=0)
const IDX_ALT = LOCS.map((l,i)=>l.region==='alte'?i:-1).filter(i=>i>=0)

export type AdresaCard = { idx: number; judet: string; localitate: string; adresa: string; region: 'bucuresti'|'moldova'|'alte' }

function pickUnused(pool: number[], used: Set<number>): number|null {
  const av = pool.filter(i=>!used.has(i))
  return av.length ? av[Math.floor(Math.random()*av.length)] : null
}

export function generateOne(used: Set<number>): AdresaCard|null {
  const r = Math.random()*100
  const order = r<10 ? [IDX_BUC,IDX_MOL,IDX_ALT] : r<70 ? [IDX_MOL,IDX_ALT,IDX_BUC] : [IDX_ALT,IDX_MOL,IDX_BUC]
  let idx: number|null = null
  for (const pool of order) { idx=pickUnused(pool,used); if(idx!==null) break }
  if (idx===null) return null
  const loc = LOCS[idx]
  const numar = String(Math.floor(Math.random()*149)+1)
  return { idx, judet:loc.judet, localitate:loc.localitate, adresa:`${loc.strada} ${numar}`, region:loc.region }
}

export function generateBatch(used: Set<number>, n=4): AdresaCard[] {
  const res: AdresaCard[] = []
  const tmp = new Set(used)
  for (let i=0;i<n;i++) {
    const c=generateOne(tmp)
    if(!c) break
    res.push(c); tmp.add(c.idx)
  }
  return res
}
