/* Fourfold — localized strings for the StarHermit account surface (sign-in,
 * invite link, sign-out notice). Locale chosen from navigator.languages with
 * the same rules as the Graphics panel. Exposes window.FFPlatformStrings(). */
(function (root) {
  'use strict';
  var EN = {
    signIn: 'Sign in with StarHermit', invite: 'Invite a friend',
    inviteCopied: 'Invite link copied to clipboard.', inviteFailed: 'Could not copy the invite link.',
    signedOut: 'Signed out of StarHermit. Progress keeps saving on this device.'
  };
  var STRINGS = {
    'en-US': EN, 'en-GB': EN,
    'es-419': { signIn: 'Iniciar sesión con StarHermit', invite: 'Invitar a un amigo', inviteCopied: 'Enlace de invitación copiado al portapapeles.', inviteFailed: 'No se pudo copiar el enlace de invitación.', signedOut: 'Se cerró la sesión de StarHermit. El progreso se sigue guardando en este dispositivo.' },
    'es-ES': { signIn: 'Iniciar sesión con StarHermit', invite: 'Invitar a un amigo', inviteCopied: 'Enlace de invitación copiado al portapapeles.', inviteFailed: 'No se ha podido copiar el enlace de invitación.', signedOut: 'Se ha cerrado la sesión de StarHermit. El progreso se sigue guardando en este dispositivo.' },
    'de-DE': { signIn: 'Mit StarHermit anmelden', invite: 'Freund einladen', inviteCopied: 'Einladungslink in die Zwischenablage kopiert.', inviteFailed: 'Einladungslink konnte nicht kopiert werden.', signedOut: 'Von StarHermit abgemeldet. Der Fortschritt wird weiter auf diesem Gerät gespeichert.' },
    'fr-FR': { signIn: 'Se connecter avec StarHermit', invite: 'Inviter un ami', inviteCopied: 'Lien d’invitation copié dans le presse-papiers.', inviteFailed: 'Impossible de copier le lien d’invitation.', signedOut: 'Déconnecté de StarHermit. La progression reste enregistrée sur cet appareil.' },
    'fr-CA': { signIn: 'Se connecter avec StarHermit', invite: 'Inviter un ami', inviteCopied: 'Lien d’invitation copié dans le presse-papiers.', inviteFailed: 'Impossible de copier le lien d’invitation.', signedOut: 'Déconnecté de StarHermit. La progression reste enregistrée sur cet appareil.' },
    'pt-BR': { signIn: 'Entrar com StarHermit', invite: 'Convidar um amigo', inviteCopied: 'Link de convite copiado para a área de transferência.', inviteFailed: 'Não foi possível copiar o link de convite.', signedOut: 'Você saiu do StarHermit. O progresso continua salvo neste dispositivo.' },
    'it-IT': { signIn: 'Accedi con StarHermit', invite: 'Invita un amico', inviteCopied: 'Link d’invito copiato negli appunti.', inviteFailed: 'Impossibile copiare il link d’invito.', signedOut: 'Disconnesso da StarHermit. I progressi restano salvati su questo dispositivo.' }
  };
  function pick(tags) {
    for (var i = 0; i < tags.length; i++) {
      var t = String(tags[i]);
      for (var k in STRINGS) if (k.toLowerCase() === t.toLowerCase()) return k;
      var lang = t.slice(0, 2).toLowerCase();
      if (lang === 'en') return /^en(-us)?$/i.test(t) ? 'en-US' : 'en-GB';
      if (lang === 'es') return /^es(-es)?$/i.test(t) ? 'es-ES' : 'es-419';
      if (lang === 'fr') return /-ca$/i.test(t) ? 'fr-CA' : 'fr-FR';
      if (lang === 'pt') return 'pt-BR';
      if (lang === 'de') return 'de-DE';
      if (lang === 'it') return 'it-IT';
    }
    return 'en-US';
  }
  root.FFPlatformStrings = function (tags) {
    var nav = root.navigator || {};
    var list = tags || (nav.languages && nav.languages.length ? nav.languages : [nav.language || 'en-US']);
    var table = STRINGS[pick(list)], out = {};
    for (var key in EN) out[key] = table[key] || EN[key];
    return out;
  };
  root.FFPlatformStrings.LOCALES = Object.keys(STRINGS);
})(typeof self !== 'undefined' ? self : this);
