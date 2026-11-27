// Texte fuer Hilfe, Tour und Einrichtung (F20). Alles deutsch, kurze Saetze.
export const TOUR = [
  { route: '#/plan', sel: '[data-tour="start"]', titel: 'Startdatum', text: 'Hier wählst du den ersten Tag. Der Plan umfasst immer genau 7 Tage ab diesem Tag, zum Beispiel Mittwoch bis Dienstag.' },
  { route: '#/plan', sel: '[data-tour="shuffle"]', titel: 'Würfeln', text: 'Ein Tipp, und die App schlägt für alle 7 Tage ein Gericht vor. „Diät würfeln“ nutzt nur Diät-Gerichte, „Alle würfeln“ wirklich alle, „Lecker würfeln“ alle außer den Diät-Gerichten. Bewährte Gerichte und Favoriten kommen öfter dran. Du kannst jederzeit neu würfeln.' },
  { route: '#/plan', sel: '[data-tour="tag"]', titel: 'Tag antippen', text: 'Tippe auf den Namen eines Tages. Dann suchst du ein anderes Gericht aus oder würfelst nur diesen Tag neu. Mit „Fixieren“ bleibt ein Tag beim nächsten „Alle neu würfeln“ unverändert.' },
  { route: '#/plan', sel: '[data-tour="portionen"]', titel: 'Portionen', text: 'Mit Plus und Minus stellst du die Portionen pro Tag ein. Die Zutaten rechnen automatisch mit, die Kalorien pro Portion bleiben gleich.' },
  { route: '#/plan', sel: '[data-tour="bewerten"]', fallback: '[data-tour="tag"]', titel: 'Bewerten', text: 'Für heutige und vergangene Tage vergibst du Sterne von 1 bis 5 und kannst eine Notiz schreiben. Gut bewertete Gerichte schlägt die App öfter vor. Die Rangliste findest du unten im Menü.' },
  { route: '#/einkauf', sel: '[data-tour="liste"] .shop-item', fallback: '[data-tour="liste"]', titel: 'Einkaufszettel', text: 'Hier steht alles, was du für die 7 Tage brauchst, zusammengerechnet und alphabetisch. Tippe einen Eintrag an, um ihn abzuhaken. Der Haken bleibt erhalten.' },
  { route: '#/einkauf', sel: '[data-tour="export"]', titel: 'Liste weitergeben', text: '„In Erinnerungen“ schickt die Liste an deine Einkaufsliste in Apple Erinnerungen. „Für Notes kopieren“ legt sie in die Zwischenablage, danach in Notes einfügen, markieren und Checkliste antippen.' },
];

export const HILFE_KONTEXT = {
  '#/plan': 'Auf diesem Bildschirm planst du die Woche: Startdatum wählen, „Diät würfeln“, „Alle würfeln“ oder „Lecker würfeln“ tippen, einen Tag antippen, um das Gericht zu ändern, und mit Plus und Minus die Portionen einstellen. Jede Änderung wird automatisch gespeichert.',
  '#/einkauf': 'Hier siehst du den Einkaufszettel für die 7 Tage. Tippe Einträge an, um sie abzuhaken. Unten gibst du die Liste an Erinnerungen oder Notes weiter.',
  '#/gerichte': 'Hier stehen alle Gerichte aus dem Sheet. Du kannst suchen, filtern, ein Gericht als Favorit oder „Nie wieder“ markieren, archivieren oder mit „Neu“ ein neues anlegen. Neue Gerichte kann auch Claude im Chat eintragen.',
  '#/rangliste': 'Die Rangliste zeigt die besten und schwächsten Gerichte nach deinen Sternen. Sie erscheint, sobald ein Gericht mindestens 2 Bewertungen hat.',
  '#/gericht': 'Hier legst du ein Gericht an oder bearbeitest es. Name und mindestens eine Zutat genügen. Die Zutaten kannst du Zeile für Zeile eintippen oder diktieren und mit „Zutaten erkennen“ in Mengen, Einheiten und Namen zerlegen lassen. Ohne Zutaten wird das Gericht als Idee gespeichert.',
  '#/einstellungen': 'Hier fügst du den Setup-Code ein, stellst Standard-Portionen und Wiederholungssperre ein und kannst den Code für ein weiteres Gerät anzeigen.',
};

export const EINRICHTUNG = [
  { titel: 'App auf den Home-Bildschirm legen', schritte: ['Die Adresse der App in Safari öffnen.', 'Auf das Teilen-Symbol tippen (Quadrat mit Pfeil nach oben).', '„Zum Home-Bildschirm“ wählen und bestätigen.', 'Die App künftig über das neue Symbol starten, dann läuft sie ohne Safari-Leiste.'] },
  { titel: 'Setup-Code einfügen', schritte: ['Bei der Einrichtung des Sheets entsteht ein Setup-Code. Er beginnt mit KP1.', 'In der App unten auf „Einstellungen“ tippen.', 'Den Code in das Feld einfügen und „Verbinden“ tippen.', 'Danach lädt die App die Gerichte. Auf jedem weiteren Gerät genauso vorgehen. Einen Code für ein anderes Gerät zeigt die App unter „Einstellungen“.'] },
  { titel: 'Kurzbefehl „Einkauf“ anlegen (für Erinnerungen)', schritte: ['Die App „Kurzbefehle“ öffnen und oben rechts auf Plus tippen.', 'Aktion „Zwischenablage abrufen“ hinzufügen.', 'Aktion „Text aufteilen“ hinzufügen und als Trennzeichen „Neue Zeilen“ wählen.', 'Aktion „Für jedes Element wiederholen“ hinzufügen, darin „Neue Erinnerung hinzufügen“ mit dem Wiederholungselement und deiner Liste (zum Beispiel „Einkauf“).', 'Den Kurzbefehl genau „Einkauf“ nennen und sichern.', 'In der App beim Einkaufszettel „In Erinnerungen“ tippen. Klappt es nicht, hilft „Teilen …“.'] },
  { titel: 'Offline und Speicher', schritte: ['Nach dem ersten Laden öffnet die App auch ohne Netz und zeigt den zuletzt geladenen Plan und Einkaufszettel. Abhaken geht offline, Speichern braucht Netz.', 'Räumt iOS den Speicher der App auf, einfach den Setup-Code nochmal einfügen. Alle Daten bleiben im Sheet.'] },
];
