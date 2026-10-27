/* Fourfold — UI translation tables (see js/i18n/i18n.js).
 * Each row: [English key, es-419, de-DE, fr-FR, pt-BR, it-IT]; content (players,
 * lessons, journey, practice, challenges) is in strings-content.js. en-GB,
 * es-ES and fr-CA list only where they differ from en-US, es-419 and fr-FR.
 * "Fourfold", "StarHermit" and key names (U, H, Esc…) stay as they are.
 */
(function (root) {
  'use strict';
  var ROWS = [
    // ---- header / title
    ['Help and rules', 'Ayuda y reglas', 'Hilfe und Regeln', 'Aide et règles', 'Ajuda e regras', 'Aiuto e regole'],
    ['Settings', 'Ajustes', 'Einstellungen', 'Paramètres', 'Configurações', 'Impostazioni'],
    ['Make four in a row', 'Haz cuatro en línea', 'Vier in einer Reihe', 'Alignez-en quatre', 'Faça quatro em linha', 'Fai quattro in fila'],
    ['Drop a disc into a column; it falls to the lowest free cell. The first player to line up four — across, up, or diagonally — wins the board.', 'Suelta una ficha en una columna; cae a la casilla libre más baja. El primer jugador que alinea cuatro, en horizontal, vertical o diagonal, gana el tablero.', 'Lass eine Scheibe in eine Spalte fallen; sie landet im tiefsten freien Feld. Wer zuerst vier in eine Reihe bringt – waagrecht, senkrecht oder diagonal –, gewinnt.', 'Lâchez un jeton dans une colonne ; il tombe dans la case libre la plus basse. Le premier à en aligner quatre — à l’horizontale, à la verticale ou en diagonale — gagne.', 'Solte uma ficha numa coluna; ela cai na casa livre mais baixa. O primeiro a alinhar quatro — na horizontal, vertical ou diagonal — vence.', 'Lascia cadere un disco in una colonna: cade nella casella libera più bassa. Il primo che ne allinea quattro, in orizzontale, verticale o diagonale, vince.'],
    ['Resume', 'Reanudar', 'Fortsetzen', 'Reprendre', 'Retomar', 'Riprendi'],
    ['Play', 'Jugar', 'Spielen', 'Jouer', 'Jogar', 'Gioca'],
    ['Journey', 'Travesía', 'Reise', 'Périple', 'Jornada', 'Viaggio'],
    ['42 authored stages, stars and mastery gates', '42 etapas diseñadas, estrellas y pruebas de maestría', '42 gestaltete Etappen, Sterne und Meisterprüfungen', '42 étapes conçues, étoiles et épreuves de maîtrise', '42 etapas criadas, estrelas e provas de maestria', '42 tappe d’autore, stelle e prove di maestria'],
    ['Daily board', 'Tablero diario', 'Tagesbrett', 'Plateau du jour', 'Tabuleiro diário', 'Tavola del giorno'],
    ['One shared ruleset per day', 'Un reglamento compartido por día', 'Ein gemeinsames Regelwerk pro Tag', 'Une règle partagée par jour', 'Um conjunto de regras por dia', 'Un regolamento condiviso al giorno'],
    ['Challenges', 'Desafíos', 'Herausforderungen', 'Défis', 'Desafios', 'Sfide'],
    ['Taller grids, five in a row, three players', 'Cuadrículas más altas, cinco en línea, tres jugadores', 'Höhere Raster, fünf in einer Reihe, drei Spieler', 'Grilles plus hautes, cinq alignés, trois joueurs', 'Grades mais altas, cinco em linha, três jogadores', 'Griglie più alte, cinque in fila, tre giocatori'],
    ['Learn', 'Aprender', 'Lernen', 'Apprendre', 'Aprender', 'Impara'],
    ['Six short lessons', 'Seis lecciones cortas', 'Sechs kurze Lektionen', 'Six courtes leçons', 'Seis lições curtas', 'Sei brevi lezioni'],
    ['{games} games · {wins} wins · {stars} stars', '{games} partidas · {wins} victorias · {stars} estrellas', '{games} Partien · {wins} Siege · {stars} Sterne', '{games} parties · {wins} victoires · {stars} étoiles', '{games} partidas · {wins} vitórias · {stars} estrelas', '{games} partite · {wins} vittorie · {stars} stelle'],
    ['New player — start with Learn or Play.', 'Jugador nuevo: empieza por Aprender o Jugar.', 'Neu hier – fang mit Lernen oder Spielen an.', 'Nouveau joueur — commencez par Apprendre ou Jouer.', 'Jogador novo — comece por Aprender ou Jogar.', 'Nuovo giocatore: inizia da Impara o Gioca.'],
    ['Resume {name}', 'Reanudar {name}', '{name} fortsetzen', 'Reprendre {name}', 'Retomar {name}', 'Riprendi {name}'],
    ['Resume game', 'Reanudar partida', 'Partie fortsetzen', 'Reprendre la partie', 'Retomar partida', 'Riprendi partita'],

    // ---- mode screens
    ['Pick an opponent. Undo and hints are available; nothing here is ranked.', 'Elige un rival. Deshacer y pistas están disponibles; nada de esto es clasificatorio.', 'Wähle einen Gegner. Rückgängig und Tipps sind verfügbar; nichts hier wird gewertet.', 'Choisissez un adversaire. Annulation et indices disponibles ; rien n’est classé ici.', 'Escolha um oponente. Desfazer e dicas disponíveis; nada aqui conta para ranking.', 'Scegli un avversario. Annulla e suggerimenti disponibili; qui niente è classificato.'],
    ['Back', 'Volver', 'Zurück', 'Retour', 'Voltar', 'Indietro'],
    ['Stars come from winning and from winning under par. Mastery stages (outlined) must be won before the stages after them open.', 'Las estrellas se ganan venciendo y venciendo bajo el par. Las etapas de maestría (con borde) deben ganarse antes de que se abran las siguientes.', 'Sterne gibt es für Siege und für Siege unter Par. Meisteretappen (umrandet) müssen gewonnen werden, bevor die folgenden aufgehen.', 'Les étoiles viennent des victoires et des victoires sous le par. Les étapes de maîtrise (encadrées) doivent être gagnées avant que les suivantes s’ouvrent.', 'Estrelas vêm de vencer e de vencer abaixo do par. Etapas de maestria (com contorno) precisam ser vencidas para liberar as seguintes.', 'Le stelle arrivano vincendo e vincendo sotto il par. Le tappe di maestria (bordate) vanno vinte prima che si aprano le successive.'],
    ['Locked', 'Bloqueada', 'Gesperrt', 'Verrouillée', 'Bloqueada', 'Bloccata'],
    ['Each challenge states its rules and assists before you commit.', 'Cada desafío muestra sus reglas y ayudas antes de que empieces.', 'Jede Herausforderung nennt ihre Regeln und Hilfen, bevor du loslegst.', 'Chaque défi annonce ses règles et ses aides avant que vous vous lanciez.', 'Cada desafio mostra regras e ajudas antes de você começar.', 'Ogni sfida dichiara regole e aiuti prima che tu inizi.'],
    ['best {n}', 'récord {n}', 'Bestwert {n}', 'record {n}', 'recorde {n}', 'record {n}'],
    ['Short lessons, replayable at any time.', 'Lecciones cortas, repetibles en cualquier momento.', 'Kurze Lektionen, jederzeit wiederholbar.', 'De courtes leçons, à rejouer quand vous voulez.', 'Lições curtas, que podem ser refeitas a qualquer momento.', 'Lezioni brevi, ripetibili quando vuoi.'],
    ['done', 'hecha', 'erledigt', 'faite', 'feita', 'fatta'],
    ['You already played today’s board. Replaying for practice.', 'Ya jugaste el tablero de hoy. Se repite como práctica.', 'Du hast das heutige Brett schon gespielt. Wiederholung als Training.', 'Vous avez déjà joué le plateau du jour. Partie rejouée pour l’entraînement.', 'Você já jogou o tabuleiro de hoje. Repetindo como treino.', 'Hai già giocato la tavola di oggi. La rigiochi per allenamento.'],

    // ---- play screen
    ['Your turn', 'Tu turno', 'Du bist dran', 'À vous', 'Sua vez', 'Tocca a te'],
    ['{name}’s turn', 'Turno de {name}', '{name} ist dran', 'Au tour de {name}', 'Vez de {name}', 'Turno di {name}'],
    ['{name} is thinking…', '{name} está pensando…', '{name} denkt nach …', '{name} réfléchit…', '{name} está pensando…', '{name} sta pensando…'],
    ['Columns — choose one to drop a disc', 'Columnas: elige una para soltar una ficha', 'Spalten – wähle eine, um eine Scheibe fallen zu lassen', 'Colonnes — choisissez-en une pour lâcher un jeton', 'Colunas — escolha uma para soltar uma ficha', 'Colonne: scegline una per lasciare cadere un disco'],
    ['Undo', 'Deshacer', 'Rückgängig', 'Annuler', 'Desfazer', 'Annulla'],
    ['Hint', 'Pista', 'Tipp', 'Indice', 'Dica', 'Suggerimento'],
    ['Restart', 'Reiniciar', 'Neustart', 'Recommencer', 'Reiniciar', 'Ricomincia'],
    ['Pause', 'Pausa', 'Pause', 'Pause', 'Pausar', 'Pausa'],
    ['Time left', 'Tiempo restante', 'Restzeit', 'Temps restant', 'Tempo restante', 'Tempo rimasto'],
    ['Time', 'Tiempo', 'Zeit', 'Temps', 'Tempo', 'Tempo'],
    ['Drops left', 'Fichas restantes', 'Scheiben übrig', 'Jetons restants', 'Fichas restantes', 'Dischi rimasti'],
    ['Drops', 'Fichas', 'Scheiben', 'Jetons', 'Fichas', 'Dischi'],
    ['Par', 'Par', 'Par', 'Par', 'Par', 'Par'],
    ['Connect {n} of your discs in a row.', 'Conecta {n} de tus fichas en línea.', 'Bringe {n} deiner Scheiben in eine Reihe.', 'Alignez {n} de vos jetons.', 'Alinhe {n} das suas fichas.', 'Allinea {n} dei tuoi dischi.'],
    ['Within {n} of your drops.', 'Con {n} fichas tuyas como máximo.', 'Mit höchstens {n} eigenen Scheiben.', 'En {n} de vos jetons au plus.', 'Com no máximo {n} fichas suas.', 'Entro {n} dei tuoi dischi.'],
    ['Within {n} seconds.', 'En {n} segundos.', 'Innerhalb von {n} Sekunden.', 'En {n} secondes.', 'Em {n} segundos.', 'Entro {n} secondi.'],
    ['Column {n}, {filled} of {rows} filled, drops into row {row}', 'Columna {n}, {filled} de {rows} llenas, cae en la fila {row}', 'Spalte {n}, {filled} von {rows} belegt, fällt in Reihe {row}', 'Colonne {n}, {filled} sur {rows} remplies, tombe en rangée {row}', 'Coluna {n}, {filled} de {rows} ocupadas, cai na linha {row}', 'Colonna {n}, {filled} su {rows} piene, cade nella riga {row}'],
    ['Column {n}, {filled} of {rows} filled, full', 'Columna {n}, {filled} de {rows} llenas, completa', 'Spalte {n}, {filled} von {rows} belegt, voll', 'Colonne {n}, {filled} sur {rows} remplies, pleine', 'Coluna {n}, {filled} de {rows} ocupadas, cheia', 'Colonna {n}, {filled} su {rows} piene, piena'],
    ['Column {n}, {filled} of {rows} filled, sealed', 'Columna {n}, {filled} de {rows} llenas, sellada', 'Spalte {n}, {filled} von {rows} belegt, gesperrt', 'Colonne {n}, {filled} sur {rows} remplies, scellée', 'Coluna {n}, {filled} de {rows} ocupadas, selada', 'Colonna {n}, {filled} su {rows} piene, sigillata'],
    ['(hint)', '(pista)', '(Tipp)', '(indice)', '(dica)', '(suggerimento)'],
    ['Row {n}: {cells}', 'Fila {n}: {cells}', 'Reihe {n}: {cells}', 'Rangée {n} : {cells}', 'Linha {n}: {cells}', 'Riga {n}: {cells}'],
    ['empty', 'vacía', 'leer', 'vide', 'vazia', 'vuota'],
    ['Player {n}', 'Jugador {n}', 'Spieler {n}', 'Joueur {n}', 'Jogador {n}', 'Giocatore {n}'],
    ['Could not start: {error}', 'No se pudo iniciar: {error}', 'Start fehlgeschlagen: {error}', 'Démarrage impossible : {error}', 'Não foi possível iniciar: {error}', 'Impossibile avviare: {error}'],
    ['This lesson wants column {n}.', 'Esta lección pide la columna {n}.', 'Diese Lektion will Spalte {n}.', 'Cette leçon demande la colonne {n}.', 'Esta lição pede a coluna {n}.', 'Questa lezione vuole la colonna {n}.'],
    ['That column is full.', 'Esa columna está llena.', 'Diese Spalte ist voll.', 'Cette colonne est pleine.', 'Essa coluna está cheia.', 'Quella colonna è piena.'],
    ['That column is sealed this round.', 'Esa columna está sellada en esta ronda.', 'Diese Spalte ist in dieser Runde gesperrt.', 'Cette colonne est scellée pour cette manche.', 'Essa coluna está selada nesta rodada.', 'Quella colonna è sigillata in questo turno.'],
    ['That column is off the board.', 'Esa columna está fuera del tablero.', 'Diese Spalte liegt außerhalb des Bretts.', 'Cette colonne est hors du plateau.', 'Essa coluna está fora do tabuleiro.', 'Quella colonna è fuori dalla tavola.'],
    ['Not your turn yet.', 'Todavía no es tu turno.', 'Du bist noch nicht dran.', 'Ce n’est pas encore votre tour.', 'Ainda não é sua vez.', 'Non è ancora il tuo turno.'],
    ['This game is over.', 'Esta partida terminó.', 'Diese Partie ist vorbei.', 'Cette partie est terminée.', 'Esta partida acabou.', 'Questa partita è finita.'],
    ['Undo is disabled in this mode.', 'Deshacer está desactivado en este modo.', 'Rückgängig ist in diesem Modus aus.', 'L’annulation est désactivée dans ce mode.', 'Desfazer está desativado neste modo.', 'Annulla è disattivato in questa modalità.'],
    ['Nothing to undo.', 'No hay nada que deshacer.', 'Nichts rückgängig zu machen.', 'Rien à annuler.', 'Nada para desfazer.', 'Niente da annullare.'],
    ['Undid 1 drop.', 'Se deshizo 1 ficha.', '1 Scheibe zurückgenommen.', '1 jeton annulé.', '1 ficha desfeita.', 'Annullato 1 disco.'],
    ['Undid {n} drops.', 'Se deshicieron {n} fichas.', '{n} Scheiben zurückgenommen.', '{n} jetons annulés.', '{n} fichas desfeitas.', 'Annullati {n} dischi.'],
    ['Hints are disabled in this mode.', 'Las pistas están desactivadas en este modo.', 'Tipps sind in diesem Modus aus.', 'Les indices sont désactivés dans ce mode.', 'As dicas estão desativadas neste modo.', 'I suggerimenti sono disattivati in questa modalità.'],
    ['No hint available.', 'No hay pistas disponibles.', 'Kein Tipp verfügbar.', 'Aucun indice disponible.', 'Nenhuma dica disponível.', 'Nessun suggerimento disponibile.'],
    ['Hint: column {n}.', 'Pista: columna {n}.', 'Tipp: Spalte {n}.', 'Indice : colonne {n}.', 'Dica: coluna {n}.', 'Suggerimento: colonna {n}.'],

    // ---- results
    ['Game paused', 'Partida en pausa', 'Partie pausiert', 'Partie en pause', 'Partida pausada', 'Partita in pausa'],
    ['Board full — a draw', 'Tablero lleno: empate', 'Brett voll – unentschieden', 'Plateau plein — match nul', 'Tabuleiro cheio — empate', 'Tavola piena: pareggio'],
    ['You made four', '¡Hiciste cuatro!', 'Du hast vier!', 'Vous en avez aligné quatre', 'Você fez quatro', 'Hai fatto quattro'],
    ['You resigned', 'Te rendiste', 'Du hast aufgegeben', 'Vous avez abandonné', 'Você desistiu', 'Ti sei arreso'],
    ['Time up', 'Se acabó el tiempo', 'Zeit abgelaufen', 'Temps écoulé', 'Tempo esgotado', 'Tempo scaduto'],
    ['Drop budget spent', 'Fichas agotadas', 'Scheibenbudget aufgebraucht', 'Budget de jetons épuisé', 'Fichas esgotadas', 'Dischi esauriti'],
    ['{name} made four', '{name} hizo cuatro', '{name} hat vier', '{name} en a aligné quatre', '{name} fez quatro', '{name} ha fatto quattro'],
    ['Line completed', 'Línea completada', 'Linie vollendet', 'Ligne complétée', 'Linha completa', 'Linea completata'],
    ['Draw', 'Empate', 'Unentschieden', 'Match nul', 'Empate', 'Pareggio'],
    ['Under par drops', 'Fichas bajo el par', 'Scheiben unter Par', 'Jetons sous le par', 'Fichas abaixo do par', 'Dischi sotto il par'],
    ['Speed bonus', 'Bono de velocidad', 'Tempobonus', 'Bonus de vitesse', 'Bônus de velocidade', 'Bonus velocità'],
    ['Your drops', 'Tus fichas', 'Deine Scheiben', 'Vos jetons', 'Suas fichas', 'I tuoi dischi'],
    ['Score', 'Puntuación', 'Punkte', 'Score', 'Pontuação', 'Punteggio'],
    ['Next: {name}', 'Siguiente: {name}', 'Weiter: {name}', 'Suivant : {name}', 'Próxima: {name}', 'Prossima: {name}'],
    ['{headline}. Score {n}.', '{headline}. Puntuación {n}.', '{headline}. Punkte {n}.', '{headline}. Score {n}.', '{headline}. Pontuação {n}.', '{headline}. Punteggio {n}.'],
    ['Lesson complete', 'Lección completa', 'Lektion geschafft', 'Leçon terminée', 'Lição concluída', 'Lezione completata'],
    ['Lesson complete.', 'Lección completa.', 'Lektion geschafft.', 'Leçon terminée.', 'Lição concluída.', 'Lezione completata.'],
    ['Play again', 'Jugar de nuevo', 'Noch einmal', 'Rejouer', 'Jogar de novo', 'Gioca ancora'],
    ['Back to menu', 'Volver al menú', 'Zum Menü', 'Retour au menu', 'Voltar ao menu', 'Torna al menu'],

    // ---- pause
    ['Paused', 'En pausa', 'Pausiert', 'En pause', 'Pausado', 'In pausa'],
    ['Restart this board', 'Reiniciar este tablero', 'Dieses Brett neu starten', 'Recommencer ce plateau', 'Reiniciar este tabuleiro', 'Ricomincia questa tavola'],
    ['Resign', 'Rendirse', 'Aufgeben', 'Abandonner', 'Desistir', 'Arrenditi'],
    ['Leave to menu', 'Salir al menú', 'Zum Menü', 'Quitter vers le menu', 'Sair para o menu', 'Esci al menu'],

    // ---- settings
    ['Accessibility', 'Accesibilidad', 'Barrierefreiheit', 'Accessibilité', 'Acessibilidade', 'Accessibilità'],
    ['Disc colours are always reinforced by a shape: ● you, ◆ rival, ▲ third, ■ fourth.', 'Los colores de las fichas siempre van con una forma: ● tú, ◆ rival, ▲ tercero, ■ cuarto.', 'Scheibenfarben werden immer durch eine Form ergänzt: ● du, ◆ Gegner, ▲ Dritter, ■ Vierter.', 'Les couleurs des jetons sont toujours doublées d’une forme : ● vous, ◆ rival, ▲ troisième, ■ quatrième.', 'As cores das fichas sempre vêm com uma forma: ● você, ◆ rival, ▲ terceiro, ■ quarto.', 'I colori dei dischi sono sempre accompagnati da una forma: ● tu, ◆ rivale, ▲ terzo, ■ quarto.'],
    ['Data', 'Datos', 'Daten', 'Données', 'Dados', 'Dati'],
    ['Erase progress on this device', 'Borrar el progreso en este dispositivo', 'Fortschritt auf diesem Gerät löschen', 'Effacer la progression sur cet appareil', 'Apagar o progresso neste dispositivo', 'Cancella i progressi su questo dispositivo'],
    ['Erase progress on this device and in the cloud', 'Borrar el progreso en este dispositivo y en la nube', 'Fortschritt auf diesem Gerät und in der Cloud löschen', 'Effacer la progression sur cet appareil et dans le nuage', 'Apagar o progresso neste dispositivo e na nuvem', 'Cancella i progressi su questo dispositivo e nel cloud'],
    ['Erase all Fourfold progress on this device?', '¿Borrar todo el progreso de Fourfold en este dispositivo?', 'Gesamten Fourfold-Fortschritt auf diesem Gerät löschen?', 'Effacer toute la progression de Fourfold sur cet appareil ?', 'Apagar todo o progresso de Fourfold neste dispositivo?', 'Cancellare tutti i progressi di Fourfold su questo dispositivo?'],
    ['Progress erased.', 'Progreso borrado.', 'Fortschritt gelöscht.', 'Progression effacée.', 'Progresso apagado.', 'Progressi cancellati.'],
    ['Signed in as {name} · {sync}', 'Sesión iniciada como {name} · {sync}', 'Angemeldet als {name} · {sync}', 'Connecté en tant que {name} · {sync}', 'Conectado como {name} · {sync}', 'Accesso come {name} · {sync}'],
    ['Syncing…', 'Sincronizando…', 'Wird synchronisiert …', 'Synchronisation…', 'Sincronizando…', 'Sincronizzazione…'],
    ['Saving…', 'Guardando…', 'Wird gespeichert …', 'Enregistrement…', 'Salvando…', 'Salvataggio…'],
    ['Cloud saved', 'Guardado en la nube', 'In der Cloud gespeichert', 'Enregistré dans le nuage', 'Salvo na nuvem', 'Salvato nel cloud'],
    ['Cloud sync failed — will retry', 'Falló la sincronización: se reintentará', 'Cloud-Sync fehlgeschlagen – neuer Versuch folgt', 'Échec de la synchronisation — nouvel essai à venir', 'Falha na sincronização — tentaremos de novo', 'Sincronizzazione non riuscita: riproveremo'],

    // ---- engine client
    ['Modes', 'Modos', 'Modi', 'Modes', 'Modos', 'Modalità'],
    ['Options', 'Opciones', 'Optionen', 'Options', 'Opções', 'Opzioni'],
    ['Open Options', 'Abrir opciones', 'Optionen öffnen', 'Ouvrir les options', 'Abrir opções', 'Apri opzioni'],
    ['Sound, graphics, language, controls, reduced motion, high contrast and text size are in the StarHermit Options menu (F1).', 'El sonido, los gráficos, el idioma, los controles, el movimiento reducido, el alto contraste y el tamaño del texto están en el menú Opciones de StarHermit (F1).', 'Ton, Grafik, Sprache, Steuerung, reduzierte Bewegung, hoher Kontrast und Textgröße findest du im StarHermit-Menü Optionen (F1).', 'Le son, les graphismes, la langue, les commandes, le mouvement réduit, le contraste élevé et la taille du texte se trouvent dans le menu Options de StarHermit (F1).', 'Som, gráficos, idioma, controles, movimento reduzido, alto contraste e tamanho do texto ficam no menu Opções do StarHermit (F1).', 'Audio, grafica, lingua, comandi, movimento ridotto, contrasto elevato e dimensione del testo sono nel menu Opzioni di StarHermit (F1).'],
    ['Progress is stored only on this device.', 'El progreso se guarda solo en este dispositivo.', 'Der Fortschritt wird nur auf diesem Gerät gespeichert.', 'La progression est enregistrée uniquement sur cet appareil.', 'O progresso fica salvo só neste dispositivo.', 'I progressi sono salvati solo su questo dispositivo.'],
    ['Erase', 'Borrar', 'Löschen', 'Effacer', 'Apagar', 'Cancella'],
    ['Cancel', 'Cancelar', 'Abbrechen', 'Annuler', 'Cancelar', 'Annulla'],
    ['That move is not allowed.', 'Esa jugada no está permitida.', 'Dieser Zug ist nicht erlaubt.', 'Ce coup n’est pas permis.', 'Essa jogada não é permitida.', 'Questa mossa non è consentita.'],
    ['Gamepad: the D-pad moves between columns, A drops, X hints, Y undoes, Start pauses.', 'Mando: la cruceta cambia de columna, A suelta, X da una pista, Y deshace, Start pausa.', 'Gamepad: Das Steuerkreuz wechselt die Spalte, A lässt fallen, X gibt einen Tipp, Y macht rückgängig, Start pausiert.', 'Manette : la croix change de colonne, A lâche, X donne un indice, Y annule, Start met en pause.', 'Controle: o direcional troca de coluna, A solta, X dá uma dica, Y desfaz, Start pausa.', 'Gamepad: la croce direzionale cambia colonna, A lascia cadere, X dà un suggerimento, Y annulla, Start mette in pausa.'],

    // ---- help
    ['How to play', 'Cómo se juega', 'So wird gespielt', 'Comment jouer', 'Como jogar', 'Come si gioca'],
    ['Players take turns dropping a disc into a column. Each disc falls to the lowest free cell. The first player with four of their own discs in a straight line — horizontal, vertical, or diagonal — wins. If every cell fills with no line, it is a draw.', 'Los jugadores se turnan para soltar una ficha en una columna. Cada ficha cae a la casilla libre más baja. Gana el primero que tenga cuatro fichas propias en línea recta: horizontal, vertical o diagonal. Si se llenan todas las casillas sin línea, es empate.', 'Die Spieler lassen abwechselnd eine Scheibe in eine Spalte fallen. Jede Scheibe landet im tiefsten freien Feld. Wer zuerst vier eigene Scheiben in einer geraden Linie hat – waagrecht, senkrecht oder diagonal –, gewinnt. Ist das Brett ohne Linie voll, ist es unentschieden.', 'Les joueurs lâchent à tour de rôle un jeton dans une colonne. Chaque jeton tombe dans la case libre la plus basse. Le premier qui aligne quatre de ses jetons — à l’horizontale, à la verticale ou en diagonale — gagne. Si toutes les cases se remplissent sans ligne, c’est un match nul.', 'Os jogadores se revezam soltando uma ficha numa coluna. Cada ficha cai na casa livre mais baixa. Vence o primeiro a ter quatro fichas suas em linha reta — horizontal, vertical ou diagonal. Se todas as casas encherem sem linha, é empate.', 'I giocatori a turno lasciano cadere un disco in una colonna. Ogni disco cade nella casella libera più bassa. Vince il primo con quattro dischi propri in linea retta: orizzontale, verticale o diagonale. Se tutte le caselle si riempiono senza linea, è pareggio.'],
    ['Controls', 'Controles', 'Steuerung', 'Commandes', 'Controles', 'Comandi'],
    ['Click or tap a column to drop.', 'Haz clic o toca una columna para soltar.', 'Klicke oder tippe auf eine Spalte, um fallen zu lassen.', 'Cliquez ou touchez une colonne pour lâcher.', 'Clique ou toque numa coluna para soltar.', 'Clicca o tocca una colonna per lasciare cadere.'],
    ['← → move between columns; Enter or Space drops.', '← → cambian de columna; Enter o Espacio suelta.', '← → wechseln die Spalte; Enter oder Leertaste lässt fallen.', '← → changent de colonne ; Entrée ou Espace lâche.', '← → trocam de coluna; Enter ou Espaço solta.', '← → cambiano colonna; Invio o Spazio lascia cadere.'],
    ['1–9 drop straight into that column number.', '1–9 sueltan directamente en esa columna.', '1–9 lassen direkt in diese Spalte fallen.', '1–9 lâchent directement dans cette colonne.', '1–9 soltam direto naquela coluna.', '1–9 lasciano cadere direttamente in quella colonna.'],
    ['U undo, H hint, R restart, P or Esc pause.', 'U deshacer, H pista, R reiniciar, P o Esc pausa.', 'U rückgängig, H Tipp, R Neustart, P oder Esc Pause.', 'U annuler, H indice, R recommencer, P ou Échap pause.', 'U desfazer, H dica, R reiniciar, P ou Esc pausar.', 'U annulla, H suggerimento, R ricomincia, P o Esc pausa.'],
    ['Scoring', 'Puntuación', 'Wertung', 'Score', 'Pontuação', 'Punteggio'],
    ["A win is worth 1000. Winning under the stage's par drops adds 25 per drop saved, and beating a par time adds 5 per second saved. A draw is worth 300.", 'Una victoria vale 1000. Ganar bajo el par de fichas de la etapa suma 25 por ficha ahorrada, y superar el tiempo par suma 5 por segundo ahorrado. Un empate vale 300.', 'Ein Sieg zählt 1000. Ein Sieg unter dem Scheiben-Par der Etappe bringt 25 pro gesparter Scheibe, eine Zeit unter Par 5 pro gesparter Sekunde. Ein Unentschieden zählt 300.', 'Une victoire vaut 1000. Gagner sous le par de jetons de l’étape ajoute 25 par jeton économisé, et battre le temps par ajoute 5 par seconde gagnée. Un nul vaut 300.', 'Uma vitória vale 1000. Vencer abaixo do par de fichas da etapa soma 25 por ficha poupada, e bater o tempo par soma 5 por segundo poupado. Um empate vale 300.', 'Una vittoria vale 1000. Vincere sotto il par di dischi della tappa aggiunge 25 per disco risparmiato, e battere il tempo par aggiunge 5 per secondo risparmiato. Un pareggio vale 300.']
  ];

  var FULL = ['es-419', 'de-DE', 'fr-FR', 'pt-BR', 'it-IT'];
  var S = root.FF_STRINGS = root.FF_STRINGS || {};
  S['en-US'] = {};
  S['en-GB'] = {};
  S['es-ES'] = {
    'You already played today’s board. Replaying for practice.': 'Ya has jugado el tablero de hoy. Se repite como práctica.',
    'This game is over.': 'Esta partida ha terminado.'
  };
  S['fr-CA'] = {};
  FULL.forEach(function (l, i) {
    var t = S[l] = S[l] || {};
    ROWS.forEach(function (r) { t[r[0]] = r[i + 1]; });
  });
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
